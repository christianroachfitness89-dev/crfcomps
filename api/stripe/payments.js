/**
 * GET /api/stripe/payments
 *
 * Returns Stripe invoices, revenue totals, and outstanding/unmatched invoices.
 * Supports month/year filtering so you can reconcile a specific period.
 *
 * Query params:
 *   month            1-12 (defaults to current month)
 *   year             e.g. 2026 (defaults to current year)
 *   outstanding=true filter to invoices not yet matched in Supabase
 *
 * Requires admin authentication. Keys are never sent to the browser.
 */

const Stripe = require('stripe');
const { verifyAdmin, allowCors } = require('../_utils');

function toDollars(cents) {
  return (cents || 0) / 100;
}

function getMonthBounds(month, year) {
  const m = parseInt(month, 10);
  const y = parseInt(year, 10);
  const start = new Date(y, m - 1, 1);
  const end = new Date(y, m, 1);
  return {
    start: Math.floor(start.getTime() / 1000),
    end: Math.floor(end.getTime() / 1000),
    label: start.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
  };
}

function invoiceStatusLabel(invoice) {
  if (invoice.status === 'paid') return 'Paid';
  if (invoice.status === 'open') return 'Outstanding';
  if (invoice.status === 'draft') return 'Draft';
  if (invoice.status === 'uncollectible') return 'Uncollectible';
  if (invoice.status === 'void') return 'Void';
  return invoice.status || 'Unknown';
}

function formatInvoice(invoice) {
  const customer = invoice.customer && typeof invoice.customer === 'object'
    ? invoice.customer
    : null;

  return {
    id: invoice.id,
    number: invoice.number || null,
    amount: toDollars(invoice.total),
    amount_due: toDollars(invoice.amount_due || 0),
    amount_paid: toDollars(invoice.amount_paid || 0),
    currency: (invoice.currency || '').toUpperCase(),
    status: invoice.status,
    label: invoiceStatusLabel(invoice),
    paid: invoice.status === 'paid',
    created_at: new Date(invoice.created * 1000).toISOString(),
    due_date: invoice.due_date ? new Date(invoice.due_date * 1000).toISOString() : null,
    paid_at: invoice.status === 'paid' && invoice.status_transitions && invoice.status_transitions.paid_at
      ? new Date(invoice.status_transitions.paid_at * 1000).toISOString()
      : null,
    customer: customer
      ? (customer.name || customer.email || customer.id)
      : (invoice.customer_email || null),
    description: invoice.description || invoice.lines && invoice.lines.data && invoice.lines.data[0] && invoice.lines.data[0].description || null,
    invoice_pdf: invoice.invoice_pdf || null,
    hosted_invoice_url: invoice.hosted_invoice_url || null,
    payment_intent: invoice.payment_intent || null,
    subscription: invoice.subscription || null
  };
}

async function fetchInvoices(stripe, params) {
  const invoices = [];
  let startingAfter = null;
  let page = 0;

  while (page < 25) {
    const pageParams = { ...params, limit: 100 };
    if (startingAfter) pageParams.starting_after = startingAfter;

    const list = await stripe.invoices.list(pageParams);
    invoices.push(...list.data);
    if (!list.has_more) break;
    startingAfter = list.data[list.data.length - 1].id;
    page++;
  }

  return invoices;
}

