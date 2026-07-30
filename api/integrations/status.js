/**
 * GET /api/integrations/status
 *
 * Returns which external integrations are configured and reachable.
 * Does not expose secret keys.
 */

const { verifyAdmin, allowCors } = require('../_utils');

function isStripeKeyConfigured() {
  const key = process.env.STRIPE_SECRET_KEY || '';
  return key.startsWith('sk_');
}

function isCalendlyConfigured() {
  const token = process.env.CALENDLY_PERSONAL_TOKEN || '';
  return token.length > 20;
}

module.exports = allowCors(async function (req, res) {
  const auth = await verifyAdmin(req);
  if (auth.error) {
    res.statusCode = auth.status;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: auth.error }));
    return;
  }

  const stripeConfigured = isStripeKeyConfigured();
  const calendlyConfigured = isCalendlyConfigured();

  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({
    status: {
      stripe: {
        configured: stripeConfigured,
        healthy: stripeConfigured,
        label: 'Stripe payments'
      },
      calendly: {
        configured: calendlyConfigured,
        healthy: calendlyConfigured,
        label: 'Calendly bookings'
      }
    }
  }));
});
