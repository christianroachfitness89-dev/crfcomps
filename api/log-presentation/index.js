/**
 * /api/log-presentation
 *
 * Public endpoint called by presentation.html to record view and
 * package-interest events against a lead UUID.
 *
 * POST /api/log-presentation
 *   body: { lead_id, event: 'viewed'|'interested', package?: 'gold'|'silver' }
 */

const { adminClient, allowCors, json } = require('../_utils');

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

  const body = await readJson(req);
  const leadId = (body.lead_id || '').toString().trim();
  const event = (body.event || '').toString().trim().toLowerCase();
  const packageName = (body.package || '').toString().trim().toLowerCase() || null;

  if (!leadId || !UUID_RE.test(leadId)) {
    return json(res, 400, { error: 'lead_id must be a valid UUID' });
  }

  if (!event || (event !== 'viewed' && event !== 'interested')) {
    return json(res, 400, { error: 'event must be viewed or interested' });
  }

  if (event === 'interested' && packageName && packageName !== 'gold' && packageName !== 'silver') {
    return json(res, 400, { error: 'package must be gold or silver' });
  }

  const supabase = adminClient();

  // Confirm the lead exists before recording anything.
  const { data: lead, error: leadError } = await supabase
    .from('leads')
    .select('id')
    .eq('id', leadId)
    .maybeSingle();

  if (leadError) {
    console.error('log-presentation lead lookup error:', leadError);
    return json(res, 500, { error: leadError.message });
  }

  if (!lead) {
    return json(res, 404, { error: 'Lead not found' });
  }

  // Insert audit event.
  const { error: insertError } = await supabase.from('presentation_events').insert({
    lead_id: leadId,
    event: event,
    package: event === 'interested' ? packageName : null
  });

  if (insertError) {
    console.error('log-presentation insert error:', insertError);
    return json(res, 500, { error: insertError.message });
  }

  // Update derived columns on the lead for quick admin filtering/display.
  const updates = {
    presentation_event: event,
    presentation_at: new Date().toISOString()
  };
  if (event === 'interested') {
    updates.presentation_package = packageName;
  }

  const { error: updateError } = await supabase
    .from('leads')
    .update(updates)
    .eq('id', leadId);

  if (updateError) {
    console.error('log-presentation lead update error:', updateError);
    // The event was recorded; do not fail the public page because of a derived-column update.
    return json(res, 200, { ok: true, warning: 'Event recorded but lead summary not updated' });
  }

  return json(res, 200, { ok: true });
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
