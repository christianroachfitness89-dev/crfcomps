/**
 * GET /api/google/calendar
 *
 * Returns upcoming events from a Google Calendar.
 * Requires admin authentication. Credentials are never sent to the browser.
 *
 * Environment variables:
 *   GOOGLE_SERVICE_ACCOUNT_JSON - full JSON content of a Google service account key
 *   GOOGLE_CALENDAR_ID          - calendar ID to read (defaults to 'primary')
 *
 * To use a service account, share the target calendar with the service account's
 * client_email in Google Calendar settings.
 */

const { google } = require('googleapis');
const { verifyAdmin, allowCors } = require('../_utils');

function getCalendarId() {
  return process.env.GOOGLE_CALENDAR_ID || 'primary';
}

function getServiceAccountCredentials() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '';
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (err) {
    console.error('Invalid GOOGLE_SERVICE_ACCOUNT_JSON:', err);
    return null;
  }
}

function isConfigured() {
  const creds = getServiceAccountCredentials();
  return !!(creds && creds.client_email && creds.private_key);
}

async function listEvents() {
  const creds = getServiceAccountCredentials();
  if (!creds) {
    throw new Error('Google service account is not configured.');
  }

  const auth = new google.auth.GoogleAuth({
    credentials: creds,
    scopes: ['https://www.googleapis.com/auth/calendar.readonly']
  });

  const calendar = google.calendar({ version: 'v3', auth });
  const now = new Date().toISOString();
  const maxResults = Math.min(parseInt(process.env.GOOGLE_CALENDAR_MAX_RESULTS || '20', 10), 100);

  const res = await calendar.events.list({
    calendarId: getCalendarId(),
    timeMin: now,
    maxResults: maxResults,
    singleEvents: true,
    orderBy: 'startTime'
  });

  return (res.data.items || []).map(function (event) {
    return {
      id: event.id,
      summary: event.summary || '(No title)',
      description: event.description || null,
      location: event.location || null,
      start: event.start ? (event.start.dateTime || event.start.date) : null,
      end: event.end ? (event.end.dateTime || event.end.date) : null,
      html_link: event.htmlLink || null,
      status: event.status || null
    };
  });
}

module.exports = allowCors(async function (req, res) {
  const auth = await verifyAdmin(req);
  if (auth.error) {
    res.statusCode = auth.status;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: auth.error }));
    return;
  }

  if (!isConfigured()) {
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      configured: false,
      events: [],
      message: 'Google Calendar is not configured. Add GOOGLE_SERVICE_ACCOUNT_JSON and GOOGLE_CALENDAR_ID to your environment variables.'
    }));
    return;
  }

  try {
    const events = await listEvents();
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      configured: true,
      calendar_id: getCalendarId(),
      events
    }));
  } catch (err) {
    console.error('Google Calendar error for calendarId=' + getCalendarId() + ':', err);
    const creds = getServiceAccountCredentials() || {};
    let message = err.message || 'Google Calendar request failed';

    if (message.includes('Not Found') || (err.response && err.response.status === 404)) {
      message = 'Calendar not found (ID: ' + getCalendarId() + '). Check GOOGLE_CALENDAR_ID and make sure the service account (' +
        (creds.client_email || 'unknown') +
        ') has been shared on this calendar with "See all event details" permission.';
    } else if (message.includes('invalid_grant') || message.includes('JWT')) {
      message = 'Google rejected the service account key. Delete all keys for ' +
        (creds.client_email || 'this service account') +
        ' in Google Cloud, create a fresh JSON key, paste it into Vercel as GOOGLE_SERVICE_ACCOUNT_JSON, and redeploy.';
    }

    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: message }));
  }
});
