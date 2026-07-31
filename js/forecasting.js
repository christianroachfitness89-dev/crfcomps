/**
 * CRF Comps — Revenue forecasting
 *
 * Uses current Stripe + Weflex revenue to build forward-looking projections.
 * Users can adjust growth assumptions and see conservative / moderate / aggressive scenarios.
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

  function fmtMonthLabel(date) {
    return date.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
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

  async function fetchCurrentRevenue(period) {
    const now = new Date();
    const q = 'period=' + period + '&month=' + (now.getMonth() + 1) + '&year=' + now.getFullYear() + '&status=all&limit=1';
    const stripe = await api('/api/stripe/payments?' + q);
    const weflexRes = await client.from('weflex_payments').select('amount, paid_at');

    const weflexTotal = (weflexRes.data || []).reduce(function (sum, p) {
      if (!p.paid_at) return sum;
      const d = new Date(p.paid_at);
      const match = period === 'year' ? d.getFullYear() === now.getFullYear()
        : period === 'quarter' ? (d.getFullYear() === now.getFullYear() && Math.floor(d.getMonth() / 3) === Math.floor(now.getMonth() / 3))
        : d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      return sum + (match ? Number(p.amount) || 0 : 0);
    }, 0);

    return {
      stripe: stripe.metrics || {},
      weflex: weflexTotal,
      label: stripe.label || '',
      period: period
    };
  }

  function fetchHistoricalWeflexPayments() {
    const payments = window.opsData && window.opsData.weflexPayments ? window.opsData.weflexPayments : [];
    return payments.map(function (p) { return { amount: Number(p.amount) || 0, paid_at: p.paid_at }; });
  }

  function computeRunRate(baseline, period) {
    // Convert current period revenue to an annual run-rate.
    if (period === 'year') return baseline;
    if (period === 'quarter') return baseline * 4;
    return baseline * 12;
  }

  function projectMonthly(runRateAnnual, growthRate, months) {
    const monthsOut = months || 12;
    const startingMonthly = runRateAnnual / 12;
    const monthlyGrowth = Math.pow(1 + growthRate, 1 / 12) - 1;
    const rows = [];
    const start = new Date();
    start.setDate(1);
    start.setMonth(start.getMonth() + 1);

    for (let i = 0; i < monthsOut; i++) {
      const d = new Date(start);
      d.setMonth(d.getMonth() + i);
      const amount = startingMonthly * Math.pow(1 + monthlyGrowth, i);
      rows.push({ month: d, label: fmtMonthLabel(d), amount: amount });
    }
    return rows;
  }

  function defaultScenarios() {
    return {
      conservative: { growth: 0.10, churn: 0.05, label: 'Conservative' },
      moderate: { growth: 0.25, churn: 0.03, label: 'Moderate' },
      aggressive: { growth: 0.50, churn: 0.02, label: 'Aggressive' }
    };
  }

  function getInputValues() {
    function getVal(id) {
      const el = document.getElementById(id);
      if (!el) return 0;
      const n = parseFloat(el.value);
      return isNaN(n) ? 0 : n;
    }
    return {
      period: document.getElementById('forecastPeriod') ? document.getElementById('forecastPeriod').value : 'month',
      months: document.getElementById('forecastMonths') ? parseInt(document.getElementById('forecastMonths').value, 10) : 12,
      scenarios: {
        conservative: { growth: getVal('forecastGrowthConservative') / 100, churn: getVal('forecastChurnConservative') / 100, label: 'Conservative' },
        moderate: { growth: getVal('forecastGrowthModerate') / 100, churn: getVal('forecastChurnModerate') / 100, label: 'Moderate' },
        aggressive: { growth: getVal('forecastGrowthAggressive') / 100, churn: getVal('forecastChurnAggressive') / 100, label: 'Aggressive' }
      }
    };
  }

  function renderInputs(state) {
    const months = [3, 6, 9, 12, 18, 24];
    const scenarios = state.inputs || defaultScenarios();
    const map = {
      conservative: 'Conservative',
      moderate: 'Moderate',
      aggressive: 'Aggressive'
    };

    let html = '<div class="forecast-inputs card" style="margin-bottom:22px;">' +
      '<h3 style="margin:0 0 18px;">Forecast inputs</h3>' +
      '<div class="forecast-input-grid">';

    html += '<div class="forecast-field">' +
      '<label class="field-label" for="forecastPeriod">Baseline period</label>' +
      '<select id="forecastPeriod" class="field-input">' +
        '<option value="month"' + (state.period === 'month' ? ' selected' : '') + '>This month</option>' +
        '<option value="quarter"' + (state.period === 'quarter' ? ' selected' : '') + '>This quarter</option>' +
        '<option value="year"' + (state.period === 'year' ? ' selected' : '') + '>This year</option>' +
      '</select>' +
    '</div>';

    html += '<div class="forecast-field">' +
      '<label class="field-label" for="forecastMonths">Project months</label>' +
      '<select id="forecastMonths" class="field-input">';
    months.forEach(function (m) {
      html += '<option value="' + m + '"' + (state.months === m ? ' selected' : '') + '>' + m + ' months</option>';
    });
    html += '</select>' +
    '</div>';

    Object.keys(scenarios).forEach(function (key) {
      const s = scenarios[key];
      const title = map[key] || key;
      html += '<div class="forecast-scenario-inputs">' +
        '<div class="forecast-scenario-title">' + escapeHtml(s.label || title) + '</div>' +
        '<div class="forecast-field">' +
          '<label class="field-label" for="forecastGrowth' + title + '">Annual growth %</label>' +
          '<input type="number" id="forecastGrowth' + title + '" class="field-input" step="1" value="' + Math.round(s.growth * 100) + '">' +
        '</div>' +
        '<div class="forecast-field">' +
          '<label class="field-label" for="forecastChurn' + title + '">Monthly churn %</label>' +
          '<input type="number" id="forecastChurn' + title + '" class="field-input" step="0.1" value="' + (s.churn * 100).toFixed(1) + '">' +
        '</div>' +
      '</div>';
    });

    html += '</div>' +
      '<div style="margin-top:18px;">' +
        '<button class="admin-btn" id="forecastRunBtn">Run forecast</button>' +
      '</div>' +
    '</div>';
    return html;
  }

  function renderBaselineCard(state) {
    const total = (state.data.stripe.revenue || 0) + state.data.weflex;
    const runRate = computeRunRate(total, state.data.period);
    return '<div class="stat-grid stripe-stats-grid" style="margin-bottom:22px;">' +
      '<div class="stat-box"><div class="stat-label">Period</div><div class="stat-value">' + escapeHtml(state.data.label) + '</div></div>' +
      '<div class="stat-box"><div class="stat-label">Stripe revenue</div><div class="stat-value">' + escapeHtml(formatCurrency(state.data.stripe.revenue)) + '</div></div>' +
      '<div class="stat-box"><div class="stat-label">Weflex revenue</div><div class="stat-value">' + escapeHtml(formatCurrency(state.data.weflex)) + '</div></div>' +
      '<div class="stat-box"><div class="stat-label">Total baseline</div><div class="stat-value">' + escapeHtml(formatCurrency(total)) + '</div></div>' +
      '<div class="stat-box"><div class="stat-label">Annual run-rate</div><div class="stat-value">' + escapeHtml(formatCurrency(runRate)) + '</div></div>' +
      '<div class="stat-box"><div class="stat-label">Avg monthly</div><div class="stat-value">' + escapeHtml(formatCurrency(runRate / 12)) + '</div></div>' +
    '</div>';
  }

  function renderForecastTable(scenarios) {
    const keys = Object.keys(scenarios);
    if (!keys.length) return '';

    const months = scenarios[keys[0]].projection.map(function (r) { return r.label; });

    let html = '<div class="card" style="margin-bottom:22px;overflow:auto;">' +
      '<h3 style="margin:0 0 16px;">Monthly projection</h3>' +
      '<table class="data-table integration-table forecast-table">' +
        '<thead><tr><th>Scenario</th>';
    months.forEach(function (m) {
      html += '<th>' + escapeHtml(m) + '</th>';
    });
    html += '<th>Total</th></tr></thead><tbody>';

    keys.forEach(function (key) {
      const s = scenarios[key];
      const total = s.projection.reduce(function (sum, r) { return sum + r.amount; }, 0);
      html += '<tr><td><strong>' + escapeHtml(s.label) + '</strong></td>';
      s.projection.forEach(function (r) {
        html += '<td class="text-right font-mono">' + escapeHtml(formatCurrency(r.amount)) + '</td>';
      });
      html += '<td class="text-right font-mono"><strong>' + escapeHtml(formatCurrency(total)) + '</strong></td></tr>';
    });

    html += '</tbody></table></div>';
    return html;
  }

  function renderSummaryCards(scenarios, baselineTotal, period) {
    const runRate = computeRunRate(baselineTotal, period);
    let html = '<div class="forecast-summary-grid" style="margin-bottom:22px;">';

    Object.keys(scenarios).forEach(function (key) {
      const s = scenarios[key];
      const total = s.projection.reduce(function (sum, r) { return sum + r.amount; }, 0);
      const lift = runRate > 0 ? ((total / (runRate * (s.projection.length / 12)) - 1) * 100) : 0;
      html += '<div class="card forecast-summary-card">' +
        '<div class="forecast-summary-label">' + escapeHtml(s.label) + ' forecast</div>' +
        '<div class="forecast-summary-value">' + escapeHtml(formatCurrency(total)) + '</div>' +
        '<div class="forecast-summary-sub">over ' + s.projection.length + ' months</div>' +
        '<div class="forecast-summary-sub">~' + Math.round(lift) + '% vs run-rate</div>' +
      '</div>';
    });

    html += '</div>';
    return html;
  }

  function renderForecastChart(scenarios) {
    if (!Object.keys(scenarios).length) return '';
    const labels = scenarios.conservative.projection.map(function (r) { return r.label; });
    const datasets = Object.keys(scenarios).map(function (key) {
      const s = scenarios[key];
      return {
        label: s.label,
        data: s.projection.map(function (r) { return Math.round(r.amount); })
      };
    });

    const chartData = { labels: labels, datasets: datasets };
    const chartId = 'forecastChart' + Date.now();

    // Simple HTML bar chart fallback - no external chart library needed
    let html = '<div class="card forecast-chart-card" style="margin-bottom:22px;">' +
      '<h3 style="margin:0 0 16px;">Projection chart</h3>' +
      '<div class="forecast-chart" id="' + chartId + '">';

    labels.forEach(function (label, idx) {
      html += '<div class="forecast-chart-month">' +
        '<div class="forecast-chart-label">' + escapeHtml(label) + '</div>' +
        '<div class="forecast-chart-bars">';
      datasets.forEach(function (ds) {
        const val = ds.data[idx];
        const max = Math.max.apply(null, datasets.map(function (d) { return d.data[idx]; }));
        const pct = max > 0 ? (val / max) * 100 : 0;
        html += '<div class="forecast-chart-bar" style="width:' + pct + '%;" title="' + escapeHtml(ds.label) + ': ' + escapeHtml(formatCurrency(val)) + '"></div>';
      });
      html += '</div>' +
        '<div class="forecast-chart-values">' +
          datasets.map(function (ds) { return escapeHtml(formatCurrency(ds.data[idx])); }).join(' · ') +
        '</div>' +
      '</div>';
    });

    html += '</div></div>';
    return html;
  }

  function runForecast(state) {
    const baselineTotal = (state.data.stripe.revenue || 0) + state.data.weflex;
    const runRate = computeRunRate(baselineTotal, state.data.period);
    const inputs = state.inputs || defaultScenarios();
    const scenarios = {};

    Object.keys(inputs).forEach(function (key) {
      const s = inputs[key];
      // Effective monthly growth after churn
      const effectiveAnnual = Math.max(-0.5, s.growth - s.churn * 12);
      scenarios[key] = {
        label: s.label,
        projection: projectMonthly(runRate, effectiveAnnual, state.months)
      };
    });

    return { scenarios, baselineTotal };
  }

  async function render() {
    const container = document.getElementById('forecastingWidget');
    if (!container) return;

    container.innerHTML = '<div class="loading">Loading forecast data...</div>';

    try {
      if (!state.data) {
        state.data = await fetchCurrentRevenue(state.period);
      }

      const forecast = runForecast(state);

      container.innerHTML =
        renderInputs(state) +
        renderBaselineCard(state) +
        renderSummaryCards(forecast.scenarios, forecast.baselineTotal, state.data.period) +
        renderForecastChart(forecast.scenarios) +
        renderForecastTable(forecast.scenarios);

      attachListeners();
    } catch (err) {
      container.innerHTML = '<div class="card integration-card" style="border-color:var(--red);">' +
        '<strong>Could not load forecast data</strong>' +
        '<p class="hint" style="margin:6px 0 0;">' + escapeHtml(err.message) + '</p>' +
      '</div>';
      console.error('Forecast render error:', err);
    }
  }

  function attachListeners() {
    const runBtn = document.getElementById('forecastRunBtn');

    if (runBtn) {
      runBtn.addEventListener('click', function () {
        const inputs = getInputValues();
        state.period = inputs.period;
        state.months = inputs.months;
        state.inputs = inputs.scenarios;
        state.data = null;
        render();
      });
    }
  }

  async function refresh() {
    state.data = null;
    await render();
  }

  const state = {
    period: 'month',
    months: 12,
    inputs: null,
    data: null
  };

  async function init() {
    await render();
  }

  window.forecasting = {
    init,
    refresh
  };
})();
