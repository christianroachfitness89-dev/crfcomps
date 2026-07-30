/**
 * GET /api/calendly/events
 *
 * Reserved for Calendly scheduled events.
 * Currently returns the integration status so the frontend can show it.
 */

const { verifyAdmin, allowCors } = require('../_utils');

module.exports = allowCors(async function (req, res) {
  const auth = await verifyAdmin(req);
  if (auth.error) {
    res.statusCode = auth.status;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: auth.error }));
    return;
  }

  const token = process.env.CALENDLY_PERSONAL_TOKEN || '';
  if (!token) {
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      configured: false,
      events: [],
      message: 'Calendly is not configured. Add CALENDLY_PERSONAL_TOKEN to your environment variables.'
    }));
    return;
  }

  // TODO: implement Calendly API call once you add CALENDLY_PERSONAL_TOKEN.
  res.statusCode = 501;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({
    configured: true,
    events: [],
    message: 'Calendly integration stub — add fetching logic here.'
  }));
});
