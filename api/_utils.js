/**
 * CRF Comps — shared Vercel function utilities
 *
 * - Verifies the caller is an authenticated admin via Supabase.
 * - Adds CORS headers for preflight and JSON responses.
 * - Keeps API keys out of the browser.
 */

const { createClient } = require('@supabase/supabase-js');

// Supabase's realtime client checks for a global WebSocket at module load time.
// Node 20 doesn't expose one natively, so provide the `ws` package on the server.
if (typeof globalThis.WebSocket === 'undefined') {
  try {
    const WebSocket = require('ws');
    globalThis.WebSocket = WebSocket;
  } catch (err) {
    // If `ws` isn't installed, we'll fall through and let Supabase report the error.
  }
}

function adminClient() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables');
  }
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false
    },
    realtime: { enabled: false }
  });
}

async function verifyAdmin(req) {
  const header = req.headers.authorization || '';
  const parts = header.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return { error: 'Missing Authorization: Bearer <token> header', status: 401 };
  }
  const token = parts[1];

  try {
    const supabase = adminClient();
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data || !data.user) {
      return { error: 'Invalid or expired session', status: 401 };
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', data.user.id)
      .single();

    if (profileError) {
      console.error('verifyAdmin profile lookup error:', profileError);
      return { error: 'Could not verify admin status', status: 500 };
    }
    if (!profile || !profile.is_admin) {
      return { error: 'Admin access required', status: 403 };
    }

    return { user: data.user, supabase };
  } catch (err) {
    console.error('verifyAdmin error:', err);
    return { error: err.message || 'Server error', status: 500 };
  }
}

function setCorsHeaders(res, origin) {
  res.setHeader('Access-Control-Allow-Origin', origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');
}

function allowCors(handler) {
  return async function (req, res) {
    const origin = req.headers.origin || '';
    // Restrict to the same Vercel deployment / custom domain in production if desired.
    setCorsHeaders(res, origin);

    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.end();
      return;
    }

    return handler(req, res);
  };
}

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

module.exports = {
  adminClient,
  verifyAdmin,
  setCorsHeaders,
  allowCors,
  json
};
