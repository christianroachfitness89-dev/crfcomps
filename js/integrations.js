/**
 * CRF Comps — External platform integrations frontend
 *
 * Loads live data from Vercel serverless functions:
 *   /api/integrations/status
 *   /api/stripe/payments
 *   /api/calendly/events
 *   /api/google/calendar
 *
 * No API keys are stored or exposed in the browser.
 */

(function () {
  const client = window.sb;

  function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = String(str || '');
    return d.innerHTML;
  }

  function formatCurrency(amount) {
    if (window.operations && window.operations.formatCurrency) {
      return window.operations.formatCurrency(amount);
    }
    if (amount === null || amount === undefined || isNaN(amount)) return '$0';
    return '$' + Number(amount).toLocaleString(undefined, { maximumFractionDigits: 0 });
  }

  function fmtDateShort(iso) {
    if (window.operations && window.operations.fmtDateShort) {
      return window.operations.fmtDateShort(iso);
    }
    if (!iso) return '-';
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  async function getToken() {
    if (window.auth && window.auth.getSession) {
      const session = await window.auth.getSession();
      return session ? session.access_token : null;
    }
    const { data } = await client.auth.getSession();
    return data && data.session ? data.session.access_token : null;
  }

  async function api(path) {
    const token = await getToken();
    if (!token) throw new Error('You must be signed in.');

    const res = await fetch(path, {
      method: 'GET',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Accept': 'application/json'
      }
    });

    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : {};
    } catch (err) {
      throw new Error('Unexpected response from ' + path);
    }

    if (!res.ok) {
      throw new Error(json.error || ('Server error ' + res.status));
    }
    return json;
  }

  function statusBadge(healthy, label) {
    const color = healthy ? 'status-ok' : 'status-bad';
    const dot = healthy ? '●' : '●';
    const text = healthy ? (label || 'Connected') : (label || 'Not connected');
    return '<span class="integration-status ' + color + '" title="' + escapeHtml(text) + '" aria-label="' + escapeHtml(text) + '" aria-live="polite">' +
      '<span class="status-dot">' + dot + '</span> ' + escapeHtml(text) + '</span>';
  }

  function invoiceStatusClass(inv) {
    if (inv.status === 'paid') return 'tag-active';
    if (inv.status === 'open') return 'tag-warm';
    if (inv.status === 'void' || inv.status === 'uncollectible') return 'tag-archived';
    return 'tag-draft';
  }

  function matchedBadge(inv) {
    if (inv.matched) return '<span class="tag tag-active">Matched in Supabase</span>';
    if (inv.status === 'paid') return '<span class="tag tag-warm">Unmatched payment</span>';
    return '<span class="tag tag-hot">Outstanding</span>';
  }

  function renderInvoiceTable(invoices, limit) {
    if (!invoices || !invoices.length) {
      return '<div class="dash-empty">No Stripe invoices found for this period.</div>';
    }

    let html = '<table class="data-table integration-table">' +
      '<thead><tr>' +
        '<th>Date</th>' +
        '<th>Invoice #</th>' +
        '<th>Customer</th>' +
        '<th>Description</th>' +
        '<th class="text-right">Amount</th>' +
        '<th>Status</th>' +
        '<th>Supabase</th>' +
      '</tr></thead><tbody>';

    invoices.slice(0, limit || invoices.length).forEach(function (inv) {
      const customerName = inv.customer || '-';
      const date = inv.paid_at || inv.created_at;
      html += '<tr>' +
        '<td>' + escapeHtml(fmtDateShort(date)) + '</td>' +
        '<td>' + escapeHtml(inv.number || inv.id) + '</td>' +
        '<td>' + escapeHtml(customerName) + '</td>' +
        '<td>' + escapeHtml(inv.description || '-') + '</td>' +
        '<td class="text-right font-mono">' + escapeHtml(formatCurrency(inv.amount)) + '</td>' +
        '<td><span class="tag ' + invoiceStatusClass(inv) + '">' + escapeHtml(inv.label || inv.status) + '</span></td>' +
        '<td>' + matchedBadge(inv) + '</td>' +
      '</tr>';
    });

    html += '</tbody></table>';
    return html;
  }

  function buildMonthFilter(selectedMonth, selectedYear) {
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    let html = '<div class="filter-row" style="margin-bottom:14px;">';

    html += '<select id="stripeMonth" style="font-size:13px;">';
    for (let i = 1; i <= 12; i++) {
      html += '<option value="' + i + '"' + (i === selectedMonth ? ' selected' : '') + '>' + months[i - 1] + '</option>';
    }
    html += '</select>';

    html += '<select id="stripeYear" style="font-size:13px;">';
    const currentYear = new Date().getFullYear();
    for (let y = currentYear - 2; y <= currentYear + 1; y++) {
      html += '<option value="' + y + '"' + (y === selectedYear ? ' selected' : '') + '>' + y + '</option>';
    }
    html += '</select>';

    html += '<button class="admin-btn" id="stripeApplyFilter" style="font-size:11px;">Apply</button>';
    html += '</div>';
    return html;
  }

  async function renderDashboardStripe() {
    const container = document.getElementById('ops-dashboard');
    if (!container) return;

    const section = document.createElement('div');
    section.className = 'integration-section';
    section.innerHTML =
      '<div class="ops-section-title">Live integrations</div>' +
      '<div class="integration-loading">Loading Stripe data...</div>';
    container.appendChild(section);

    try {
      const now = new Date();
      const [status, stripe] = await Promise.all([
        api('/api/integrations/status'),
        api('/api/stripe/payments?month=' + (now.getMonth() + 1) + '&year=' + now.getFullYear() + '&limit=5')
      ]);

      const stripeStatus = status.status && status.status.stripe ? status.status.stripe.healthy : false;

      section.innerHTML =
        '<div class="ops-section-title">Live integrations</div>' +
        '<div class="ops-kpi-grid integration-grid">' +
          '<div class="ops-kpi integration-kpi">' +
            '<div class="stat-label">Stripe revenue (' + escapeHtml(stripe.month_label || '') + ')</div>' +
            '<div class="stat-value">' + escapeHtml(formatCurrency(stripe.revenue_month)) + '</div>' +
            statusBadge(stripeStatus, stripeStatus ? 'Connected' : 'Not connected') +
          '</div>' +
          '<div class="ops-kpi integration-kpi">' +
            '<div class="stat-label">Stripe outstanding (' + escapeHtml(stripe.month_label || '') + ')</div>' +
            '<div class="stat-value">' + escapeHtml(formatCurrency(stripe.outstanding_month)) + '</div>' +
            '<div class="stat-sub">' + (stripe.outstanding_count || 0) + ' open invoices</div>' +
          '</div>' +
        '</div>' +
        '<div class="card integration-card" style="margin-top:16px;">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">' +
            '<strong>Recent Stripe invoices</strong>' +
            '<a href="integrations.html" class="btn-ghost" style="font-size:12px;">View integrations →</a>' +
          '</div>' +
          renderInvoiceTable(stripe.invoices, 5) +
        '</div>';
    } catch (err) {
      section.innerHTML =
        '<div class="ops-section-title">Live integrations</div>' +
        '<div class="card integration-card" style="border-color:var(--red);">' +
          '<strong>Integrations unavailable</strong>' +
          '<p class="hint" style="margin:6px 0 0;">' + escapeHtml(err.message) + '</p>' +
        '</div>';
      console.error('renderDashboardStripe error:', err);
    }
  }

  async function renderFinanceStripe() {
    const container = document.getElementById('stripeWidget');
    if (!container) return;
    container.innerHTML = '<div class="loading">Loading Stripe data...</div>';

    const widgetState = {
      month: new Date().getMonth() + 1,
      year: new Date().getFullYear(),
      outstandingOnly: false,
      data: null
    };

    async function loadData() {
      const path = '/api/stripe/payments?month=' + widgetState.month +
        '&year=' + widgetState.year +
        '&limit=100' +
        (widgetState.outstandingOnly ? '&outstanding=true' : '');

      const [status, stripe] = await Promise.all([
        api('/api/integrations/status'),
        api(path)
      ]);

      widgetState.data = stripe;
      const stripeStatus = status.status && status.status.stripe ? status.status.stripe.healthy : false;
      const invoices = stripe.invoices || [];
      const allCount = invoices.length;
      const outCount = stripe.outstanding_count || 0;

      container.innerHTML =
        '<div class="page-head" style="margin-bottom:18px;">' +
          '<div>' +
            '<div class="sec-eyebrow">Live data</div>' +
            '<h3 style="margin:0;">Stripe invoices</h3>' +
          '</div>' +
          statusBadge(stripeStatus) +
        '</div>' +
        '<div class="stat-grid" style="margin-bottom:20px;">' +
          '<div class="stat-box"><div class="stat-label">Revenue (' + escapeHtml(stripe.month_label || '') + ')</div><div class="stat-value">' + escapeHtml(formatCurrency(stripe.revenue_month)) + '</div></div>' +
          '<div class="stat-box"><div class="stat-label">Outstanding (' + escapeHtml(stripe.month_label || '') + ')</div><div class="stat-value">' + escapeHtml(formatCurrency(stripe.outstanding_month)) + '</div></div>' +
          '<div class="stat-box"><div class="stat-label">Open invoice count</div><div class="stat-value">' + escapeHtml(String(outCount)) + '</div></div>' +
          '<div class="stat-box"><div class="stat-label">Invoices shown</div><div class="stat-value">' + escapeHtml(String(allCount)) + '</div></div>' +
        '</div>' +
        buildMonthFilter(widgetState.month, widgetState.year) +
        '<div class="filter-row" style="margin-bottom:14px;">' +
          '<button class="admin-btn ' + (widgetState.outstandingOnly ? '' : 'active') + '" id="stripeAllBtn" style="font-size:11px;">All invoices</button>' +
          '<button class="admin-btn ' + (widgetState.outstandingOnly ? 'active' : '') + '" id="stripeOutstandingBtn" style="font-size:11px;">Outstanding only (' + outCount + ')</button>' +
        '</div>' +
        '<div id="stripeTableWrap">' + renderInvoiceTable(invoices, 100) + '</div>';

      document.getElementById('stripeApplyFilter').addEventListener('click', function () {
        widgetState.month = parseInt(document.getElementById('stripeMonth').value, 10);
        widgetState.year = parseInt(document.getElementById('stripeYear').value, 10);
        loadData();
      });

      document.getElementById('stripeAllBtn').addEventListener('click', function () {
        widgetState.outstandingOnly = false;
        loadData();
      });
      document.getElementById('stripeOutstandingBtn').addEventListener('click', function () {
        widgetState.outstandingOnly = true;
        loadData();
      });
    }

    try {
      await loadData();
    } catch (err) {
      container.innerHTML =
        '<div class="card integration-card" style="border-color:var(--red);">' +
          '<strong>Stripe data unavailable</strong>' +
          '<p class="hint" style="margin:6px 0 0;">' + escapeHtml(err.message) + '</p>' +
        '</div>';
      console.error('renderFinanceStripe error:', err);
    }
  }

  async function renderIntegrationsPage() {
    const container = document.getElementById('integrationsContent');
    if (!container) return;
    container.innerHTML = '<div class="loading">Loading integration status...</div>';

    try {
      const status = await api('/api/integrations/status');
      const s = status.status || {};

      let html = '<div class="integration-page-grid">';

      // Stripe card
      html += '<div class="card integration-card" id="stripeIntegrationCard">' +
        '<div class="integration-card-head">' +
          '<div class="integration-card-title">Stripe</div>' +
          statusBadge(s.stripe && s.stripe.healthy, s.stripe && s.stripe.configured ? 'Connected' : 'Not connected') +
        '</div>' +
        '<p class="hint">Live invoices, revenue and outstanding amounts.</p>' +
        '<div id="stripeIntegrationDetails"><div class="loading">Loading details...</div></div>' +
      '</div>';

      // Calendly card
      const calendlyOk = s.calendly && s.calendly.healthy;
      html += '<div class="card integration-card" id="calendlyIntegrationCard">' +
        '<div class="integration-card-head">' +
          '<div class="integration-card-title">Calendly</div>' +
          statusBadge(calendlyOk, calendlyOk ? 'Connected' : 'Not connected') +
        '</div>' +
        '<p class="hint">Upcoming bookings will appear here once CALENDLY_PERSONAL_TOKEN is configured.</p>' +
        '<div id="calendlyIntegrationDetails"></div>' +
      '</div>';

      // Google Calendar card
      const googleOk = s.googleCalendar && s.googleCalendar.healthy;
      html += '<div class="card integration-card" id="googleCalendarIntegrationCard">' +
        '<div class="integration-card-head">' +
          '<div class="integration-card-title">Google Calendar</div>' +
          statusBadge(googleOk, googleOk ? 'Connected' : 'Not connected') +
        '</div>' +
        '<p class="hint">Upcoming events from your connected Google Calendar.</p>' +
        '<div id="googleCalendarIntegrationDetails"></div>' +
      '</div>';

      html += '</div>';
      container.innerHTML = html;

      if (s.stripe && s.stripe.healthy) {
        renderStripeDetails('stripeIntegrationDetails');
      } else {
        document.getElementById('stripeIntegrationDetails').innerHTML =
          '<div class="dash-empty">Add STRIPE_SECRET_KEY in Vercel to enable live invoice data.</div>';
      }

      if (calendlyOk) {
        renderCalendlyDetails('calendlyIntegrationDetails');
      } else {
        document.getElementById('calendlyIntegrationDetails').innerHTML =
          '<div class="dash-empty">Add CALENDLY_PERSONAL_TOKEN in Vercel to enable Calendly bookings.</div>';
      }

      if (googleOk) {
        renderGoogleCalendarDetails('googleCalendarIntegrationDetails');
      } else {
        document.getElementById('googleCalendarIntegrationDetails').innerHTML =
          '<div class="dash-empty">Add GOOGLE_SERVICE_ACCOUNT_JSON in Vercel to enable Google Calendar events.</div>';
      }
    } catch (err) {
      container.innerHTML =
        '<div class="card integration-card" style="border-color:var(--red);">' +
          '<strong>Could not load integrations</strong>' +
          '<p class="hint" style="margin:6px 0 0;">' + escapeHtml(err.message) + '</p>' +
        '</div>';
      console.error('renderIntegrationsPage error:', err);
    }
  }

  async function renderStripeDetails(elementId) {
    const el = document.getElementById(elementId);
    if (!el) return;
    try {
      const now = new Date();
      const stripe = await api('/api/stripe/payments?month=' + (now.getMonth() + 1) + '&year=' + now.getFullYear() + '&limit=10');
      el.innerHTML =
        '<div class="stat-grid" style="margin-bottom:16px;">' +
          '<div class="stat-box"><div class="stat-label">Revenue (' + escapeHtml(stripe.month_label || '') + ')</div><div class="stat-value">' + escapeHtml(formatCurrency(stripe.revenue_month)) + '</div></div>' +
          '<div class="stat-box"><div class="stat-label">Outstanding (' + escapeHtml(stripe.month_label || '') + ')</div><div class="stat-value">' + escapeHtml(formatCurrency(stripe.outstanding_month)) + '</div></div>' +
        '</div>' +
        '<strong style="display:block;margin-bottom:8px;">Recent invoices</strong>' +
        renderInvoiceTable(stripe.invoices, 10);
    } catch (err) {
      el.innerHTML = '<div class="dash-empty" style="color:var(--red-dark);">' + escapeHtml(err.message) + '</div>';
    }
  }

  async function renderCalendlyDetails(elementId) {
    const el = document.getElementById(elementId);
    if (!el) return;
    try {
      const cal = await api('/api/calendly/events');
      el.innerHTML =
        '<strong style="display:block;margin-bottom:8px;">Upcoming events</strong>' +
        '<div class="dash-empty">' + escapeHtml(cal.message || 'Calendly integration active.') + '</div>';
    } catch (err) {
      el.innerHTML = '<div class="dash-empty" style="color:var(--red-dark);">' + escapeHtml(err.message) + '</div>';
    }
  }

  function fmtDateTimeShort(iso) {
    if (!iso) return '-';
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' ' +
      d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }

  function calendarColorClass(colorId) {
    if (!colorId) return '';
    const id = String(colorId);
    const map = {
      '1': 'cal-cocoa',
      '2': 'cal-sage',
      '3': 'cal-grape',
      '4': 'cal-flamingo',
      '5': 'cal-banana',
      '6': 'cal-tangerine',
      '7': 'cal-peacock',
      '8': 'cal-graphite',
      '9': 'cal-blueberry',
      '10': 'cal-basil',
      '11': 'cal-tomato'
    };
    return map[id] || '';
  }

  function renderCalendarEvents(events, limit) {
    if (!events || !events.length) {
      return '<div class="dash-empty">No upcoming events found.</div>';
    }

    let html = '<div class="calendar-event-list">';
    events.slice(0, limit || events.length).forEach(function (ev) {
      const isAllDay = ev.start && ev.start.indexOf('T') === -1;
      const timeLabel = isAllDay ? 'All day' : fmtDateTimeShort(ev.start);
      const colorClass = calendarColorClass(ev.color_id);
      html += '<div class="calendar-event-row ' + escapeHtml(colorClass) + '">' +
        '<div class="calendar-event-time">' + escapeHtml(timeLabel) + '</div>' +
        '<div class="calendar-event-title">' + escapeHtml(ev.summary || '(No title)') + '</div>' +
        (ev.location ? '<div class="calendar-event-location">📍 ' + escapeHtml(ev.location) + '</div>' : '') +
      '</div>';
    });
    html += '</div>';
    return html;
  }

  async function renderGoogleCalendarDetails(elementId) {
    const el = document.getElementById(elementId);
    if (!el) return;
    try {
      const cal = await api('/api/google/calendar');
      el.innerHTML =
        '<strong style="display:block;margin-bottom:8px;">Upcoming events</strong>' +
        renderCalendarEvents(cal.events, 10);
    } catch (err) {
      el.innerHTML = '<div class="dash-empty" style="color:var(--red-dark);">' + escapeHtml(err.message) + '</div>';
    }
  }

  async function renderDashboardCalendar() {
    const container = document.getElementById('ops-dashboard');
    if (!container) return;

    const section = document.createElement('div');
    section.className = 'integration-section';
    section.innerHTML =
      '<div class="ops-section-title">Upcoming schedule</div>' +
      '<div class="integration-loading">Loading Google Calendar...</div>';
    container.appendChild(section);

    try {
      const cal = await api('/api/google/calendar');
      section.innerHTML =
        '<div class="ops-section-title">Upcoming schedule</div>' +
        '<div class="card integration-card">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">' +
            '<strong>Google Calendar — next ' + Math.min(cal.events.length, 5) + ' events</strong>' +
            '<a href="integrations.html" class="btn-ghost" style="font-size:12px;">View integrations →</a>' +
          '</div>' +
          renderCalendarEvents(cal.events, 5) +
        '</div>';
    } catch (err) {
      section.innerHTML =
        '<div class="ops-section-title">Upcoming schedule</div>' +
        '<div class="card integration-card" style="border-color:var(--red);">' +
          '<strong>Google Calendar unavailable</strong>' +
          '<p class="hint" style="margin:6px 0 0;">' + escapeHtml(err.message) + '</p>' +
        '</div>';
      console.error('renderDashboardCalendar error:', err);
    }
  }

  async function init(page) {
    if (!page) page = document.body.dataset.page || 'integrations';

    if (page === 'admin') {
      await renderDashboardStripe();
      await renderDashboardCalendar();
    } else if (page === 'finance') {
      await renderFinanceStripe();
    } else if (page === 'integrations') {
      await renderIntegrationsPage();
    }
  }

  window.integrations = {
    init,
    api,
    formatCurrency,
    fmtDateShort,
    statusBadge,
    renderDashboardStripe,
    renderDashboardCalendar,
    renderFinanceStripe,
    renderIntegrationsPage,
    renderInvoiceTable,
    renderCalendarEvents
  };
})();
