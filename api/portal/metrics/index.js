/**
 * /api/portal/metrics
 *
 * Client-only endpoint for adding a progress metric entry.
 * The metric is linked to the currently signed-in client.
 *
 * POST /api/portal/metrics
 *   Authorization: Bearer <client-session-token>
 *   body: { measured_at, weight_kg?, body_fat_pct?, muscle_mass_pct?, waist_cm?, hips_cm?, chest_cm?, arm_cm?, thigh_cm?, notes? }
 */

const { adminClient, allowCors, json } = require('../../_utils');

module.exports = allowCors(async function (req, res) {
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== 'POST') {
    return json(res, 405, { error: 'Method not allowed' });
  }

  const header = req.headers.authorization || '';
  const parts = header.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return json(res, 401, { error: 'Missing Authorization: Bearer <token> header' });
  }
  const token = parts[1];

  const supabase = adminClient();

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData || !userData.user) {
    console.error('portal/metrics auth error:', userError);
    return json(res, 401, { error: 'Invalid or expired session' });
  }

  const authUserId = userData.user.id;

  const { data: client, error: clientError } = await supabase
    .from('clients')
    .select('id')
    .eq('auth_user_id', authUserId)
    .maybeSingle();

  if (clientError) {
    console.error('portal/metrics client lookup error:', clientError);
    return json(res, 500, { error: clientError.message });
  }

  if (!client) {
    return json(res, 403, { error: 'No client record is linked to this account.' });
  }

  const body = await readJson(req);

  const measuredAt = body.measured_at || new Date().toISOString().slice(0, 10);
  const insert = {
    client_id: client.id,
    measured_at: measuredAt,
    weight_kg: numberOrNull(body.weight_kg),
    body_fat_pct: numberOrNull(body.body_fat_pct),
    muscle_mass_pct: numberOrNull(body.muscle_mass_pct),
    chest_cm: numberOrNull(body.chest_cm),
    waist_cm: numberOrNull(body.waist_cm),
    hips_cm: numberOrNull(body.hips_cm),
    arm_cm: numberOrNull(body.arm_cm),
    thigh_cm: numberOrNull(body.thigh_cm),
    notes: body.notes || null,
    created_by: authUserId
  };

  const { data, error } = await supabase
    .from('client_metrics')
    .insert(insert)
    .select('id, measured_at, weight_kg, body_fat_pct, muscle_mass_pct, chest_cm, waist_cm, hips_cm, arm_cm, thigh_cm, notes')
    .single();

  if (error) {
    console.error('portal/metrics insert error:', error);
    return json(res, 500, { error: error.message });
  }

  return json(res, 200, { ok: true, metric: data });
});

function numberOrNull(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

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
