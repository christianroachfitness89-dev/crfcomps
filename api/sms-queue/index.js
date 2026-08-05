/**
 * /api/sms-queue
 *
 * Temporary outbound SMS queue for Apple Shortcuts integration.
 *
 * POST /api/sms-queue  -> create a queue from selected lead IDs (admin auth required)
 * GET  /api/sms-queue?id=<queue_id> -> fetch queue contents (queue ID is the auth token)
 * PATCH /api/sms-queue -> mark a single lead as sent/failed (queue ID is the auth token)
 *
 * Queues expire after 24 hours and are stored in a small Supabase table.
 */

const { adminClient, verifyAdmin, allowCors, json } = require('../_utils');

function generateQueueId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let id = '';
  for (let i = 0; i < 7; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return id;
}

module.exports = allowCors(async function (req, res) {
  let adminAuth = null;
  if (req.method === 'POST') {
    adminAuth = await verifyAdmin(req);
    if (adminAuth.error) return json(res, adminAuth.status, { error: adminAuth.error });
  }

  const supabase = adminAuth ? adminAuth.supabase : adminClient();

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  // POST: create queue (admin only)
  if (req.method === 'POST') {
    const { supabase, user } = adminAuth;
    const body = await readJson(req);
    const leadIds = Array.isArray(body.lead_ids) ? body.lead_ids.filter(Boolean) : [];
    const template = typeof body.template === 'string' ? body.template : '';

    if (!leadIds.length) {
      return json(res, 400, { error: 'lead_ids array is required' });
    }

    const { data: leads, error: leadsError } = await supabase
      .from('leads')
      .select('id, full_name, phone, email, strategy_id, competition_id, tags, status')
      .in('id', leadIds);

    if (leadsError) {
      console.error('sms-queue fetch leads error:', leadsError);
      return json(res, 500, { error: leadsError.message });
    }

    const validLeads = (leads || []).filter(function (l) { return l && l.phone; });
    if (!validLeads.length) {
      return json(res, 400, { error: 'No leads with phone numbers found.' });
    }

    const strategyIds = [...new Set(validLeads.map(l => l.strategy_id).filter(Boolean))];
    const competitionIds = [...new Set(validLeads.map(l => l.competition_id).filter(Boolean))];

    const [{ data: strategies }, { data: competitions }] = await Promise.all([
      strategyIds.length ? supabase.from('marketing_strategies').select('id, name, sms_template').in('id', strategyIds) : Promise.resolve({ data: [] }),
      competitionIds.length ? supabase.from('competitions').select('id, name, sms_templates').in('id', competitionIds) : Promise.resolve({ data: [] })
    ]);

    const strategyMap = Object.fromEntries((strategies || []).map(s => [s.id, s]));
    const compMap = Object.fromEntries((competitions || []).map(c => [c.id, c]));

    const items = validLeads.map(function (l) {
      const strategy = strategyMap[l.strategy_id] || null;
      const competition = compMap[l.competition_id] || null;
      return {
        lead_id: l.id,
        phone: l.phone,
        name: l.full_name || '',
        message: buildMessage(template, l, strategy, competition),
        status: 'pending'
      };
    });

    let id = generateQueueId();
    let inserted = false;
    let attempts = 0;
    while (!inserted && attempts < 5) {
      const { error } = await supabase
        .from('sms_queues')
        .insert({ id, user_id: user.id, items: items, expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() });
      if (!error) {
        inserted = true;
      } else if (error.message && error.message.includes('duplicate key')) {
        id = generateQueueId();
        attempts++;
      } else {
        console.error('sms-queue insert error:', error);
        return json(res, 500, { error: error.message });
      }
    }

    return json(res, 200, {
      queue_id: id,
      total: items.length,
      message: `Queue ${id} created with ${items.length} message(s).`
    });
  }

  // GET / PATCH: queue ID acts as the token
  const id = req.query.id || '';
  if (!id) return json(res, 400, { error: 'id query parameter is required' });

  const { data, error } = await supabase
    .from('sms_queues')
    .select('items, user_id')
    .eq('id', id)
    .gt('expires_at', new Date().toISOString())
    .single();

  if (error || !data) {
    return json(res, 404, { error: 'Queue not found or expired.' });
  }

  if (req.method === 'GET') {
    return json(res, 200, { items: data.items || [] });
  }

  if (req.method === 'PATCH') {
    const body = await readJson(req);
    const leadId = body.lead_id || '';
    const status = body.status || 'sent';

    if (!leadId) return json(res, 400, { error: 'lead_id is required' });

    const items = (data.items || []).map(function (item) {
      if (item.lead_id === leadId) {
        return { ...item, status: status === 'sent' ? 'sent' : 'failed' };
      }
      return item;
    });

    const leadItem = items.find(i => i.lead_id === leadId);
    if (leadItem && status === 'sent') {
      await supabase.from('leads').update({ status: 'sms_sent', updated_at: new Date().toISOString() }).eq('id', leadId);
      await supabase.from('communications').insert({
        lead_id: leadId,
        type: 'sms',
        direction: 'outbound',
        status: 'completed',
        body: leadItem.message,
        created_by: data.user_id
      });
    }

    const { error: updateError } = await supabase.from('sms_queues').update({ items }).eq('id', id);
    if (updateError) return json(res, 500, { error: updateError.message });
    return json(res, 200, { ok: true, lead_id: leadId, status });
  }

  return json(res, 405, { error: 'Method not allowed' });
});

function readJson(req) {
  return new Promise(function (resolve, reject) {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (err) { reject(err); }
    });
    req.on('error', reject);
  });
}

function buildMessage(template, lead, strategy, competition) {
  if (!template) {
    template = strategy ? (strategy.sms_template || '') : '';
  }
  if (!template) return '';

  const parts = splitName(lead.full_name || '');
  const tagMap = {};
  (lead.tags || []).forEach(function (tag) {
    const colon = tag.indexOf(':');
    if (colon > 0) {
      const key = tag.slice(0, colon).trim().toLowerCase();
      const val = tag.slice(colon + 1).trim();
      if (key && !tagMap.hasOwnProperty(key)) tagMap[key] = val;
    }
  });

  let message = template
    .replace(/\{first_name\}/gi, parts.first)
    .replace(/\{last_name\}/gi, parts.last)
    .replace(/\{full_name\}/gi, lead.full_name || '')
    .replace(/\{phone\}/gi, lead.phone || '')
    .replace(/\{email\}/gi, lead.email || '')
    .replace(/\{strategy_name\}/gi, strategy ? (strategy.name || '') : '')
    .replace(/\{giveaway_name\}/gi, competition ? (competition.name || '') : '');

  message = message.replace(/\{([a-z0-9_]+)\}/gi, function (match, key) {
    return tagMap.hasOwnProperty(key) ? tagMap[key] : match;
  });

  return message;
}

function splitName(fullName) {
  const parts = String(fullName || '').trim().split(/\s+/);
  return { first: parts[0] || '', last: parts.slice(1).join(' ') || '' };
}
