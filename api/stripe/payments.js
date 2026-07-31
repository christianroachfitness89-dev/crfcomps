/**
 * GET /api/stripe/payments
 *
 * Returns Stripe invoices and revenue metrics for a selected period.
 * Supports month/year/period filtering and status filtering.
 *
 * Query params:
 *   period           month | quarter | year (defaults to month)
 *   month            1-12 (defaults to current month)
 *   year             e.g. 2026 (defaults to current year)
 *   status           all | paid | open | overdue (defaults to all)
 *   customer         search string for customer name/email
 *   limit            max invoices to return (defaults to 100)
 *
 * Requires admin authentication. Keys are never sent to the browser.
 */

const Stripe = require('stripe');
const { verifyAdmin, allowCors } = require('../_utils');

function toDollars(cents) {
  return (cents || 0) / 100;
}

function parsePeriod(req) {
  const now = new Date();
  const period = (req.query.period || 'month').toLowerCase();
  const rawMonth = parseInt(req.query.month || (now.getMonth() + 1), 10);
  const rawYear = parseInt(req.query.year || now.getFullYear(), 10);

  const month = Math.max(1, Math.min(12, rawMonth));
  const year = rawYear;

  let start, end, label;

  if (period === 'year') {
    start = new Date(year, 0, 1);
    end = new Date(year + 1, 0, 1);
    label = String(year);
  } else if (period === 'quarter') {
    const quarter = Math.floor((month - 1) / 3);
    start = new Date(year, quarter * 3, 1);
    end = new Date(year, (quarter + 1) * 3, 1);
    label = 'Q' + (quarter + 1) + ' ' + year;
  } else {
    start = new Date(year, month - 1, 1);
    end = new Date(year, month, 1);
    label = start.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  }

  return {
    period,
    month,
    year,
    start: Math.floor(start.getTime() / 1000),
    end: Math.floor(end.getTime() / 1000),
    label
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

function isOverdue(invoice) {
  if (invoice.status !== 'open') return false;
  if (!invoice.due_date) return false;
  return invoice.due_date * 1000 < Date.now();
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
    overdue: isOverdue(invoice),
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

async function fetchAll(stripe, method, params) {
  const items = [];
  let startingAfter = null;
  let page = 0;

  while (page < 25) {
    const pageParams = { ...params, limit: 100 };
    if (startingAfter) pageParams.starting_after = startingAfter;

    const list = await stripe[method].list(pageParams);
    items.push(...list.data);
    if (!list.has_more) break;
    startingAfter = list.data[list.data.length - 1].id;
    page++;
  }

  return items;
}

async function matchInvoices(invoices, supabase) {
  try {
    const { data: localInvoices } = await supabase
      .from('invoices')
      .select('id, stripe_invoice_id, reference, amount, issued_at, paid_at');

    const { data: localPayments } = await supabase
      .from('payments')
      .select('id, stripe_charge_id, reference, amount, paid_at');

    const matchedIds = new Set();

    (localInvoices || []).forEach(function (i) {
      const key = i.stripe_invoice_id || (i.reference || '').trim();
      if (!key) return;
      const direct = invoices.find(function (inv) { return inv.id === key; });
      if (direct) matchedIds.add(direct.id);
    });

    (localPayments || []).forEach(function (p) {
      const key = p.stripe_charge_id || (p.reference || '').trim();
      if (!key) return;
      const direct = invoices.find(function (inv) { return inv.payment_intent === key; });
      if (direct) matchedIds.add(direct.id);
    });

    return matchedIds;
  } catch (err) {
    console.error('matchInvoices error:', err);
    return new Set();
  }
}

function computeMetrics(invoices, refunds, failedPayments) {
  const now = Date.now();
  const totalInvoiced = invoices.reduce(function (sum, inv) { return sum + (inv.total || 0); }, 0);
  const invoiceCount = invoices.length;

  const paidInvoices = invoices.filter(function (inv) { return inv.status === 'paid'; });
  const revenueCents = paidInvoices.reduce(function (sum, inv) { return sum + (inv.amount_paid || inv.total || 0); }, 0);

  const openInvoices = invoices.filter(function (inv) { return inv.status === 'open'; });
  const outstandingCents = openInvoices.reduce(function (sum, inv) { return sum + (inv.amount_due || 0); }, 0);

  const overdueCents = openInvoices
    .filter(function (inv) { return inv.due_date && inv.due_date * 1000 < now; })
    .reduce(function (sum, inv) { return sum + (inv.amount_due || 0); }, 0);

  const refundCents = (refunds || []).reduce(function (sum, r) { return sum + (r.amount || 0); }, 0);
  const netRevenueCents = Math.max(0, revenueCents - refundCents);

  const failedCount = (failedPayments || []).length;

  const payingCustomers = new Set();
  paidInvoices.forEach(function (inv) {
    const customer = inv.customer && typeof inv.customer === 'object'
      ? (inv.customer.id || inv.customer.email)
      : (inv.customer_email || inv.customer);
    if (customer) payingCustomers.add(customer);
  });

  return {
    revenue: toDollars(revenueCents),
    outstanding: toDollars(outstandingCents),
    overdue: toDollars(overdueCents),
    net_revenue: toDollars(netRevenueCents),
    refunds: toDollars(refundCents),
    failed_payments: failedCount,
    paying_customers: payingCustomers.size,
    invoice_count: invoiceCount,
    average_invoice_value: invoiceCount ? toDollars(Math.round(totalInvoiced / invoiceCount)) : 0,
    total_invoiced: toDollars(totalInvoiced)
  };
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
  const bounds = parsePeriod(req);
  const statusFilter = (req.query.status || 'all').toLowerCase();
  const customerQuery = (req.query.customer || '').toLowerCase().trim();
  const limit = Math.min(parseInt(req.query.limit || '100', 10), 250);

  try {
    const [invoices, refunds, failedPayments] = await Promise.all([
      fetchAll(stripe, 'invoices', {
        created: { gte: bounds.start, lt: bounds.end },
        expand: ['data.customer']
      }),
      fetchAll(stripe, 'refunds', {
        created: { gte: bounds.start, lt: bounds.end }
      }),
      fetchAll(stripe, 'paymentIntents', {
        created: { gte: bounds.start, lt: bounds.end }
      }).then(function (list) {
        return list.filter(function (pi) { return pi.status === 'requires_payment_method'; });
      })
    ]);

    const matchedIds = await matchInvoices(invoices, auth.supabase);

    let formatted = invoices.map(formatInvoice).map(function (inv) {
      return { ...inv, matched: matchedIds.has(inv.id) };
    });

    if (statusFilter === 'paid') {
      formatted = formatted.filter(function (inv) { return inv.status === 'paid'; });
    } else if (statusFilter === 'open') {
      formatted = formatted.filter(function (inv) { return inv.status === 'open'; });
    } else if (statusFilter === 'overdue') {
      formatted = formatted.filter(function (inv) { return inv.overdue; });
    }

    if (customerQuery) {
      formatted = formatted.filter(function (inv) {
        return (inv.customer || '').toLowerCase().includes(customerQuery);
      });
    }

    const metrics = computeMetrics(invoices, refunds, failedPayments);

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      period: bounds.period,
      month: bounds.month,
      year: bounds.year,
      label: bounds.label,
      currency: invoices[0] ? invoices[0].currency.toUpperCase() : 'AUD',
      invoices: formatted.slice(0, limit),
      invoice_count_total: invoices.length,
      metrics: metrics
    }));
  } catch (err) {
    console.error('Stripe payments error:', err);
    let message = err.message || 'Stripe request failed';
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: message }));
  }
});
