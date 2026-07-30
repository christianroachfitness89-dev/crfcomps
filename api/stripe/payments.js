/**
 * GET /api/stripe/payments
 *
 * Returns recent Stripe charges, revenue totals, and unmatched/outstanding charges.
 * Requires admin authentication. Keys are never sent to the browser.
 */

const Stripe = require('stripe');
const { verifyAdmin, allowCors } = require('../_utils');

function toDollars(cents) {
  return (cents || 0) / 100;
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function daysAgo(date, n) {
  return new Date(date.getTime() - n * 24 * 60 * 60 * 1000);
}

function chargeStatusLabel(charge) {
  if (charge.refunded) return 'refunded';
  if (charge.status === 'succeeded' || charge.paid) return 'paid';
  return charge.status || 'unknown';
}

function isPaid(charge) {
  return charge.paid && charge.status === 'succeeded' && !charge.refunded;
}

async function fetchAllCharges(stripe, params) {
  const charges = [];
  let startingAfter = null;
  let page = 0;

  while (page < 25) {
    const pageParams = { ...params, limit: 100 };
    if (startingAfter) pageParams.starting_after = startingAfter;

    const list = await stripe.charges.list(pageParams);
    charges.push(...list.data);
    if (!list.has_more) break;
    startingAfter = list.data[list.data.length - 1].id;
    page++;
  }

  return charges;
}

function sumRevenue(charges) {
  const cents = charges.reduce(function (sum, charge) {
    if (isPaid(charge)) return sum + (charge.amount - (charge.amount_refunded || 0));
    return sum;
  }, 0);
  return toDollars(cents);
}

function formatCharge(charge) {
  const customer = charge.customer && typeof charge.customer === 'object'
    ? charge.customer
    : null;
  return {
    id: charge.id,
    amount: toDollars(charge.amount),
    currency: (charge.currency || '').toUpperCase(),
    status: charge.status,
    label: chargeStatusLabel(charge),
    paid: charge.paid,
    refunded: charge.refunded,
    amount_refunded: toDollars(charge.amount_refunded || 0),
    created_at: new Date(charge.created * 1000).toISOString(),
    customer: customer
      ? (customer.name || customer.email || customer.id)
      : (charge.billing_details && charge.billing_details.name) || null,
    description: charge.description || null,
    receipt_url: charge.receipt_url || null
  };
}

async function matchCharges(charges, supabase) {
  // Load local payments that have a Stripe charge ID or a Stripe-looking reference.
  const { data: localPayments, error } = await supabase
    .from('payments')
    .select('id, stripe_charge_id, reference, amount, paid_at');

  if (error) {
    console.error('matchCharges payments lookup error:', error);
    return { matched: new Set(), matches: [] };
  }

  const matchedIds = new Set();
  const matches = [];

  localPayments.forEach(function (p) {
    const key = p.stripe_charge_id || (p.reference || '').trim();
    if (!key) return;

    // Direct ID match
    const direct = charges.find(function (c) { return c.id === key; });
    if (direct) {
      matchedIds.add(direct.id);
      matches.push({ stripe_charge_id: direct.id, local_payment_id: p.id });
      return;
    }

    // Fallback: match by amount + same-day paid_at
    if (p.paid_at) {
      const paidDate = new Date(p.paid_at).toISOString().split('T')[0];
      const fallback = charges.find(function (c) {
        const chargeDate = new Date(c.created * 1000).toISOString().split('T')[0];
        return !matchedIds.has(c.id) &&
          chargeDate === paidDate &&
          Math.abs(toDollars(c.amount) - Number(p.amount || 0)) < 0.01;
      });
      if (fallback) {
        matchedIds.add(fallback.id);
        matches.push({ stripe_charge_id: fallback.id, local_payment_id: p.id });
      }
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
  const limit = Math.min(parseInt(req.query.limit || '50', 10), 100);
  const outstandingOnly = req.query.outstanding === 'true' || req.query.outstanding === '1';

  try {
    const now = new Date();
    const monthStart = startOfMonth(now);
    const thirtyDaysAgo = daysAgo(now, 30);

    const [recentCharges, allMonthCharges, all30dCharges] = await Promise.all([
      stripe.charges.list({ limit, expand: ['data.customer'] }),
      fetchAllCharges(stripe, { created: { gte: Math.floor(monthStart.getTime() / 1000) } }),
      fetchAllCharges(stripe, { created: { gte: Math.floor(thirtyDaysAgo.getTime() / 1000) } })
    ]);

    const revenueMonth = sumRevenue(allMonthCharges);
    const revenue30d = sumRevenue(all30dCharges);

    // Match against local payments using the auth-supabase instance, which has admin rights.
    const { matched: matchedIds } = await matchCharges(recentCharges.data, auth.supabase);

    let payments = recentCharges.data.map(formatCharge).map(function (p) {
      return {
        ...p,
        matched: matchedIds.has(p.id)
      };
    });

    if (outstandingOnly) {
      payments = payments.filter(function (p) {
        return !p.matched && p.paid && !p.refunded;
      });
    }

    const outstandingPayments = payments.filter(function (p) { return !p.matched && p.paid && !p.refunded; });

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      payments,
      revenue_month: revenueMonth,
      revenue_30d: revenue30d,
      currency: recentCharges.data[0] ? recentCharges.data[0].currency.toUpperCase() : 'AUD',
      outstanding_count: outstandingPayments.length,
      outstanding_total: outstandingPayments.reduce(function (sum, p) { return sum + (Number(p.amount) || 0); }, 0)
    }));
  } catch (err) {
    console.error('Stripe payments error:', err);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: err.message || 'Stripe request failed' }));
  }
});