async function matchInvoices(invoices, supabase) {
  // Load local invoices that have a Stripe invoice ID or a Stripe-looking reference.
  const { data: localInvoices, error: invError } = await supabase
    .from('invoices')
    .select('id, stripe_invoice_id, reference, amount, issued_at, paid_at');

  if (invError) {
    console.error('matchInvoices invoice lookup error:', invError);
  }

  // Also load local payments that may be linked by payment_intent/charge.
  const { data: localPayments, error: payError } = await supabase
    .from('payments')
    .select('id, stripe_charge_id, reference, amount, paid_at');

  if (payError) {
    console.error('matchInvoices payment lookup error:', payError);
  }

  const matchedIds = new Set();
  const matches = [];

  function recordMatch(stripeId, localId, localTable) {
    if (!matchedIds.has(stripeId)) {
      matchedIds.add(stripeId);
      matches.push({ stripe_invoice_id: stripeId, local_id: localId, local_table: localTable });
    }
  }

  (localInvoices || []).forEach(function (i) {
    const key = i.stripe_invoice_id || (i.reference || '').trim();
    if (!key) return;

    const direct = invoices.find(function (inv) { return inv.id === key; });
    if (direct) {
      recordMatch(direct.id, i.id, 'invoices');
      return;
    }

    if (i.issued_at) {
      const issueDate = new Date(i.issued_at).toISOString().split('T')[0];
      const fallback = invoices.find(function (inv) {
        const invDate = new Date(inv.created * 1000).toISOString().split('T')[0];
        return !matchedIds.has(inv.id) &&
          invDate === issueDate &&
          Math.abs(toDollars(inv.total) - Number(i.amount || 0)) < 0.01;
      });
      if (fallback) recordMatch(fallback.id, i.id, 'invoices');
    }
  });

  (localPayments || []).forEach(function (p) {
    const key = p.stripe_charge_id || (p.reference || '').trim();
    if (!key) return;

    // Payment may be linked via payment_intent on the invoice.
    const direct = invoices.find(function (inv) {
      return inv.payment_intent === key;
    });
    if (direct) {
      recordMatch(direct.id, p.id, 'payments');
    }
  });

  return { matched: matchedIds, matches };
}

module.exports = allowCors(async function (req, res) {
  const auth = await verifyAdmin(req);
  if (auth.error) {
    res.statusCode = auth.status;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: auth.error }));
    return;
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Stripe is not configured. Add STRIPE_SECRET_KEY to your environment variables.' }));
    return;
  }

  const stripe = new Stripe(stripeKey, { apiVersion: '2024-06-20' });

  const now = new Date();
  const month = req.query.month || (now.getMonth() + 1);
  const year = req.query.year || now.getFullYear();
  const bounds = getMonthBounds(month, year);
  const outstandingOnly = req.query.outstanding === 'true' || req.query.outstanding === '1';
  const limit = Math.min(parseInt(req.query.limit || '50', 10), 100);

  try {
    const monthInvoices = await fetchInvoices(stripe, {
      created: { gte: bounds.start, lt: bounds.end }
    });

    // For the recent list, return the most recent invoices across all time (up to limit).
    const recentList = await stripe.invoices.list({
      limit,
      expand: ['data.customer']
    });

    // Match against Supabase records.
    const { matched: matchedIds } = await matchInvoices(
      outstandingOnly ? monthInvoices : recentList.data,
      auth.supabase
    );

    const allFormatted = (outstandingOnly ? monthInvoices : recentList.data).map(formatInvoice).map(function (inv) {
      return { ...inv, matched: matchedIds.has(inv.id) };
    });

    const displayed = outstandingOnly
      ? allFormatted.filter(function (inv) { return !inv.matched && inv.status !== 'void' && inv.status !== 'draft'; })
      : allFormatted;

    const revenueMonth = monthInvoices
      .filter(function (inv) { return inv.status === 'paid'; })
      .reduce(function (sum, inv) { return sum + (inv.amount_paid || inv.total); }, 0);

    const outstandingMonth = monthInvoices
      .filter(function (inv) { return inv.status === 'open'; })
      .reduce(function (sum, inv) { return sum + (inv.amount_due || 0); }, 0);

    const outstandingCount = displayed.filter(function (inv) {
      return !inv.matched && inv.status !== 'void' && inv.status !== 'draft';
    }).length;

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      month_label: bounds.label,
      month: parseInt(month, 10),
      year: parseInt(year, 10),
      invoices: displayed,
      revenue_month: toDollars(revenueMonth),
      outstanding_month: toDollars(outstandingMonth),
      outstanding_count: outstandingCount,
      currency: monthInvoices[0] ? monthInvoices[0].currency.toUpperCase() : 'AUD'
    }));
  } catch (err) {
    console.error('Stripe invoices error:', err);
    let message = err.message || 'Stripe request failed';
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: message }));
  }
});
