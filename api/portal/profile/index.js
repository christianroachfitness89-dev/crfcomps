/**
 * /api/portal/profile
 *
 * Client-only endpoint that returns the logged-in client's dashboard summary.
 * Reads from their own sessions, attendance, metrics, photos, invoices,
 * form submissions and notes.
 *
 * GET /api/portal/profile
 *   Authorization: Bearer <client-session-token>
 */

const { adminClient, allowCors, json } = require('../../_utils');

module.exports = allowCors(async function (req, res) {
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== 'GET') {
    return json(res, 405, { error: 'Method not allowed' });
  }

  const header = req.headers.authorization || '';
  const parts = header.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return json(res, 401, { error: 'Missing Authorization: Bearer <token> header' });
  }
  const token = parts[1];

  const supabase = adminClient();

  // Verify the session token and get the auth user.
  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData || !userData.user) {
    console.error('portal/profile auth error:', userError);
    return json(res, 401, { error: 'Invalid or expired session' });
  }

  const authUserId = userData.user.id;

  // Find the client row linked to this auth user.
  const { data: client, error: clientError } = await supabase
    .from('clients')
    .select('id, full_name, email, phone, status, source, notes, portal_invited_at, portal_last_login')
    .eq('auth_user_id', authUserId)
    .maybeSingle();

  if (clientError) {
    console.error('portal/profile client lookup error:', clientError);
    return json(res, 500, { error: clientError.message });
  }

  if (!client) {
    return json(res, 403, { error: 'No client record is linked to this account.' });
  }

  const clientId = client.id;
  const now = new Date().toISOString();

  // Track last login asynchronously; don't block the response on it.
  supabase.from('clients')
    .update({ portal_last_login: now })
    .eq('id', clientId)
    .then(function () {}, function (err) { console.error('portal/profile login tracking error:', err); });

  try {
    const [
      { data: activePackages },
      { data: upcomingSessions },
      { data: pastSessions },
      { data: metrics },
      { data: photos },
      { data: invoices },
      { data: payments },
      { data: forms },
      { data: notes },
      { data: settings }
    ] = await Promise.all([
      supabase.from('client_packages')
        .select('id, status, started_at, packages(name, description, price, billing_frequency, session_amount, session_length_minutes)')
        .eq('client_id', clientId)
        .eq('status', 'active')
        .order('started_at', { ascending: false })
        .limit(1),

      supabase.from('sessions')
        .select('id, title, scheduled_at, duration_minutes, status, notes')
        .eq('client_id', clientId)
        .gte('scheduled_at', now)
        .order('scheduled_at', { ascending: true })
        .limit(5),

      supabase.from('sessions')
        .select('id, title, scheduled_at, duration_minutes, status, notes')
        .eq('client_id', clientId)
        .lt('scheduled_at', now)
        .order('scheduled_at', { ascending: false })
        .limit(10),

      supabase.from('client_metrics')
        .select('id, measured_at, weight_kg, body_fat_pct, muscle_mass_pct, chest_cm, waist_cm, hips_cm, arm_cm, thigh_cm, notes')
        .eq('client_id', clientId)
        .order('measured_at', { ascending: false })
        .limit(50),

      supabase.from('client_photos')
        .select('id, metric_id, photo_url, label, taken_at')
        .eq('client_id', clientId)
        .order('taken_at', { ascending: false })
        .limit(20),

      supabase.from('invoices')
        .select('id, amount, status, issued_at, due_at, paid_at, description, reference')
        .eq('client_id', clientId)
        .order('issued_at', { ascending: false })
        .limit(20),

      supabase.from('payments')
        .select('id, amount, method, paid_at, reference, notes')
        .eq('client_id', clientId)
        .order('paid_at', { ascending: false })
        .limit(20),

      supabase.from('form_submissions')
        .select('id, template_id, status, answers, pdf_url, created_at, form_templates(name)')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false })
        .limit(20),

      supabase.from('client_notes')
        .select('id, note, created_at')
        .eq('client_id', clientId)
        .eq('visible_to_client', true)
        .order('created_at', { ascending: false })
        .limit(10),

      supabase.from('client_portal_settings')
        .select('*')
        .eq('client_id', clientId)
        .maybeSingle()
    ]);

    // Compute simple attendance stats.
    const allSessions = [...(upcomingSessions || []), ...(pastSessions || [])];
    const completedSessions = (pastSessions || []).filter(function (s) { return s.status === 'completed'; }).length;
    const totalPast = (pastSessions || []).length;
    const attendanceRate = totalPast > 0 ? Math.round((completedSessions / totalPast) * 100) : 0;

    // Outstanding balance.
    const outstanding = (invoices || [])
      .filter(function (inv) { return inv.status !== 'paid' && inv.status !== 'cancelled'; })
      .reduce(function (sum, inv) { return sum + parseFloat(inv.amount || 0); }, 0);

    return json(res, 200, {
      ok: true,
      client: {
        id: client.id,
        full_name: client.full_name,
        email: client.email,
        phone: client.phone,
        status: client.status,
        source: client.source,
        notes: client.notes,
        portal_invited_at: client.portal_invited_at,
        portal_last_login: now
      },
      package: (activePackages && activePackages[0]) || null,
      attendance: {
        completed_sessions: completedSessions,
        total_past_sessions: totalPast,
        attendance_rate: attendanceRate,
        upcoming_sessions: upcomingSessions || [],
        past_sessions: pastSessions || []
      },
      metrics: metrics || [],
      photos: photos || [],
      billing: {
        outstanding: outstanding,
        invoices: invoices || [],
        payments: payments || []
      },
      forms: forms || [],
      notes: notes || [],
      settings: settings || {
        can_book_sessions: false,
        can_view_invoices: true,
        can_view_metrics: true,
        theme: 'light'
      }
    });
  } catch (err) {
    console.error('portal/profile aggregate error:', err);
    return json(res, 500, { error: err.message || 'Could not load portal profile' });
  }
});
