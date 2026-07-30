/**
 * CRF Comps — External platform integrations frontend
 *
 * Loads live data from Vercel serverless functions:
 *   /api/integrations/status
 *   /api/stripe/payments
 *   /api/calendly/events
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

  function renderPaymentsTable(payments, limit, options) {
    options = options || {};
    if (!payments || !payments.length) {
      return '<div class="dash-empty">No ' + (options.outstandingOnly ? 'outstanding ' : '') + 'payments found in Stripe.</div>';
    }

    let html = '<table class="data-table integration-table">' +
      '<thead><tr>' +
        '<th>Date</th>' +
        '<th>Customer</th>' +
        '<th>Description</th>' +
        '<th class="text-right">Amount</th>' +
        '<th>Stripe status</th>' +
        '<th>Matched</th>' +
      '</tr></thead><tbody>';

    payments.slice(0, limit || payments.length).forEach(function (p) {
      let statusClass, statusLabel;
      if (p.refunded) {
        statusClass = 'tag-hot';
        statusLabel = 'Refunded';
      } else if (p.paid) {
        statusClass = 'tag-active';
        statusLabel = 'Paid';
      } else {
        statusClass = 'tag-draft';
        statusLabel = p.label || p.status || 'Unknown';
      }

      const matchedClass = p.matched ? 'tag-active' : 'tag-warm';
      const matchedLabel = p.matched ? 'Matched' : 'Outstanding';

      html += '<tr>' +
        '<td>' + escapeHtml(fmtDateShort(p.created_at)) + '</td>' +
        '<td>' + escapeHtml(p.customer || '-') + '</td>' +
        '<td>' + escapeHtml(p.description || '-') + '</td>' +
        '<td class="text-right font-mono">' + escapeHtml(formatCurrency(p.amount)) + '</td>' +
        '<td><span class="tag ' + statusClass + '">' + escapeHtml(statusLabel) + '</span></td>' +
        '<td><span class="tag ' + matchedClass + '">' + escapeHtml(matchedLabel) + '</span></td>' +
      '</tr>';
    });

    html += '</tbody></table>';
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
      const [status, stripe] = await Promise.all([
        api('/api/integrations/status'),
        api('/api/stripe/payments?limit=5')
      ]);

      const stripeStatus = status.status && status.status.stripe ? status.status.stripe.healthy : false;

      section.innerHTML =
        '<div class="ops-section-title">Live integrations</div>' +
        '<div class="ops-kpi-grid integration-grid">' +
          '<div class="ops-kpi integration-kpi">' +
            '<div class="stat-label">Stripe revenue this month</div>' +
            '<div class="stat-value">' + escapeHtml(formatCurrency(stripe.revenue_month)) + '</div>' +
            statusBadge(stripeStatus, stripeStatus ? 'Connected' : 'Not connected') +
          '</div>' +
          '<div class="ops-kpi integration-kpi">' +
            '<div class="stat-label">Stripe revenue last 30 days</div>' +
            '<div class="stat-value">' + escapeHtml(formatCurrency(stripe.revenue_30d)) + '</div>' +
            '<div class="stat-sub">' + (stripe.payments ? stripe.payments.length : 0) + ' recent payments</div>' +
          '</div>' +
        '</div>' +
        '<div class="card integration-card" style="margin-top:16px;">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">' +
            '<strong>Recent Stripe payments</strong>' +
            '<a href="integrations.html" class="btn-ghost" style="font-size:12px;">View integrations →</a>' +
          '</div>' +
          renderPaymentsTable(stripe.payments, 5) +
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

    const widgetState = { outstandingOnly: false, allPayments: [], outstandingPayments: [] };

    async function loadData(outstandingOnly) {
      const path = '/api/stripe/payments?limit=50' + (outstandingOnly ? '&outstanding=true' : '');
      const [status, stripe] = await Promise.all([
        api('/api/integrations/status'),
        api(path)
      ]);

      const stripeStatus = status.status && status.status.stripe ? status.status.stripe.healthy : false;

      widgetState.allPayments = stripe.payments || [];
      widgetState.outstandingPayments = stripe.payments ? stripe.payments.filter(function (p) {
        return !p.matched && p.paid && !p.refunded;
      }) : [];

      const tablePayments = outstandingOnly ? widgetState.outstandingPayments : widgetState.allPayments;
      const allCount = widgetState.allPayments.length;
      const outCount = widgetState.outstandingPayments.length;

      container.innerHTML =
        '<div class="page-head" style="margin-bottom:18px;">' +
          '<div>' +
            '<div class="sec-eyebrow">Live data</div>' +
            '<h3 style="margin:0;">Stripe revenue</h3>' +
          '</div>' +
          statusBadge(stripeStatus) +
        '</div>' +
        '<div class="stat-grid" style="margin-bottom:20px;">' +
          '<div class="stat-box"><div class="stat-label">This month</div><div class="stat-value">' + escapeHtml(formatCurrency(stripe.revenue_month)) + '</div></div>' +
          '<div class="stat-box"><div class="stat-label">Last 30 days</div><div class="stat-value">' + escapeHtml(formatCurrency(stripe.revenue_30d)) + '</div></div>' +
          '<div class="stat-box"><div class="stat-label">Outstanding Stripe total</div><div class="stat-value">' + escapeHtml(formatCurrency(stripe.outstanding_total)) + '</div></div>' +
          '<div class="stat-box"><div class="stat-label">Outstanding Stripe count</div><div class="stat-value">' + escapeHtml(String(outCount)) + '</div></div>' +
        '</div>' +
        '<div class="filter-row" style="margin-bottom:14px;">' +
          '<button class="admin-btn ' + (outstandingOnly ? '' : 'active') + '" id="stripeAllBtn" style="font-size:11px;">All Stripe payments (' + allCount + ')</button>' +
          '<button class="admin-btn ' + (outstandingOnly ? 'active' : '') + '" id="stripeOutstandingBtn" style="font-size:11px;">Outstanding only (' + outCount + ')</button>' +
        '</div>' +
        '<div id="stripeTableWrap">' + renderPaymentsTable(tablePayments, 50, { outstandingOnly: outstandingOnly }) + '</div>';

      const allBtn = document.getElementById('stripeAllBtn');
      const outBtn = document.getElementById('stripeOutstandingBtn');
      if (allBtn) {
        allBtn.addEventListener('click', function () {
          widgetState.outstandingOnly = false;
          renderTable();
        });
      }
      if (outBtn) {
        outBtn.addEventListener('click', function () {
          widgetState.outstandingOnly = true;
          renderTable();
        });
      }
    }

    function renderTable() {
      const outstandingOnly = widgetState.outstandingOnly;
      const tablePayments = outstandingOnly ? widgetState.outstandingPayments : widgetState.allPayments;
      const wrap = document.getElementById('stripeTableWrap');
      if (wrap) {
        wrap.innerHTML = renderPaymentsTable(tablePayments, 50, { outstandingOnly: outstandingOnly });
      }
      const allBtn = document.getElementById('stripeAllBtn');
      const outBtn = document.getElementById('stripeOutstandingBtn');
      if (allBtn) allBtn.classList.toggle('active', !outstandingOnly);
      if (outBtn) outBtn.classList.toggle('active', outstandingOnly);
    }

    try {
      await loadData(false);
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
        '<p class="hint">Live payments and revenue.</p>' +
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

      // Load Stripe details after rendering
      if (s.stripe && s.stripe.healthy) {
        renderStripeDetails('stripeIntegrationDetails');
      } else {
        document.getElementById('stripeIntegrationDetails').innerHTML =
          '<div class="dash-empty">Add STRIPE_SECRET_KEY in Vercel to enable live payment data.</div>';
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
      const stripe = await api('/api/stripe/payments?limit=10');
      el.innerHTML =
        '<div class="stat-grid" style="margin-bottom:16px;">' +
          '<div class="stat-box"><div class="stat-label">This month</div><div class="stat-value">' + escapeHtml(formatCurrency(stripe.revenue_month)) + '</div></div>' +
          '<div class="stat-box"><div class="stat-label">Last 30 days</div><div class="stat-value">' + escapeHtml(formatCurrency(stripe.revenue_30d)) + '</div></div>' +
        '</div>' +
        '<strong style="display:block;margin-bottom:8px;">Recent payments</strong>' +
        renderPaymentsTable(stripe.payments, 10);
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

  function renderCalendarEvents(events, limit) {
    if (!events || !events.length) {
      return '<div class="dash-empty">No upcoming events found.</div>';
    }

    let html = '<div class="calendar-event-list">';
    events.slice(0, limit || events.length).forEach(function (ev) {
      const isAllDay = ev.start && ev.start.indexOf('T') === -1;
      const timeLabel = isAllDay ? 'All day' : fmtDateTimeShort(ev.start);
      html += '<div class="calendar-event-row">' +
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
    renderPaymentsTable,
    renderCalendarEvents
  };
})();
