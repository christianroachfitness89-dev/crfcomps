/**
 * GET /api/stripe/payments
 *
 * Returns recent Stripe charges and revenue totals.
 * Requires admin authentication. Keys are never sent to the browser.
 */

const Stripe = require('stripe');
const { verifyAdmin, allowCors } = require('../_utils');

function toDollars(cents) {
  return (cents || 0) / 100;
}

async function fetchRevenue(stripe, sinceUnix) {
  let amountCents = 0;
  let startingAfter = null;
  let page = 0;

  while (page < 20) {
    const params = { limit: 100 };
    if (sinceUnix) params.created = { gte: sinceUnix };
    if (startingAfter) params.starting_after = startingAfter;

    const list = await stripe.charges.list(params);
    if (!list.data.length) break;

    list.data.forEach(function (charge) {
      if (charge.paid && charge.status === 'succeeded') {
        amountCents += charge.amount - (charge.amount_refunded || 0);
      }
    });

    if (!list.has_more) break;
    startingAfter = list.data[list.data.length - 1].id;
    page++;
  }

  return toDollars(amountCents);
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
  const limit = Math.min(parseInt(req.query.limit || '10', 10), 100);

  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [recent, revenueMonth, revenue30d] = await Promise.all([
      stripe.charges.list({ limit, expand: ['data.customer'] }),
      fetchRevenue(stripe, Math.floor(startOfMonth.getTime() / 1000)),
      fetchRevenue(stripe, Math.floor(thirtyDaysAgo.getTime() / 1000))
    ]);

    const payments = recent.data.map(function (charge) {
      const customer = charge.customer && typeof charge.customer === 'object'
        ? charge.customer
        : null;
      return {
        id: charge.id,
        amount: toDollars(charge.amount),
        currency: (charge.currency || '').toUpperCase(),
        status: charge.status,
        paid: charge.paid,
        created_at: new Date(charge.created * 1000).toISOString(),
        customer: customer
          ? (customer.name || customer.email || customer.id)
          : (charge.billing_details && charge.billing_details.name) || null,
        description: charge.description || null,
        receipt_url: charge.receipt_url || null
      };
    });

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      payments,
      revenue_month: revenueMonth,
      revenue_30d: revenue30d,
      currency: recent.data[0] ? recent.data[0].currency.toUpperCase() : 'AUD'
    }));
  } catch (err) {
    console.error('Stripe payments error:', err);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: err.message || 'Stripe request failed' }));
  }
});
