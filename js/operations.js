/*
 * CRF Comps — shared operations platform logic
 *
 * Used by admin.html, crm.html, finance.html and sessions.html.
 * Handles auth, sidebar state, and cross-department data loading.
 */

(function () {
  const client = window.sb;

  window.opsData = {
    user: null,
    profile: null,
    leads: [],
    strategies: [],
    competitions: [],
    clients: [],
    payments: [],
    invoices: [],
    sessions: [],
    attendance: [],
    communications: []
  };

  function fmtDateShort(iso) {
    if (!iso) return '-';
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = String(str || '');
    return d.innerHTML;
  }

  function setActiveNav() {
    const page = document.body.dataset.page || 'dashboard';
    document.querySelectorAll('.admin-nav a').forEach(function (a) {
      const href = a.getAttribute('href');
      let active = false;
      if (href) {
        const name = href.replace('.html', '') || 'admin';
        active = name === page;
      }
      a.classList.toggle('active', active);
    });
  }

  function isDesktop() {
    return window.innerWidth >= 960;
  }

  function toggleSidebar() {
    const sidebar = document.getElementById('adminSidebar');
    const main = document.querySelector('.admin-main');
    const overlay = document.querySelector('.nav-overlay');
    if (!sidebar) return;

    if (isDesktop()) {
      sidebar.classList.toggle('collapsed');
      if (main) main.classList.toggle('expanded');
    } else {
      sidebar.classList.toggle('open');
      if (overlay) overlay.classList.toggle('show');
    }
  }

  function toggleMobileNav() {
    toggleSidebar();
  }

  function closeMobileNav() {
    if (!isDesktop()) {
      const sidebar = document.getElementById('adminSidebar');
      const overlay = document.querySelector('.nav-overlay');
      if (sidebar) sidebar.classList.remove('open');
      if (overlay) overlay.classList.remove('show');
    }
  }

  async function loadData() {
    try {
      const [leadsRes, stratRes, compRes, clientRes, payRes, invRes, sessRes, attRes, commRes] = await Promise.all([
        client.from('leads').select('*').order('created_at', { ascending: false }),
        client.from('marketing_strategies').select('*').order('created_at', { ascending: false }),
        client.from('competitions').select('*').order('starts_at', { ascending: false }),
        safeSelect('clients'),
        safeSelect('payments'),
        safeSelect('invoices'),
        safeSelect('sessions'),
        safeSelect('attendance'),
        safeSelect('communications')
      ]);

      window.opsData.leads = leadsRes.data || [];
      window.opsData.strategies = stratRes.data || [];
      window.opsData.competitions = compRes.data || [];
      window.opsData.clients = clientRes.data || [];
      window.opsData.payments = payRes.data || [];
      window.opsData.invoices = invRes.data || [];
      window.opsData.sessions = sessRes.data || [];
      window.opsData.attendance = attRes.data || [];
      window.opsData.communications = commRes.data || [];
    } catch (err) {
      console.error('loadData error:', err);
    }
  }

  async function safeSelect(table) {
    try {
      const { data, error } = await client.from(table).select('*').order('created_at', { ascending: false });
      if (error && error.message && error.message.includes('does not exist')) return { data: [] };
      if (error) throw error;
      return { data: data || [] };
    } catch (err) {
      console.warn('Could not load ' + table + ':', err.message);
      return { data: [] };
    }
  }

  function formatCurrency(amount) {
    if (amount === null || amount === undefined || isNaN(amount)) return '$0';
    return '$' + Number(amount).toLocaleString(undefined, { maximumFractionDigits: 0 });
  }

  function renderDashboard() {
    const container = document.getElementById('ops-dashboard');
    if (!container) return;

    const d = window.opsData;
    const now = new Date();
    const weekAgo = new Date(now); weekAgo.setDate(weekAgo.getDate() - 7);
    const dayStart = new Date(now); dayStart.setHours(0, 0, 0, 0);

    const totalLeads = d.leads.length;
    const newLeadsWeek = d.leads.filter(function (l) { return l.created_at && new Date(l.created_at) >= weekAgo; }).length;
    const convertedLeads = d.leads.filter(function (l) { return l.status === 'converted'; }).length;

    const activeClients = d.clients.filter(function (c) { return c.status === 'active_member' || c.status === 'prospect'; }).length;

    const revenueMonth = d.payments.filter(function (p) {
      return p.paid_at && new Date(p.paid_at).getMonth() === now.getMonth() && new Date(p.paid_at).getFullYear() === now.getFullYear();
    }).reduce(function (sum, p) { return sum + (Number(p.amount) || 0); }, 0);

    const outstanding = d.invoices.filter(function (i) { return i.status !== 'paid' && i.status !== 'cancelled'; }).reduce(function (sum, i) { return sum + (Number(i.amount) || 0); }, 0);

    const upcomingSessions = d.sessions.filter(function (s) {
      return s.scheduled_at && new Date(s.scheduled_at) >= dayStart && s.status !== 'cancelled';
    }).length;

    const sessionsWeek = d.sessions.filter(function (s) {
      return s.scheduled_at && new Date(s.scheduled_at) >= weekAgo && s.status === 'completed';
    }).length;

    const attendedWeek = d.attendance.filter(function (a) {
      const session = d.sessions.find(function (s) { return s.id === a.session_id; });
      return session && session.scheduled_at && new Date(session.scheduled_at) >= weekAgo && a.status === 'attended';
    }).length;

    container.innerHTML =
      '<div class="ops-kpi-grid">' +
        kpiCard('Total leads', totalLeads, '+' + newLeadsWeek + ' this week') +
        kpiCard('Converted leads', convertedLeads) +
        kpiCard('Active clients', activeClients) +
        kpiCard('Revenue this month', formatCurrency(revenueMonth)) +
        kpiCard('Outstanding', formatCurrency(outstanding)) +
        kpiCard('Upcoming sessions', upcomingSessions, sessionsWeek + ' this week') +
        kpiCard('Attendance this week', attendedWeek) +
      '</div>' +
      '<div class="ops-department-grid" style="margin-top:32px;">' +
        deptCard('marketing.html', 'Marketing', 'Lead pools, strategies & giveaways', '#c73e2a') +
        deptCard('crm.html', 'CRM / Clients', 'Members, prospects & pipeline', '#3c783c') +
        deptCard('finance.html', 'Finance', 'Payments, invoices & revenue', '#b8860b') +
        deptCard('sessions.html', 'Sessions', 'Schedule, attendance & capacity', '#2146af') +
      '</div>';
  }

  function kpiCard(label, value, sub) {
    return '<div class="stat-box">' +
      '<div class="stat-label">' + escapeHtml(label) + '</div>' +
      '<div class="stat-value">' + escapeHtml(String(value)) + '</div>' +
      (sub ? '<div class="stat-sub">' + escapeHtml(sub) + '</div>' : '') +
    '</div>';
  }

  function deptCard(href, title, desc, color) {
    return '<a href="' + escapeHtml(href) + '" class="ops-dept-card" style="--dept-color:' + escapeHtml(color) + '">' +
      '<div class="ops-dept-title">' + escapeHtml(title) + '</div>' +
      '<div class="ops-dept-desc">' + escapeHtml(desc) + '</div>' +
    '</a>';
  }

  async function init() {
    const { user, profile } = await window.auth.requireAdmin();
    if (!user) return;

    window.opsData.user = user;
    window.opsData.profile = profile;

    const nameEl = document.getElementById('adminName');
    if (nameEl) nameEl.textContent = profile.full_name || 'Admin';

    setActiveNav();
    await loadData();
    renderDashboard();
  }

  window.operations = {
    init,
    loadData,
    renderDashboard,
    toggleSidebar,
    toggleMobileNav,
    closeMobileNav,
    formatCurrency,
    fmtDateShort,
    escapeHtml
  };

  window.toggleSidebar = toggleSidebar;
  window.toggleMobileNav = toggleMobileNav;
  window.closeMobileNav = closeMobileNav;

  if (!document.body.classList.contains('no-ops-auto-init')) {
    init();
  }
})();
