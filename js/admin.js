/*
 * CRF Comps — admin panel logic
 *
 * Handles auth, navigation, dashboard metrics, lead pools, strategies,
 * competitions, settings and bulk upload.
 */

(function () {
  const client = window.sb;

  let allStrategies = [];
  let allCompetitions = [];
  let allLeads = [];
  let currentSettings = null;
  let drawnWinner = null;
  let pendingUploadRows = [];
  let currentUser = null;
  let currentProfile = null;

  const POOLS = [
    { key: 'giveaway', label: 'Giveaway Leads' },
    { key: 'new_member', label: 'New Member Leads' },
    { key: 'non_attendance', label: 'Non-Attendance Leads' },
    { key: 'birthday', label: 'Birthday Leads' }
  ];

  const STATUSES = [
    ['entered','Entered'],
    ['called','Called'],
    ['no_answer','No answer'],
    ['sms_sent','SMS sent'],
    ['email_sent','Email sent'],
    ['follow_up','Follow up'],
    ['converted','Converted'],
    ['not_interested','Not interested'],
    ['contact_later','Contact later'],
    ['winner','Winner'],
    ['runner_up','Runner-up'],
    ['runner_up_2','2nd runner-up'],
    ['disqualified','Disqualified']
  ];

  const ACTIVE_STATUSES = ['entered', 'called', 'no_answer', 'sms_sent', 'email_sent', 'follow_up', 'contact_later'];
  const CLOSED_STATUSES = ['converted', 'not_interested', 'winner', 'runner_up', 'runner_up_2', 'disqualified'];

  // ---------- utilities ----------

  function showMsg(el, text, type) {
    el.textContent = text;
    el.className = 'msg show ' + type;
  }

  function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = String(str || '');
    return d.innerHTML;
  }

  function fmtType(type) {
    if (type === 'random_draw') return 'Random draw';
    if (type === 'referral') return 'Referral giveaway';
    return 'Giveaway';
  }

  function fmtStatus(status) {
    if (status === 'active') return 'Active';
    if (status === 'closed') return 'Closed';
    if (status === 'archived') return 'Archived';
    return 'Draft';
  }

  function fmtStratType(type) {
    if (type === 'giveaway') return 'Giveaway';
    if (type === 'lead_magnet') return 'Lead magnet';
    if (type === 'challenge') return 'Challenge';
    if (type === 'webinar') return 'Webinar';
    if (type === 'funnel') return 'Funnel';
    return 'Other';
  }

  function fmtStratStatus(status) {
    if (status === 'active') return 'Active';
    if (status === 'paused') return 'Paused';
    if (status === 'archived') return 'Archived';
    return 'Draft';
  }

  function stratStatusClass(status) {
    if (status === 'active') return 'tag tag-active';
    if (status === 'paused') return 'tag tag-draft';
    if (status === 'archived') return 'tag tag-archived';
    return 'tag tag-draft';
  }

  function statusClass(status) {
    if (status === 'active') return 'tag tag-active';
    if (status === 'closed') return 'tag tag-closed';
    if (status === 'archived') return 'tag tag-archived';
    return 'tag tag-draft';
  }

  function fmtDate(iso) {
    if (!iso) return '-';
    return new Date(iso).toLocaleString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  function fmtDateShort(iso) {
    if (!iso) return '-';
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  function toDatetimeLocal(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  }

  function startOfDay(offsetDays) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - (offsetDays || 0));
    return d;
  }

  function splitName(fullName) {
    const parts = String(fullName || '').trim().split(/\s+/);
    return { first: parts[0] || '', last: parts.slice(1).join(' ') || '' };
  }

  function getCompName(id) {
    const c = allCompetitions.find(function (x) { return x.id === id; });
    return c ? (c.name || 'Unnamed') : '-';
  }

  function getStrategyName(id) {
    const s = allStrategies.find(function (x) { return x.id === id; });
    return s ? (s.name || 'Unnamed') : '-';
  }

  // ---------- navigation ----------

  function setActiveNav(key) {
    document.querySelectorAll('.admin-nav a').forEach(function (a) {
      a.classList.toggle('active', a.dataset.nav === key);
    });
    document.querySelectorAll('.admin-page').forEach(function (p) {
      p.classList.toggle('active', p.id === 'page-' + key);
    });
  }

  function navigate(key) {
    setActiveNav(key);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (key === 'dashboard') renderDashboard();
    if (key === 'giveaway' || key === 'new_member' || key === 'non_attendance' || key === 'birthday') renderLeadPool(key);
    if (key === 'strategies') renderStrategies();
    if (key === 'competitions') renderCompetitions();
    if (key === 'settings') loadSettingsPanel();
    closeMobileNav();
  }

  function isDesktop() {
    return window.innerWidth >= 960;
  }

  function toggleSidebar() {
    const sidebar = document.getElementById('adminSidebar');
    const main = document.querySelector('.admin-main');
    const overlay = document.querySelector('.nav-overlay');

    if (isDesktop()) {
      sidebar.classList.toggle('collapsed');
      main.classList.toggle('expanded');
    } else {
      sidebar.classList.toggle('open');
      overlay.classList.toggle('show');
    }
  }

  function toggleMobileNav() {
    toggleSidebar();
  }

  function closeMobileNav() {
    if (!isDesktop()) {
      document.getElementById('adminSidebar').classList.remove('open');
      document.querySelector('.nav-overlay').classList.remove('show');
    }
  }

  function closeSidebar() {
    if (isDesktop()) {
      document.getElementById('adminSidebar').classList.add('collapsed');
      document.querySelector('.admin-main').classList.add('expanded');
    } else {
      closeMobileNav();
    }
  }

  // ---------- init / data load ----------

  async function init() {
    const { user, profile } = await window.auth.requireAdmin();
    if (!user) return;
    currentUser = user;
    currentProfile = profile;
    document.getElementById('adminName').textContent = profile.full_name || 'Admin';
    await loadData();
    await loadSettingsPanel();
    navigate('dashboard');
  }

  async function loadData() {
    try {
      const [stratsRes, compsRes, leadsRes] = await Promise.all([
        client.from('marketing_strategies').select('*').order('created_at', { ascending: false }),
        client.from('competitions').select('*').order('starts_at', { ascending: false }),
        client.from('leads').select('*').order('created_at', { ascending: false })
      ]);

      if (stratsRes.error) throw stratsRes.error;
      if (compsRes.error) throw compsRes.error;
      if (leadsRes.error) throw leadsRes.error;

      allStrategies = stratsRes.data || [];
      allCompetitions = compsRes.data || [];
      allLeads = leadsRes.data || [];

      populateStrategySelects();
      renderDashboard();
      renderStrategies();
      renderCompetitions();
      POOLS.forEach(function (p) { renderLeadPool(p.key); });
    } catch (err) {
      console.error(err);
      alert('Could not load admin data: ' + (err.message || err));
    }
  }

  function populateStrategySelects() {
    const ids = ['compStrategy', 'filterStrategy', 'uploadStrategy'];
    POOLS.forEach(function (p) {
      ids.push('uploadStrategy-' + p.key);
    });

    ids.forEach(function (id) {
      const sel = document.getElementById(id);
      if (!sel) return;
      const current = sel.value;
      const includeEmpty = id !== 'filterStrategy';
      sel.innerHTML = (includeEmpty ? '<option value="">— Select strategy —</option>' : '<option value="all">All strategies</option>') +
        allStrategies.map(function (s) {
          return '<option value="' + escapeHtml(s.id) + '"' + (s.id === current ? ' selected' : '') + '>' + escapeHtml((s.name || 'Unnamed') + ' · ' + fmtStratType(s.type)) + '</option>';
        }).join('');
    });

    // Populate strategy filters inside each pool page.
    document.querySelectorAll('.pool-strategy').forEach(function (sel) {
      const current = sel.value;
      sel.innerHTML = '<option value="all">All strategies</option>' +
        allStrategies.map(function (s) {
          return '<option value="' + escapeHtml(s.id) + '"' + (s.id === current ? ' selected' : '') + '>' + escapeHtml((s.name || 'Unnamed') + ' · ' + fmtStratType(s.type)) + '</option>';
        }).join('');
    });

    // Populate competition filters inside each pool page.
    document.querySelectorAll('.pool-comp').forEach(function (sel) {
      const current = sel.value;
      sel.innerHTML = '<option value="all">All giveaways</option>' +
        allCompetitions.map(function (c) {
          return '<option value="' + escapeHtml(c.id) + '"' + (c.id === current ? ' selected' : '') + '>' + escapeHtml((c.name || 'Unnamed') + ' · ' + fmtStatus(c.status)) + '</option>';
        }).join('');
    });
  }

  // ---------- dashboard ----------

  function renderDashboard() {
    // Dashboard always shows every lead across all strategies and pools.
    const filtered = allLeads;

    const now = new Date();
    const todayStart = startOfDay(0);
    const weekStart = startOfDay(7);
    const coldCutoff = startOfDay(7);

    const openLeads = filtered.filter(function (l) { return ACTIVE_STATUSES.includes(l.status); });
    const converted = filtered.filter(function (l) { return l.status === 'converted'; });
    const convertedToday = converted.filter(function (l) { return l.created_at && new Date(l.created_at) >= todayStart; });
    const convertedWeek = converted.filter(function (l) { return l.created_at && new Date(l.created_at) >= weekStart; });
    const cold = filtered.filter(function (l) {
      return l.status === 'entered' && l.created_at && new Date(l.created_at) <= coldCutoff;
    });
    const hot = filtered.filter(function (l) {
      return ACTIVE_STATUSES.includes(l.status) && l.created_at && new Date(l.created_at) >= todayStart;
    });

    document.getElementById('dashOpenCount').textContent = openLeads.length;
    document.getElementById('dashConvertedCount').textContent = converted.length;
    document.getElementById('dashConvertedToday').textContent = convertedToday.length + ' today';
    document.getElementById('dashColdCount').textContent = cold.length;
    document.getElementById('dashHotCount').textContent = hot.length;

    // Pool split
    const poolCounts = {};
    POOLS.forEach(function (p) { poolCounts[p.key] = 0; });
    filtered.forEach(function (l) { poolCounts[l.pool || 'giveaway'] = (poolCounts[l.pool || 'giveaway'] || 0) + 1; });
    document.getElementById('dashPoolSplit').innerHTML = POOLS.map(function (p) {
      return '<div class="dash-split-row"><span>' + p.label + '</span><strong>' + (poolCounts[p.key] || 0) + '</strong></div>';
    }).join('');

    // Status breakdown
    const statusCounts = {};
    STATUSES.forEach(function (s) { statusCounts[s[0]] = 0; });
    filtered.forEach(function (l) { statusCounts[l.status] = (statusCounts[l.status] || 0) + 1; });
    document.getElementById('dashStatusBreakdown').innerHTML = STATUSES.map(function (s) {
      const count = statusCounts[s[0]] || 0;
      if (!count) return '';
      return '<div class="dash-split-row"><span>' + s[1] + '</span><strong>' + count + '</strong></div>';
    }).filter(Boolean).join('') || '<div class="dash-empty">No leads yet</div>';

    // Tables
    renderDashboardTable('dashNewestLeads', filtered.slice(0, 8));
    renderDashboardTable('dashNeedsAttention', openLeads.filter(function (l) {
      return l.status === 'entered' && l.created_at && new Date(l.created_at) <= startOfDay(2);
    }).slice(0, 8));
  }

  function renderDashboardTable(containerId, leads) {
    const container = document.getElementById(containerId);
    if (!leads.length) {
      container.innerHTML = '<div class="dash-empty">No leads to show</div>';
      return;
    }
    let html = '<table class="dash-table">' +
      '<thead><tr><th>Name</th><th>Phone</th><th>Pool</th><th>Status</th><th>Entered</th></tr></thead><tbody>';
    leads.forEach(function (l) {
      html += '<tr>' +
        '<td>' + escapeHtml(l.full_name || '-') + '</td>' +
        '<td>' + escapeHtml(l.phone || '-') + '</td>' +
        '<td>' + poolLabel(l.pool) + '</td>' +
        '<td>' + statusBadge(l.status) + '</td>' +
        '<td>' + fmtDateShort(l.created_at) + '</td>' +
        '</tr>';
    });
    html += '</tbody></table>';
    container.innerHTML = html;
  }

  function poolLabel(pool) {
    const p = POOLS.find(function (x) { return x.key === pool; });
    const cls = pool === 'new_member' ? 'tag-active' : pool === 'non_attendance' ? 'tag-closed' : pool === 'birthday' ? 'tag-hot' : 'tag-draft';
    return '<span class="tag ' + cls + '">' + (p ? p.label : 'Giveaway') + '</span>';
  }

  function statusBadge(status) {
    const s = STATUSES.find(function (x) { return x[0] === status; });
    return '<span class="tag ' + (status === 'converted' ? 'tag-active' : CLOSED_STATUSES.includes(status) ? 'tag-archived' : 'tag-draft') + '">' + (s ? s[1] : status) + '</span>';
  }

  // ---------- strategies ----------

  function gatherStrategyPayload() {
    const ongoing = document.getElementById('stratOngoing').checked;
    return {
      name: document.getElementById('stratName').value.trim(),
      type: document.getElementById('stratType').value,
      status: 'draft',
      starts_at: ongoing ? null : (document.getElementById('stratStarts').value ? new Date(document.getElementById('stratStarts').value).toISOString() : null),
      ends_at: ongoing ? null : (document.getElementById('stratEnds').value ? new Date(document.getElementById('stratEnds').value).toISOString() : null),
      description: document.getElementById('stratDesc').value.trim() || null,
      utm_source: document.getElementById('stratUtmSource').value.trim() || null,
      utm_medium: document.getElementById('stratUtmMedium').value.trim() || null,
      utm_campaign: document.getElementById('stratUtmCampaign').value.trim() || null,
      sms_template: document.getElementById('stratSmsTemplate').value.trim() || null,
      updated_at: new Date().toISOString()
    };
  }

  async function createStrategy() {
    const btn = document.getElementById('createStratBtn');
    const msg = document.getElementById('stratMsg');
    msg.className = 'msg';

    const payload = gatherStrategyPayload();
    if (!payload.name) {
      showMsg(msg, 'Please enter a strategy name.', 'error');
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Creating...';

    try {
      const { error } = await client.from('marketing_strategies').insert(payload);
      if (error) throw error;
      showMsg(msg, 'Strategy created. Activate it when you are ready to collect leads.', 'success');
      clearStrategyForm();
      await loadData();
    } catch (err) {
      console.error(err);
      showMsg(msg, err.message || 'Could not create strategy.', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Create Strategy';
    }
  }

  function clearStrategyForm() {
    document.getElementById('stratName').value = '';
    document.getElementById('stratType').value = 'giveaway';
    document.getElementById('stratOngoing').checked = false;
    document.getElementById('stratDateRow').style.display = 'grid';
    document.getElementById('stratStarts').value = '';
    document.getElementById('stratEnds').value = '';
    document.getElementById('stratDesc').value = '';
    document.getElementById('stratUtmSource').value = '';
    document.getElementById('stratUtmMedium').value = '';
    document.getElementById('stratUtmCampaign').value = '';
    document.getElementById('stratSmsTemplate').value = '';
  }

  function toggleStrategyDates() {
    const ongoing = document.getElementById('stratOngoing').checked;
    document.getElementById('stratDateRow').style.display = ongoing ? 'none' : 'grid';
    if (ongoing) {
      document.getElementById('stratStarts').value = '';
      document.getElementById('stratEnds').value = '';
    }
  }

  async function updateStrategyStatus(id, status) {
    try {
      const { error } = await client.from('marketing_strategies').update({ status: status, updated_at: new Date().toISOString() }).eq('id', id);
      if (error) throw error;
      await loadData();
    } catch (err) {
      alert('Could not update strategy status: ' + err.message);
    }
  }

  async function deleteStrategy(id) {
    const leadCount = allLeads.filter(function (l) { return l.strategy_id === id; }).length;
    const compCount = allCompetitions.filter(function (c) { return c.strategy_id === id; }).length;
    let warning = '';
    if (leadCount) warning += ' It has ' + leadCount + ' lead(s).';
    if (compCount) warning += ' It has ' + compCount + ' giveaway(s) which will be unlinked.';
    if (!confirm('Delete this strategy?' + warning)) return;
    try {
      const { error } = await client.from('marketing_strategies').delete().eq('id', id);
      if (error) throw error;
      await loadData();
    } catch (err) {
      alert('Could not delete strategy: ' + err.message);
    }
  }

  function renderStrategies() {
    const container = document.getElementById('strategyList');
    if (!allStrategies.length) {
      container.innerHTML = '<p style="color:var(--ink-soft);font-size:14px;">No strategies yet. Create one above.</p>';
      return;
    }

    let html = '';
    allStrategies.forEach(function (s) {
      const typeLabel = fmtStratType(s.type);
      const status = fmtStratStatus(s.status);
      const dates = (s.starts_at || s.ends_at) ? ' · ' + fmtDate(s.starts_at) + ' – ' + fmtDate(s.ends_at) : '';

      html += '<div class="competition-row" data-id="' + escapeHtml(s.id) + '" style="align-items:flex-start;">' +
        '<div style="flex:1;">' +
          '<div class="cr-name">' + escapeHtml(s.name || 'Unnamed') + ' <span class="' + stratStatusClass(s.status) + '">' + status + '</span></div>' +
          '<div class="cr-dates">' + typeLabel + dates + '</div>' +
          (s.description ? '<div class="cr-dates" style="margin-top:4px;">' + escapeHtml(s.description) + '</div>' : '') +
        '</div>' +
        '<div class="cr-actions">' +
          (s.status === 'active'
            ? '<button class="admin-btn danger" onclick="updateStrategyStatus(\'' + s.id + '\', \'paused\')">Pause</button>'
            : '<button class="admin-btn" onclick="updateStrategyStatus(\'' + s.id + '\', \'active\')">' + (s.status === 'archived' ? 'Reopen' : 'Activate') + '</button>') +
          (s.status !== 'archived' ? '<button class="admin-btn" onclick="updateStrategyStatus(\'' + s.id + '\', \'archived\')">Archive</button>' : '') +
          '<button class="admin-btn" onclick="toggleStrategyEditForm(\'' + s.id + '\')">Edit</button>' +
          '<button class="admin-btn danger" onclick="deleteStrategy(\'' + s.id + '\')">Delete</button>' +
        '</div>' +
        '</div>' +
        '<div class="edit-form" id="edit-strategy-' + s.id + '" data-loaded="false"></div>';
    });
    container.innerHTML = html;
  }

  async function toggleStrategyEditForm(id) {
    const panel = document.getElementById('edit-strategy-' + id);
    const isOpen = panel.classList.contains('show');
    if (!isOpen) {
      panel.classList.add('show');
      if (panel.dataset.loaded !== 'true') {
        await renderStrategyEditForm(id, panel);
        panel.dataset.loaded = 'true';
      }
    } else {
      panel.classList.remove('show');
    }
  }

  async function renderStrategyEditForm(id, panel) {
    const s = allStrategies.find(function (x) { return x.id === id; });
    if (!s) return;
    const ongoing = !s.starts_at && !s.ends_at;
    const typeOptions = [
      ['giveaway','Giveaway'],
      ['lead_magnet','Lead magnet'],
      ['challenge','Challenge'],
      ['webinar','Webinar'],
      ['funnel','Funnel'],
      ['other','Other']
    ].map(function (o) {
      return '<option value="' + o[0] + '"' + (s.type === o[0] ? ' selected' : '') + '>' + o[1] + '</option>';
    }).join('');

    panel.innerHTML =
      '<h4 style="font-size:16px;margin:0 0 14px;">Edit Strategy</h4>' +
      '<div class="form-row"><label>Name</label><input type="text" id="edit-strat-name-' + id + '" value="' + escapeHtml(s.name || '') + '" maxlength="120"></div>' +
      '<div class="two-col">' +
        '<div class="form-row"><label>Type</label><select id="edit-strat-type-' + id + '" value="' + escapeHtml(s.type || '') + '" onchange="this.setAttribute(\'value\', this.value)">' + typeOptions + '</select></div>' +
        '<div class="form-row"><label>Status</label><select id="edit-strat-status-' + id + '" value="' + escapeHtml(s.status || '') + '" onchange="this.setAttribute(\'value\', this.value)">' +
          '<option value="draft"' + (s.status === 'draft' ? ' selected' : '') + '>Draft</option>' +
          '<option value="active"' + (s.status === 'active' ? ' selected' : '') + '>Active</option>' +
          '<option value="paused"' + (s.status === 'paused' ? ' selected' : '') + '>Paused</option>' +
          '<option value="archived"' + (s.status === 'archived' ? ' selected' : '') + '>Archived</option>' +
        '</select></div>' +
      '</div>' +
      '<div class="form-row"><label>Description / notes</label><textarea id="edit-strat-desc-' + id + '" rows="2">' + escapeHtml(s.description || '') + '</textarea></div>' +
      '<div class="check-row" style="margin-bottom:14px;">' +
        '<input type="checkbox" id="edit-strat-ongoing-' + id + '"' + (ongoing ? ' checked' : '') + ' onchange="document.getElementById(\'edit-strat-dates-' + id + '\').style.display = this.checked ? \'none\' : \'grid\'; if(this.checked){ document.getElementById(\'edit-strat-starts-' + id + '\').value=\'\'; document.getElementById(\'edit-strat-ends-' + id + '\').value=\'\'; }">' +
        '<label for="edit-strat-ongoing-' + id + '" style="display:inline;margin:0;">Ongoing strategy — no fixed start/end dates</label>' +
      '</div>' +
      '<div class="two-col" id="edit-strat-dates-' + id + '" style="display:' + (ongoing ? 'none' : 'grid') + ';">' +
        '<div class="form-row"><label>Start date</label><input type="datetime-local" id="edit-strat-starts-' + id + '" value="' + toDatetimeLocal(s.starts_at) + '"></div>' +
        '<div class="form-row"><label>End date</label><input type="datetime-local" id="edit-strat-ends-' + id + '" value="' + toDatetimeLocal(s.ends_at) + '"></div>' +
      '</div>' +
      '<div class="two-col">' +
        '<div class="form-row"><label>UTM source</label><input type="text" id="edit-strat-utm-source-' + id + '" value="' + escapeHtml(s.utm_source || '') + '"></div>' +
        '<div class="form-row"><label>UTM medium</label><input type="text" id="edit-strat-utm-medium-' + id + '" value="' + escapeHtml(s.utm_medium || '') + '"></div>' +
      '</div>' +
      '<div class="form-row"><label>UTM campaign</label><input type="text" id="edit-strat-utm-campaign-' + id + '" value="' + escapeHtml(s.utm_campaign || '') + '"></div>' +
      '<div class="form-row"><label>SMS template</label><textarea id="edit-strat-sms-' + id + '" rows="3" placeholder="Hi {first_name}, this is CRF Comps about the {strategy_name}...">' + escapeHtml(s.sms_template || '') + '</textarea>' +
        '<p style="font-size:13px;color:var(--ink-soft);margin-top:6px;">Placeholders: <b>{first_name}</b>, <b>{last_name}</b>, <b>{full_name}</b>, <b>{phone}</b>, <b>{email}</b>, <b>{strategy_name}</b>, plus any extra upload column such as <b>{age}</b> or <b>{birth_month}</b>.</p></div>' +
      '<div class="admin-actions">' +
        '<button class="admin-btn" onclick="saveStrategyEdit(\'' + id + '\')">Save Changes</button>' +
        '<button class="admin-btn" onclick="document.getElementById(\'edit-strategy-' + id + '\').classList.remove(\'show\')">Cancel</button>' +
      '</div>';
  }

  async function saveStrategyEdit(id) {
    const ongoing = document.getElementById('edit-strat-ongoing-' + id).checked;
    const name = document.getElementById('edit-strat-name-' + id).value.trim();
    if (!name) {
      alert('Strategy name is required.');
      return;
    }

    const payload = {
      name: name,
      type: document.getElementById('edit-strat-type-' + id).value,
      status: document.getElementById('edit-strat-status-' + id).value,
      description: document.getElementById('edit-strat-desc-' + id).value.trim() || null,
      starts_at: ongoing ? null : (document.getElementById('edit-strat-starts-' + id).value ? new Date(document.getElementById('edit-strat-starts-' + id).value).toISOString() : null),
      ends_at: ongoing ? null : (document.getElementById('edit-strat-ends-' + id).value ? new Date(document.getElementById('edit-strat-ends-' + id).value).toISOString() : null),
      utm_source: document.getElementById('edit-strat-utm-source-' + id).value.trim() || null,
      utm_medium: document.getElementById('edit-strat-utm-medium-' + id).value.trim() || null,
      utm_campaign: document.getElementById('edit-strat-utm-campaign-' + id).value.trim() || null,
      sms_template: document.getElementById('edit-strat-sms-' + id).value.trim() || null,
      updated_at: new Date().toISOString()
    };

    if (payload.ends_at && payload.starts_at && new Date(payload.ends_at) <= new Date(payload.starts_at)) {
      alert('End date must be after start date.');
      return;
    }

    try {
      const { error } = await client.from('marketing_strategies').update(payload).eq('id', id);
      if (error) throw error;
      document.getElementById('edit-strategy-' + id).classList.remove('show');
      await loadData();
    } catch (err) {
      alert('Could not save strategy: ' + err.message);
    }
  }

  // ---------- competitions ----------

  function gatherCompetitionPayload() {
    const value = parseFloat(document.getElementById('compValue').value);
    const strategyId = document.getElementById('compStrategy').value;

    return {
      name: document.getElementById('compName').value.trim(),
      strategy_id: strategyId || null,
      status: document.getElementById('compStatus').value || 'draft',
      type: document.getElementById('compType').value,
      starts_at: document.getElementById('compStarts').value ? new Date(document.getElementById('compStarts').value).toISOString() : null,
      ends_at: document.getElementById('compEnds').value ? new Date(document.getElementById('compEnds').value).toISOString() : null,
      prize_value: isNaN(value) ? 0 : value,
      prize_main: document.getElementById('compMain').value.trim() || 'Main giveaway prize',
      prize_main_bullets: document.getElementById('compMainBullets').value.trim() || null,
      prize_runner_up: document.getElementById('compRunnerUp').value.trim() || null,
      prize_runner_up_bullets: document.getElementById('compRunnerUpBullets').value.trim() || null,
      prize_runner_up_2: document.getElementById('compRunnerUp2').value.trim() || null,
      prize_runner_up_2_bullets: document.getElementById('compRunnerUp2Bullets').value.trim() || null,
      prize_description: document.getElementById('compPrizeDesc').value.trim() || null,
      hero_headline: document.getElementById('compHeadline').value.trim() || 'Enter for free.<br><em>Win coaching.</em>',
      hero_subheadline: document.getElementById('compSub').value.trim() || 'Join the current giveaway for a chance to win coaching prizes. No purchase needed.',
      rules_text: document.getElementById('compRules').value.trim() || null,
      updated_at: new Date().toISOString()
    };
  }

  async function createCompetition() {
    const btn = document.getElementById('createCompBtn');
    const msg = document.getElementById('compMsg');
    msg.className = 'msg';

    const payload = gatherCompetitionPayload();
    if (!payload.name) {
      showMsg(msg, 'Please enter a giveaway name.', 'error');
      return;
    }
    if (!payload.starts_at || !payload.ends_at) {
      showMsg(msg, 'Please set a start and end date.', 'error');
      return;
    }
    if (new Date(payload.ends_at) <= new Date(payload.starts_at)) {
      showMsg(msg, 'End date must be after start date.', 'error');
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Creating...';

    try {
      const { error } = await client.from('competitions').insert(payload);
      if (error) throw error;
      showMsg(msg, 'Giveaway created. Set it to Active when you are ready to open entries.', 'success');
      clearCompForm();
      await loadData();
    } catch (err) {
      console.error(err);
      showMsg(msg, err.message || 'Could not create giveaway.', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Create Giveaway';
    }
  }

  function clearCompForm() {
    document.getElementById('compName').value = '';
    document.getElementById('compStrategy').value = '';
    document.getElementById('compStatus').value = 'draft';
    document.getElementById('compType').value = 'random_draw';
    document.getElementById('compStarts').value = '';
    document.getElementById('compEnds').value = '';
    document.getElementById('compMain').value = '';
    document.getElementById('compMainBullets').value = '';
    document.getElementById('compRunnerUp').value = '';
    document.getElementById('compRunnerUpBullets').value = '';
    document.getElementById('compRunnerUp2').value = '';
    document.getElementById('compRunnerUp2Bullets').value = '';
    document.getElementById('compValue').value = '';
    document.getElementById('compPrizeDesc').value = '';
    document.getElementById('compHeadline').value = '';
    document.getElementById('compSub').value = '';
    document.getElementById('compRules').value = '';
  }

  async function updateCompetitionStatus(id, status) {
    try {
      if (status === 'active') {
        const active = allCompetitions.find(function (c) { return c.status === 'active' && c.id !== id; });
        if (active) {
          if (!confirm('Another giveaway is already active. Activating this one will close it. Continue?')) return;
          const { error: closeErr } = await client.from('competitions').update({ status: 'closed' }).eq('id', active.id);
          if (closeErr) throw closeErr;
        }
      }

      const { error } = await client.from('competitions').update({ status: status }).eq('id', id);
      if (error) throw error;
      await loadData();
    } catch (err) {
      alert('Could not update status: ' + err.message);
    }
  }

  async function deleteCompetition(id) {
    const leadCount = allLeads.filter(function (l) { return l.competition_id === id; }).length;
    if (!confirm('Delete this giveaway?' + (leadCount ? ' It has ' + leadCount + ' lead(s) which will also be removed.' : ''))) return;
    try {
      const { error } = await client.from('competitions').delete().eq('id', id);
      if (error) throw error;
      await loadData();
    } catch (err) {
      alert('Could not delete giveaway: ' + err.message);
    }
  }

  function renderCompetitions() {
    const container = document.getElementById('competitionList');
    if (!allCompetitions.length) {
      container.innerHTML = '<p style="color:var(--ink-soft);font-size:14px;">No giveaways yet. Create one above.</p>';
      return;
    }

    let html = '';
    allCompetitions.forEach(function (c) {
      const typeLabel = fmtType(c.type);
      const status = fmtStatus(c.status);
      const main = c.prize_main || 'Main prize not set';
      const valueText = c.prize_value ? ' · Value $' + Number(c.prize_value).toLocaleString() : '';

      html += '<div class="competition-row" data-id="' + escapeHtml(c.id) + '" style="align-items:flex-start;">' +
        '<div style="flex:1;">' +
          '<div class="cr-name">' + escapeHtml(c.name || 'Unnamed') + ' <span class="' + statusClass(c.status) + '">' + status + '</span></div>' +
          '<div class="cr-dates">' + typeLabel + ' · ' + fmtDate(c.starts_at) + ' – ' + fmtDate(c.ends_at) + valueText + '</div>' +
          '<div class="cr-dates" style="margin-top:4px;">Main: ' + escapeHtml(main) + '</div>' +
        '</div>' +
        '<div class="cr-actions">' +
          (c.status === 'active'
            ? '<button class="admin-btn danger" onclick="updateCompetitionStatus(\'' + c.id + '\', \'closed\')">Close</button>'
            : '<button class="admin-btn" onclick="updateCompetitionStatus(\'' + c.id + '\', \'active\')">' + (c.status === 'archived' ? 'Reopen' : 'Activate') + '</button>') +
          (c.status !== 'archived' ? '<button class="admin-btn" onclick="updateCompetitionStatus(\'' + c.id + '\', \'archived\')">Archive</button>' : '') +
          '<button class="admin-btn" onclick="toggleEditForm(\'' + c.id + '\')">Edit</button>' +
          '<button class="admin-btn danger" onclick="deleteCompetition(\'' + c.id + '\')">Delete</button>' +
        '</div>' +
        '</div>' +
        '<div class="edit-form" id="edit-' + c.id + '" data-loaded="false"></div>';
    });
    container.innerHTML = html;
  }

  async function toggleEditForm(id) {
    const panel = document.getElementById('edit-' + id);
    const isOpen = panel.classList.contains('show');
    if (!isOpen) {
      panel.classList.add('show');
      if (panel.dataset.loaded !== 'true') {
        await renderEditForm(id, panel);
        panel.dataset.loaded = 'true';
      }
    } else {
      panel.classList.remove('show');
    }
  }

  async function renderEditForm(id, panel) {
    const c = allCompetitions.find(function (x) { return x.id === id; });
    if (!c) return;

    panel.innerHTML =
      '<h4 style="font-size:16px;margin:0 0 14px;">Edit Competition</h4>' +
      '<div class="two-col">' +
        '<div class="form-row"><label>Name</label><input type="text" id="edit-name-' + c.id + '" value="' + escapeHtml(c.name) + '"></div>' +
        '<div class="form-row"><label>Marketing strategy</label><select id="edit-strategy-' + c.id + '">' + renderStrategyOptions(c.strategy_id) + '</select></div>' +
      '</div>' +
      '<div class="two-col">' +
        '<div class="form-row"><label>Type</label><select id="edit-type-' + c.id + '" value="' + escapeHtml(c.type) + '" onchange="this.setAttribute(\'value\', this.value)">' +
          '<option value="random_draw"' + (c.type === 'random_draw' ? ' selected' : '') + '>Random draw</option>' +
          '<option value="referral"' + (c.type === 'referral' ? ' selected' : '') + '>Referral giveaway</option>' +
          '<option value="other"' + (c.type === 'other' ? ' selected' : '') + '>Other</option>' +
        '</select></div>' +
      '</div>' +
      '<div class="two-col">' +
        '<div class="form-row"><label>Start</label><input type="datetime-local" id="edit-starts-' + c.id + '" value="' + toDatetimeLocal(c.starts_at) + '"></div>' +
        '<div class="form-row"><label>End</label><input type="datetime-local" id="edit-ends-' + c.id + '" value="' + toDatetimeLocal(c.ends_at) + '"></div>' +
      '</div>' +
      '<div class="form-row"><label>Main giveaway prize</label><input type="text" id="edit-main-' + c.id + '" value="' + escapeHtml(c.prize_main || '') + '"></div>' +
      '<div class="form-row"><label>Main prize bullet points (one per line)</label><textarea id="edit-main-bullets-' + c.id + '" rows="3">' + escapeHtml(c.prize_main_bullets || '') + '</textarea></div>' +
      '<div class="two-col">' +
        '<div class="form-row"><label>Runner-up prize (optional)</label><input type="text" id="edit-runnerup-' + c.id + '" value="' + escapeHtml(c.prize_runner_up || '') + '"></div>' +
        '<div class="form-row"><label>Second runner-up (optional)</label><input type="text" id="edit-runnerup2-' + c.id + '" value="' + escapeHtml(c.prize_runner_up_2 || '') + '"></div>' +
      '</div>' +
      '<div class="two-col">' +
        '<div class="form-row"><label>Runner-up bullets (optional)</label><textarea id="edit-runnerup-bullets-' + c.id + '" rows="3">' + escapeHtml(c.prize_runner_up_bullets || '') + '</textarea></div>' +
        '<div class="form-row"><label>Second runner-up bullets (optional)</label><textarea id="edit-runnerup2-bullets-' + c.id + '" rows="3">' + escapeHtml(c.prize_runner_up_2_bullets || '') + '</textarea></div>' +
      '</div>' +
      '<div class="two-col">' +
        '<div class="form-row"><label>Total value ($) — optional</label><input type="number" id="edit-value-' + c.id + '" value="' + (c.prize_value || '') + '"></div>' +
        '<div class="form-row"><label>Prize notes</label><input type="text" id="edit-desc-' + c.id + '" value="' + escapeHtml(c.prize_description || '') + '"></div>' +
      '</div>' +
      '<div class="form-row"><label>Hero headline (HTML allowed)</label><input type="text" id="edit-headline-' + c.id + '" value="' + escapeHtml(c.hero_headline || '') + '"></div>' +
      '<div class="form-row"><label>Hero subheadline</label><textarea id="edit-sub-' + c.id + '" rows="2">' + escapeHtml(c.hero_subheadline || '') + '</textarea></div>' +
      '<div class="form-row"><label>Rules text (one rule per line)</label><textarea id="edit-rules-' + c.id + '" rows="4">' + escapeHtml(c.rules_text || '') + '</textarea></div>' +
      '<div class="admin-actions">' +
        '<button class="admin-btn" onclick="saveCompetitionEdit(\'' + c.id + '\')">Save Changes</button>' +
        '<button class="admin-btn" onclick="document.getElementById(\'edit-' + c.id + '\').classList.remove(\'show\')">Cancel</button>' +
      '</div>';
  }

  function renderStrategyOptions(selectedId) {
    let html = '';
    allStrategies.forEach(function (s) {
      html += '<option value="' + escapeHtml(s.id) + '"' + (s.id === selectedId ? ' selected' : '') + '>' + escapeHtml((s.name || 'Unnamed') + ' · ' + fmtStratType(s.type)) + '</option>';
    });
    return html;
  }

  async function saveCompetitionEdit(id) {
    const value = parseFloat(document.getElementById('edit-value-' + id).value);

    const payload = {
      name: document.getElementById('edit-name-' + id).value.trim(),
      strategy_id: document.getElementById('edit-strategy-' + id).value || null,
      type: document.getElementById('edit-type-' + id).value,
      starts_at: document.getElementById('edit-starts-' + id).value ? new Date(document.getElementById('edit-starts-' + id).value).toISOString() : null,
      ends_at: document.getElementById('edit-ends-' + id).value ? new Date(document.getElementById('edit-ends-' + id).value).toISOString() : null,
      prize_value: isNaN(value) ? 0 : value,
      prize_main: document.getElementById('edit-main-' + id).value.trim() || 'Main giveaway prize',
      prize_main_bullets: document.getElementById('edit-main-bullets-' + id).value.trim() || null,
      prize_runner_up: document.getElementById('edit-runnerup-' + id).value.trim() || null,
      prize_runner_up_bullets: document.getElementById('edit-runnerup-bullets-' + id).value.trim() || null,
      prize_runner_up_2: document.getElementById('edit-runnerup2-' + id).value.trim() || null,
      prize_runner_up_2_bullets: document.getElementById('edit-runnerup2-bullets-' + id).value.trim() || null,
      prize_description: document.getElementById('edit-desc-' + id).value.trim() || null,
      hero_headline: document.getElementById('edit-headline-' + id).value.trim() || 'Enter for free.<br><em>Win coaching.</em>',
      hero_subheadline: document.getElementById('edit-sub-' + id).value.trim() || 'Join the current giveaway for a chance to win coaching prizes. No purchase needed.',
      rules_text: document.getElementById('edit-rules-' + id).value.trim() || null,
      updated_at: new Date().toISOString()
    };

    if (!payload.name) {
      alert('Giveaway name is required.');
      return;
    }
    if (payload.ends_at && payload.starts_at && new Date(payload.ends_at) <= new Date(payload.starts_at)) {
      alert('End date must be after start date.');
      return;
    }

    try {
      const { error } = await client.from('competitions').update(payload).eq('id', id);
      if (error) throw error;
      document.getElementById('edit-' + id).classList.remove('show');
      await loadData();
    } catch (err) {
      alert('Could not save changes: ' + err.message);
    }
  }

  // ---------- lead pools ----------

  function renderLeadPool(pool) {
    const page = document.getElementById('page-' + pool);
    if (!page) return;
    const search = page.querySelector('.pool-search').value.toLowerCase();
    const strategyFilter = page.querySelector('.pool-strategy').value;
    const compFilter = page.querySelector('.pool-comp').value;
    const statusFilter = page.querySelector('.pool-status').value;

    let filtered = allLeads.filter(function (l) {
      return (l.pool || 'giveaway') === pool;
    });

    filtered = filtered.filter(function (l) {
      const matchesSearch = !search ||
        (l.full_name || '').toLowerCase().includes(search) ||
        (l.email || '').toLowerCase().includes(search) ||
        (l.phone || '').toLowerCase().includes(search);
      const matchesStrategy = strategyFilter === 'all' || l.strategy_id === strategyFilter;
      const matchesComp = compFilter === 'all' || l.competition_id === compFilter;
      const matchesStatus = statusFilter === 'all' || l.status === statusFilter;
      return matchesSearch && matchesStrategy && matchesComp && matchesStatus;
    });

    // Stats
    const stats = page.querySelector('.pool-stats');
    const total = filtered.length;
    const open = filtered.filter(function (l) { return ACTIVE_STATUSES.includes(l.status); }).length;
    const converted = filtered.filter(function (l) { return l.status === 'converted'; }).length;
    const cold = filtered.filter(function (l) { return l.status === 'entered' && l.created_at && new Date(l.created_at) <= startOfDay(7); }).length;
    stats.innerHTML =
      '<div class="stat-box"><div class="stat-label">Total</div><div class="stat-value">' + total + '</div></div>' +
      '<div class="stat-box"><div class="stat-label">Open</div><div class="stat-value">' + open + '</div></div>' +
      '<div class="stat-box"><div class="stat-label">Converted</div><div class="stat-value">' + converted + '</div></div>' +
      '<div class="stat-box"><div class="stat-label">Cold</div><div class="stat-value">' + cold + '</div></div>';

    const container = page.querySelector('.pool-table-wrap');
    if (!filtered.length) {
      container.innerHTML = '<div class="empty">No leads match your filters.</div>';
      return;
    }

    let html = '<table class="data-table">' +
      '<thead><tr>' +
        '<th><input type="checkbox" class="select-all-leads" onchange="toggleSelectAllLeads(\'' + pool + '\')"></th>' +
        '<th>Name</th>' +
        '<th>Email</th>' +
        '<th>Phone</th>' +
        '<th>Strategy</th>' +
        '<th>Giveaway</th>' +
        '<th>Entered</th>' +
        '<th>Status</th>' +
        '<th>Actions</th>' +
      '</tr></thead><tbody>';

    filtered.forEach(function (l) {
      html += '<tr>' +
        '<td><input type="checkbox" class="lead-check lead-check-' + pool + '" value="' + escapeHtml(l.id) + '" onchange="updateSelectAllState(\'' + pool + '\')"></td>' +
        '<td>' + escapeHtml(l.full_name || '-') + '</td>' +
        '<td>' + escapeHtml(l.email || '') + '</td>' +
        '<td>' + renderPhoneLinks(l.phone) + '</td>' +
        '<td>' + escapeHtml(getStrategyName(l.strategy_id)) + '</td>' +
        '<td>' + escapeHtml(getCompName(l.competition_id)) + '</td>' +
        '<td>' + fmtDateShort(l.created_at) + '</td>' +
        '<td><select onchange="updateLeadStatus(\'' + l.id + '\', this.value)" style="font-size:12px;padding:4px 8px;border-radius:var(--radius);border:1.5px solid var(--line);">' + renderStatusOptions(l.status) + '</select></td>' +
        '<td>' +
          '<button class="admin-btn" onclick="openSmsWithTemplate(\'' + l.id + '\')" style="padding:6px 12px;font-size:11px;margin-right:6px;">Template SMS</button>' +
          '<button class="admin-btn danger" onclick="deleteLead(\'' + l.id + '\')" style="padding:6px 12px;font-size:11px;">Delete</button>' +
        '</td>' +
      '</tr>';
    });

    html += '</tbody></table>';
    container.innerHTML = html;
  }

  function renderPhoneLinks(phone) {
    if (!phone) return '-';
    const clean = String(phone).replace(/\s/g, '');
    return '<span class="phone-actions">' +
      '<a href="tel:' + escapeHtml(clean) + '" title="Call" style="margin-right:10px;">' + escapeHtml(phone) + ' · Call</a>' +
      '<a href="sms:' + escapeHtml(clean) + '" title="SMS">SMS</a>' +
      '</span>';
  }

  function renderStatusOptions(current) {
    return STATUSES.map(function (o) {
      return '<option value="' + o[0] + '"' + (current === o[0] ? ' selected' : '') + '>' + o[1] + '</option>';
    }).join('');
  }

  function fillSmsTemplate(template, lead, strategy) {
    if (!template) return '';
    const { first, last } = splitName(lead.full_name);
    let result = template
      .replace(/\{first_name\}/gi, first)
      .replace(/\{last_name\}/gi, last)
      .replace(/\{full_name\}/gi, lead.full_name || '')
      .replace(/\{phone\}/gi, lead.phone || '')
      .replace(/\{email\}/gi, lead.email || '')
      .replace(/\{strategy_name\}/gi, strategy ? (strategy.name || '') : '');

    const tagMap = {};
    (lead.tags || []).forEach(function (tag) {
      const colon = tag.indexOf(':');
      if (colon > 0) {
        const key = tag.slice(0, colon).trim().toLowerCase();
        const val = tag.slice(colon + 1).trim();
        if (key && !tagMap.hasOwnProperty(key)) tagMap[key] = val;
      }
    });

    result = result.replace(/\{([a-z0-9_]+)\}/gi, function (match, key) {
      return tagMap.hasOwnProperty(key) ? tagMap[key] : match;
    });

    return result;
  }

  async function openSmsWithTemplate(id) {
    const lead = allLeads.find(function (x) { return x.id === id; });
    if (!lead) return;
    if (!lead.phone) {
      alert('This lead has no phone number.');
      return;
    }
    const strategy = allStrategies.find(function (x) { return x.id === lead.strategy_id; });
    const template = strategy ? (strategy.sms_template || '') : '';
    if (!template) {
      if (confirm('No SMS template for this strategy. Send a blank SMS instead?')) {
        const clean = String(lead.phone).replace(/\s/g, '');
        window.location.href = 'sms:' + clean;
      }
      return;
    }
    const body = fillSmsTemplate(template, lead, strategy);
    if (!confirm('Open Messages with:\n\n' + body)) return;

    const clean = String(lead.phone).replace(/\s/g, '');
    window.location.href = 'sms:' + clean + '?body=' + encodeURIComponent(body);

    try {
      const { error } = await client.from('leads').update({ status: 'sms_sent', last_contact_at: new Date().toISOString() }).eq('id', id);
      if (error) throw error;
      lead.status = 'sms_sent';
      lead.last_contact_at = new Date().toISOString();
      refreshLeadViews();
    } catch (err) {
      console.error('Could not update lead status after SMS:', err);
    }
  }

  function getSelectedLeadIds(pool) {
    const ids = [];
    document.querySelectorAll('.lead-check-' + pool + ':checked').forEach(function (cb) {
      ids.push(cb.value);
    });
    return ids;
  }

  function toggleSelectAllLeads(pool) {
    const master = document.querySelector('#page-' + pool + ' .select-all-leads');
    const checked = master ? master.checked : false;
    document.querySelectorAll('.lead-check-' + pool).forEach(function (cb) {
      cb.checked = checked;
    });
  }

  function updateSelectAllState(pool) {
    const master = document.querySelector('#page-' + pool + ' .select-all-leads');
    if (!master) return;
    const boxes = document.querySelectorAll('.lead-check-' + pool);
    if (!boxes.length) {
      master.checked = false;
      return;
    }
    master.checked = Array.from(boxes).every(function (cb) { return cb.checked; });
  }

  async function deleteSelectedLeads(pool) {
    const ids = getSelectedLeadIds(pool);
    if (!ids.length) {
      alert('No leads selected.');
      return;
    }
    if (!confirm('Delete ' + ids.length + ' selected lead(s)? This cannot be undone.')) return;
    try {
      const { error } = await client.from('leads').delete().in('id', ids);
      if (error) throw error;
      await loadData();
    } catch (err) {
      alert('Could not delete leads: ' + err.message);
    }
  }

  async function updateLeadStatus(id, status) {
    try {
      const updates = { status: status };
      if (status === 'called' || status === 'sms_sent' || status === 'email_sent' || status === 'follow_up' || status === 'converted') {
        updates.last_contact_at = new Date().toISOString();
      }
      const { error } = await client.from('leads').update(updates).eq('id', id);
      if (error) throw error;
      const l = allLeads.find(function (x) { return x.id === id; });
      if (l) {
        l.status = status;
        if (updates.last_contact_at) l.last_contact_at = updates.last_contact_at;
      }
      refreshLeadViews();
    } catch (err) {
      alert('Could not update lead status: ' + err.message);
      await loadData();
    }
  }

  function refreshLeadViews() {
    renderDashboard();
    POOLS.forEach(function (p) { renderLeadPool(p.key); });
  }

  async function deleteLead(id) {
    if (!confirm('Delete this lead? This cannot be undone.')) return;
    try {
      const { error } = await client.from('leads').delete().eq('id', id);
      if (error) throw error;
      await loadData();
    } catch (err) {
      alert('Could not delete lead: ' + err.message);
    }
  }

  function pickRandomWinner(pool) {
    const page = document.getElementById('page-' + pool);
    const strategyFilter = page.querySelector('.pool-strategy').value;
    const compFilter = page.querySelector('.pool-comp').value;
    const statusFilter = page.querySelector('.pool-status').value;

    let poolLeads = allLeads.filter(function (l) { return (l.pool || 'giveaway') === pool; });
    poolLeads = poolLeads.filter(function (l) {
      const matchesStrategy = strategyFilter === 'all' || l.strategy_id === strategyFilter;
      const matchesComp = compFilter === 'all' || l.competition_id === compFilter;
      const matchesStatus = statusFilter === 'all' || l.status === statusFilter;
      return matchesStrategy && matchesComp && matchesStatus;
    });

    if (!poolLeads.length) {
      alert('No leads match the current filters to draw from.');
      return;
    }

    const winner = poolLeads[Math.floor(Math.random() * poolLeads.length)];
    drawnWinner = winner;

    const panel = document.getElementById('winnerPanel');
    panel.classList.remove('hidden');
    document.getElementById('winnerName').textContent = winner.full_name || 'Unknown';
    document.getElementById('winnerDetail').textContent = (winner.email || '') + ' · ' + getCompName(winner.competition_id);
  }

  async function markWinnerFromPanel() {
    if (!drawnWinner) return;
    try {
      const { error } = await client.from('leads').update({ status: 'winner' }).eq('id', drawnWinner.id);
      if (error) throw error;
      document.getElementById('winnerPanel').classList.add('hidden');
      drawnWinner = null;
      await loadData();
    } catch (err) {
      alert('Could not mark winner: ' + err.message);
    }
  }

  function escapeCsv(val) {
    const str = String(val == null ? '' : val);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  }

  function exportCsv(pool) {
    const page = document.getElementById('page-' + pool);
    const search = page.querySelector('.pool-search').value.toLowerCase();
    const strategyFilter = page.querySelector('.pool-strategy').value;
    const compFilter = page.querySelector('.pool-comp').value;
    const statusFilter = page.querySelector('.pool-status').value;

    const rows = [];
    rows.push(['Name', 'Email', 'Phone', 'Strategy', 'Giveaway', 'Status', 'Opt In', 'Entered At', 'Tags']);

    allLeads.forEach(function (l) {
      if ((l.pool || 'giveaway') !== pool) return;
      const matchesSearch = !search ||
        (l.full_name || '').toLowerCase().includes(search) ||
        (l.email || '').toLowerCase().includes(search) ||
        (l.phone || '').toLowerCase().includes(search);
      const matchesStrategy = strategyFilter === 'all' || l.strategy_id === strategyFilter;
      const matchesComp = compFilter === 'all' || l.competition_id === compFilter;
      const matchesStatus = statusFilter === 'all' || l.status === statusFilter;
      if (!matchesSearch || !matchesStrategy || !matchesComp || !matchesStatus) return;

      rows.push([
        l.full_name || '',
        l.email || '',
        l.phone || '',
        getStrategyName(l.strategy_id),
        getCompName(l.competition_id),
        l.status || '',
        l.opt_in ? 'Yes' : 'No',
        l.created_at || '',
        (l.tags || []).join('; ')
      ]);
    });

    const csv = rows.map(function (r) { return r.map(escapeCsv).join(','); }).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'crfcomps-' + pool + '-leads-' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ---------- settings ----------

  async function loadSettingsPanel() {
    try {
      const s = await window.siteSettings.loadSiteSettings();
      currentSettings = s || {};
      document.getElementById('setBrand').value = currentSettings.brand_name || '';
      document.getElementById('setFallbackHeadline').value = currentSettings.fallback_headline || '';
      document.getElementById('setFallbackSub').value = currentSettings.fallback_subheadline || '';
      document.getElementById('setFallbackValue').value = currentSettings.fallback_prize_value || 0;
      document.getElementById('setAdminEmail').value = currentSettings.admin_contact_email || '';
    } catch (err) {
      console.error(err);
      const msg = document.getElementById('settingsMsg');
      showMsg(msg, 'Could not load settings: ' + err.message, 'error');
    }
  }

  async function saveSettings() {
    const btn = document.getElementById('saveSettingsBtn');
    const msg = document.getElementById('settingsMsg');
    msg.className = 'msg';

    const value = parseFloat(document.getElementById('setFallbackValue').value);

    const payload = {
      id: 1,
      updated_at: new Date().toISOString(),
      brand_name: document.getElementById('setBrand').value.trim(),
      fallback_headline: document.getElementById('setFallbackHeadline').value.trim(),
      fallback_subheadline: document.getElementById('setFallbackSub').value.trim(),
      fallback_prize_value: isNaN(value) ? 0 : value,
      admin_contact_email: document.getElementById('setAdminEmail').value.trim() || null
    };

    btn.disabled = true;
    btn.textContent = 'Saving...';

    try {
      const { error } = await client.from('site_settings').upsert(payload, { onConflict: 'id' });
      if (error) throw error;
      showMsg(msg, 'Settings saved.', 'success');
      await loadSettingsPanel();
    } catch (err) {
      console.error(err);
      showMsg(msg, err.message || 'Could not save settings.', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Save Settings';
    }
  }

  async function handleSignOut() {
    await window.auth.signOut();
    window.location.href = 'index.html';
  }

  // ---------- bulk upload ----------

  function parseDateApprox(val) {
    if (!val) return null;
    const s = String(val).trim();
    let d = new Date(s);
    if (!isNaN(d.getTime())) return d;
    const parts = s.split(/[\/\-\.]/);
    if (parts.length === 3) {
      const nums = parts.map(Number);
      if (nums.every(function (n) { return !isNaN(n); })) {
        d = new Date(nums[2], nums[1] - 1, nums[0]);
        if (!isNaN(d.getTime()) && nums[0] <= 31 && nums[1] <= 12) return d;
        d = new Date(nums[2], nums[0] - 1, nums[1]);
        if (!isNaN(d.getTime()) && nums[1] <= 31 && nums[0] <= 12) return d;
      }
    }
    return null;
  }

  function calculateAge(birthDate) {
    const now = new Date();
    let age = now.getFullYear() - birthDate.getFullYear();
    const m = now.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < birthDate.getDate())) age--;
    return age;
  }

  const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

  function parseDayNumber(val) {
    const n = parseInt(String(val || '').trim(), 10);
    if (!isNaN(n) && n >= 1 && n <= 31) return n;
    return null;
  }

  function deriveBirthdayTags(row, headers, forcedMonth) {
    const idx = headers.findIndex(function (h) {
      return h === 'birthday' || h === 'dob' || h === 'date_of_birth';
    });
    let d = null;
    if (idx >= 0) d = parseDateApprox(row[idx]);

    const tags = {};
    const age = d ? calculateAge(d) : null;
    if (!isNaN(age) && age >= 0) tags.age = String(age);

    if (forcedMonth) {
      tags.birth_month = forcedMonth;
      const dayIdx = headers.indexOf('birthday_day');
      if (dayIdx >= 0) {
        const day = parseDayNumber(row[dayIdx]);
        if (day) tags.birth_day = String(day);
      }
    } else if (d) {
      const monthName = d.toLocaleString(undefined, { month: 'long' });
      if (monthName) tags.birth_month = monthName;
    }
    return tags;
  }

  function normaliseHeader(h) {
    return String(h || '').toLowerCase().trim().replace(/\s+/g, '_');
  }

  function parseOptIn(val) {
    const s = String(val || '').toLowerCase().trim();
    if (!s) return true;
    return ['yes', 'true', '1', 'y'].includes(s);
  }

  function rowsToLeads(rows) {
    const headers = (rows[0] || []).map(normaliseHeader);
    const firstNameIdx = headers.indexOf('first_name');
    const lastNameIdx = headers.indexOf('last_name');
    const emailIdx = headers.indexOf('email');
    const mobileIdx = headers.indexOf('mobile');
    const optInIdx = headers.indexOf('opt_in');

    if (firstNameIdx === -1 || lastNameIdx === -1 || mobileIdx === -1) {
      throw new Error('CSV/Excel must have first_name, last_name and mobile columns.');
    }

    const known = new Set(['first_name', 'last_name', 'email', 'mobile', 'opt_in']);
    const extraIndexes = headers.map(function (h, i) {
      return known.has(h) ? -1 : i;
    }).filter(function (i) { return i !== -1; });

    const leads = [];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || !row.length) continue;
      const firstName = String(row[firstNameIdx] || '').trim();
      const lastName = String(row[lastNameIdx] || '').trim();
      const mobile = String(row[mobileIdx] || '').trim();
      if (!firstName || !lastName || !mobile) continue;

      const email = emailIdx === -1 ? '' : String(row[emailIdx] || '').trim();

      const seenKeys = new Set();
      const tags = [];
      extraIndexes.forEach(function (idx) {
        const key = headers[idx];
        const val = String(row[idx] || '').trim();
        if (val) {
          tags.push(key + ': ' + val);
          seenKeys.add(key);
        }
      });

      const derived = deriveBirthdayTags(row, headers);
      Object.keys(derived).forEach(function (key) {
        if (!seenKeys.has(key)) {
          tags.push(key + ': ' + derived[key]);
          seenKeys.add(key);
        }
      });

      leads.push({
        full_name: firstName + ' ' + lastName,
        email: email || null,
        phone: mobile,
        opt_in: optInIdx === -1 ? true : parseOptIn(row[optInIdx]),
        tags: tags.length ? tags : null
      });
    }
    return leads;
  }

  function parseCsv(text) {
    const rows = [];
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const cells = [];
      let cell = '';
      let inQuotes = false;
      for (let j = 0; j < line.length; j++) {
        const ch = line[j];
        const next = line[j + 1];
        if (ch === '"') {
          if (inQuotes && next === '"') {
            cell += '"';
            j++;
          } else {
            inQuotes = !inQuotes;
          }
        } else if (ch === ',' && !inQuotes) {
          cells.push(cell);
          cell = '';
        } else {
          cell += ch;
        }
      }
      cells.push(cell);
      rows.push(cells);
    }
    return rows;
  }

  function parseExcel(arrayBuffer) {
    if (typeof XLSX === 'undefined') {
      throw new Error('Excel library not loaded. Please refresh and try again.');
    }
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    const json = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: '' });
    return json;
  }

  function renderUploadPreview(leads, pool) {
    const container = document.getElementById('uploadPreviewRows-' + pool);
    let html = '<table style="width:100%;border-collapse:collapse;font-size:13px;">' +
      '<thead><tr><th style="text-align:left;padding:6px;border-bottom:1px solid var(--line);">Name</th>' +
      '<th style="text-align:left;padding:6px;border-bottom:1px solid var(--line);">Email</th>' +
      '<th style="text-align:left;padding:6px;border-bottom:1px solid var(--line);">Mobile</th>' +
      '<th style="text-align:left;padding:6px;border-bottom:1px solid var(--line);">Extra tags</th></tr></thead><tbody>';
    leads.slice(0, 10).forEach(function (l) {
      const extras = (l.tags || []).join(', ');
      html += '<tr><td style="padding:6px;border-bottom:1px solid var(--paper-2);">' + escapeHtml(l.full_name) + '</td>' +
        '<td style="padding:6px;border-bottom:1px solid var(--paper-2);">' + escapeHtml(l.email) + '</td>' +
        '<td style="padding:6px;border-bottom:1px solid var(--paper-2);">' + escapeHtml(l.phone || '-') + '</td>' +
        '<td style="padding:6px;border-bottom:1px solid var(--paper-2);" title="' + escapeHtml(extras) + '">' + escapeHtml(extras.slice(0, 40) + (extras.length > 40 ? '...' : '')) + '</td></tr>';
    });
    if (leads.length > 10) {
      html += '<tr><td colspan="4" style="padding:6px;color:var(--ink-soft);">... and ' + (leads.length - 10) + ' more</td></tr>';
    }
    html += '</tbody></table>';
    container.innerHTML = html;
    document.getElementById('uploadCount-' + pool).textContent = leads.length;
    document.getElementById('uploadPreview-' + pool).style.display = 'block';
    document.getElementById('uploadSubmitBtn-' + pool).disabled = leads.length === 0;
  }

  function resetUploadPreview(pool) {
    pendingUploadRows = [];
    document.getElementById('uploadPreview-' + pool).style.display = 'none';
    document.getElementById('uploadPreviewRows-' + pool).innerHTML = '';
    document.getElementById('uploadCount-' + pool).textContent = '0';
    document.getElementById('uploadSubmitBtn-' + pool).disabled = true;
  }

  async function handleFileUpload(pool) {
    const input = document.getElementById('uploadFile-' + pool);
    const msg = document.getElementById('uploadMsg-' + pool);
    msg.className = 'msg';
    resetUploadPreview(pool);

    const file = input.files[0];
    if (!file) return;

    try {
      const ext = file.name.split('.').pop().toLowerCase();
      let rows = [];
      if (ext === 'csv') {
        const text = await file.text();
        rows = parseCsv(text);
      } else if (ext === 'xlsx' || ext === 'xls') {
        const buffer = await file.arrayBuffer();
        rows = parseExcel(buffer);
      } else {
        throw new Error('Please upload a CSV or Excel (.xlsx/.xls) file.');
      }

      pendingUploadRows = rowsToLeads(rows);
      renderUploadPreview(pendingUploadRows, pool);
    } catch (err) {
      console.error(err);
      showMsg(msg, err.message || 'Could not read file.', 'error');
      input.value = '';
    }
  }

  async function submitBulkUpload(pool) {
    const btn = document.getElementById('uploadSubmitBtn-' + pool);
    const msg = document.getElementById('uploadMsg-' + pool);
    const strategyId = document.getElementById('uploadStrategy-' + pool).value;
    const source = document.getElementById('uploadSource-' + pool).value.trim() || 'bulk_import';
    msg.className = 'msg';

    // Strategy is required for giveaway leads (public entry flow), but optional for
    // new-member and non-attendance pools to keep speed-to-lead uploads frictionless.
    if (!strategyId && pool === 'giveaway') {
      showMsg(msg, 'Please select a strategy for giveaway leads.', 'error');
      return;
    }
    if (!pendingUploadRows.length) {
      showMsg(msg, 'No valid leads to import.', 'error');
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Importing...';

    const rows = pendingUploadRows.map(function (l) {
      return {
        strategy_id: strategyId || null,
        full_name: l.full_name,
        email: l.email,
        phone: l.phone,
        opt_in: l.opt_in,
        source: source,
        tags: l.tags,
        status: 'entered',
        pool: pool
      };
    });

    try {
      const { error } = await client.from('leads').insert(rows);
      if (error) throw error;
      showMsg(msg, pendingUploadRows.length + ' leads imported into ' + poolLabelText(pool) + '.', 'success');
      resetUploadPreview(pool);
      document.getElementById('uploadFile-' + pool).value = '';
      await loadData();
    } catch (err) {
      console.error(err);
      showMsg(msg, err.message || 'Could not import leads.', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Import Leads';
    }
  }

  function poolLabelText(pool) {
    const p = POOLS.find(function (x) { return x.key === pool; });
    return p ? p.label : pool;
  }

  // ---------- expose globals ----------

  window.navigate = navigate;
  window.toggleMobileNav = toggleMobileNav;
  window.closeMobileNav = closeMobileNav;
  window.toggleSidebar = toggleSidebar;
  window.closeSidebar = closeSidebar;

  window.createStrategy = createStrategy;
  window.updateStrategyStatus = updateStrategyStatus;
  window.deleteStrategy = deleteStrategy;
  window.toggleStrategyEditForm = toggleStrategyEditForm;
  window.saveStrategyEdit = saveStrategyEdit;
  window.toggleStrategyDates = toggleStrategyDates;

  window.createCompetition = createCompetition;
  window.updateCompetitionStatus = updateCompetitionStatus;
  window.deleteCompetition = deleteCompetition;
  window.toggleEditForm = toggleEditForm;
  window.saveCompetitionEdit = saveCompetitionEdit;

  window.updateLeadStatus = updateLeadStatus;
  window.deleteLead = deleteLead;
  window.openSmsWithTemplate = openSmsWithTemplate;
  window.pickRandomWinner = pickRandomWinner;
  window.markWinnerFromPanel = markWinnerFromPanel;
  window.exportCsv = exportCsv;
  window.toggleSelectAllLeads = toggleSelectAllLeads;
  window.updateSelectAllState = updateSelectAllState;
  window.deleteSelectedLeads = deleteSelectedLeads;

  window.handleFileUpload = handleFileUpload;
  window.submitBulkUpload = submitBulkUpload;
  window.renderLeadPool = renderLeadPool;
  window.renderDashboard = renderDashboard;

  window.saveSettings = saveSettings;
  window.handleSignOut = handleSignOut;
  window.loadData = loadData;

  init();
})();
