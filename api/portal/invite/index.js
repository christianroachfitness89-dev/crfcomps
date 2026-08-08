/**
 * /api/portal/invite
 *
 * Admin-only endpoint that creates a Supabase Auth user for a client and
 * sends them an email invitation to set their portal password.
 *
 * POST /api/portal/invite
 *   body: { client_id }
 */

const { adminClient, verifyAdmin, allowCors, json } = require('../../_utils');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

module.exports = allowCors(async function (req, res) {
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== 'POST') {
    return json(res, 405, { error: 'Method not allowed' });
  }

  const adminAuth = await verifyAdmin(req);
  if (adminAuth.error) {
    return json(res, adminAuth.status, { error: adminAuth.error });
  }

  const body = await readJson(req);
  const clientId = (body.client_id || '').toString().trim();

  if (!clientId || !UUID_RE.test(clientId)) {
    return json(res, 400, { error: 'client_id must be a valid UUID' });
  }

  const supabase = adminClient();

  const { data: client, error: clientError } = await supabase
    .from('clients')
    .select('id, full_name, email, auth_user_id')
    .eq('id', clientId)
    .maybeSingle();

  if (clientError) {
    console.error('portal/invite client lookup error:', clientError);
    return json(res, 500, { error: clientError.message });
  }

  if (!client) {
    return json(res, 404, { error: 'Client not found' });
  }

  if (!client.email) {
    return json(res, 400, { error: 'Client has no email address. Add one in CRM first.' });
  }

  if (client.auth_user_id) {
    return json(res, 200, {
      ok: true,
      already_invited: true,
      message: 'This client has already been invited to the portal.'
    });
  }

  const origin = (req.headers.origin || 'https://' + (req.headers.host || '') || '').replace(/\/$/, '');
  const redirectTo = origin + '/portal-onboard.html';

  console.log('portal/invite redirectTo:', redirectTo, 'for client:', clientId);

  const { data: inviteData, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(client.email, {
    redirectTo: redirectTo,
    data: { full_name: client.full_name || '', is_client: true }
  });

  if (inviteError) {
    console.error('portal/invite auth invite error:', inviteError);
    return json(res, 500, { error: inviteError.message });
  }

  const user = inviteData.user;
  if (!user || !user.id) {
    return json(res, 500, { error: 'Invitation succeeded but no user was returned.' });
  }

  const { error: updateError } = await supabase
    .from('clients')
    .update({
      auth_user_id: user.id,
      portal_invited_at: new Date().toISOString()
    })
    .eq('id', clientId);

  if (updateError) {
    console.error('portal/invite client link error:', updateError);
    return json(res, 500, { error: updateError.message });
  }

  return json(res, 200, {
    ok: true,
    already_invited: false,
    auth_user_id: user.id,
    message: 'Portal invitation sent to ' + client.email
  });
});

function readJson(req) {
  return new Promise(function (resolve, reject) {
    let data = '';
    req.on('data', function (chunk) { data += chunk; });
    req.on('end', function () {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (err) { reject(err); }
    });
    req.on('error', reject);
  });
}
