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

  function fmtWeekLabel(date) {
    return 'w/c ' + date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  function startOfWeek(d) {
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const mon = new Date(d.getFullYear(), d.getMonth(), diff);
    mon.setHours(0, 0, 0, 0);
    return mon;
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
        : period === 'week' ? (d >= startOfWeek(now) && d < new Date(startOfWeek(now).getTime() + 7 * 24 * 60 * 60 * 1000))
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
    if (period === 'week') return baseline * 52;
    return baseline * 12;
  }

  function periodGrowthRate(growthRate, interval) {
    const periodsPerYear = interval === 'week' ? 52 : 12;
    return Math.pow(1 + growthRate, 1 / periodsPerYear) - 1;
  }

  function projectForward(runRateAnnual, growthRate, count, interval) {
    const periodsPerYear = interval === 'week' ? 52 : 12;
    const startingAmount = runRateAnnual / periodsPerYear;
    const periodGrowth = periodGrowthRate(growthRate, interval);
    const rows = [];

    if (interval === 'week') {
      const start = startOfWeek(new Date());
      start.setDate(start.getDate() + 7);
      for (let i = 0; i < count; i++) {
        const d = new Date(start);
        d.setDate(d.getDate() + i * 7);
        const amount = startingAmount * Math.pow(1 + periodGrowth, i);
        rows.push({ date: d, label: fmtWeekLabel(d), amount: amount });
      }
    } else {
      const start = new Date();
      start.setDate(1);
      start.setMonth(start.getMonth() + 1);
      for (let i = 0; i < count; i++) {
        const d = new Date(start);
        d.setMonth(d.getMonth() + i);
        const amount = startingAmount * Math.pow(1 + periodGrowth, i);
        rows.push({ date: d, label: fmtMonthLabel(d), amount: amount });
      }
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
      interval: document.getElementById('forecastInterval') ? document.getElementById('forecastInterval').value : 'month',
      periods: document.getElementById('forecastPeriods') ? parseInt(document.getElementById('forecastPeriods').value, 10) : 12,
      scenarios: {
        conservative: { growth: getVal('forecastGrowthConservative') / 100, churn: getVal('forecastChurnConservative') / 100, label: 'Conservative' },
        moderate: { growth: getVal('forecastGrowthModerate') / 100, churn: getVal('forecastChurnModerate') / 100, label: 'Moderate' },
        aggressive: { growth: getVal('forecastGrowthAggressive') / 100, churn: getVal('forecastChurnAggressive') / 100, label: 'Aggressive' }
      }
    };
  }

  function renderInputs(state) {
    const monthOptions = [3, 6, 9, 12, 18, 24];
    const weekOptions = [4, 8, 13, 26, 52];
    const scenarios = state.inputs || defaultScenarios();
    const map = {
      conservative: 'Conservative',
      moderate: 'Moderate',
      aggressive: 'Aggressive'
    };
    const isWeekly = state.interval === 'week';
    const periodCountOptions = isWeekly ? weekOptions : monthOptions;
    const periodLabel = isWeekly ? 'weeks' : 'months';

    let html = '<div class="forecast-inputs card" style="margin-bottom:22px;">' +
      '<h3 style="margin:0 0 18px;">Forecast inputs</h3>' +
      '<div class="forecast-input-grid">';

    html += '<div class="forecast-field">' +
      '<label class="field-label" for="forecastPeriod">Baseline period</label>' +
      '<select id="forecastPeriod" class="field-input">' +
        '<option value="week"' + (state.period === 'week' ? ' selected' : '') + '>This week</option>' +
        '<option value="month"' + (state.period === 'month' ? ' selected' : '') + '>This month</option>' +
        '<option value="quarter"' + (state.period === 'quarter' ? ' selected' : '') + '>This quarter</option>' +
        '<option value="year"' + (state.period === 'year' ? ' selected' : '') + '>This year</option>' +
      '</select>' +
    '</div>';

    html += '<div class="forecast-field">' +
      '<label class="field-label" for="forecastInterval">Forecast by</label>' +
      '<select id="forecastInterval" class="field-input">' +
        '<option value="month"' + (state.interval === 'month' ? ' selected' : '') + '>Month</option>' +
        '<option value="week"' + (state.interval === 'week' ? ' selected' : '') + '>Week</option>' +
      '</select>' +
    '</div>';

    html += '<div class="forecast-field">' +
      '<label class="field-label" for="forecastPeriods">Project ' + periodLabel + '</label>' +
      '<select id="forecastPeriods" class="field-input">';
    periodCountOptions.forEach(function (m) {
      html += '<option value="' + m + '"' + (state.periods === m ? ' selected' : '') + '>' + m + ' ' + periodLabel + '</option>';
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
    const interval = state.interval || 'month';
    const avgLabel = interval === 'week' ? 'Avg weekly' : 'Avg monthly';
    const avgDivisor = interval === 'week' ? 52 : 12;
    return '<div class="stat-grid stripe-stats-grid" style="margin-bottom:22px;">' +
      '<div class="stat-box"><div class="stat-label">Period</div><div class="stat-value">' + escapeHtml(state.data.label) + '</div></div>' +
      '<div class="stat-box"><div class="stat-label">Stripe revenue</div><div class="stat-value">' + escapeHtml(formatCurrency(state.data.stripe.revenue)) + '</div></div>' +
      '<div class="stat-box"><div class="stat-label">Weflex revenue</div><div class="stat-value">' + escapeHtml(formatCurrency(state.data.weflex)) + '</div></div>' +
      '<div class="stat-box"><div class="stat-label">Total baseline</div><div class="stat-value">' + escapeHtml(formatCurrency(total)) + '</div></div>' +
      '<div class="stat-box"><div class="stat-label">Annual run-rate</div><div class="stat-value">' + escapeHtml(formatCurrency(runRate)) + '</div></div>' +
      '<div class="stat-box"><div class="stat-label">' + escapeHtml(avgLabel) + '</div><div class="stat-value">' + escapeHtml(formatCurrency(runRate / avgDivisor)) + '</div></div>' +
    '</div>';
  }

  function renderForecastTable(scenarios, interval) {
    const keys = Object.keys(scenarios);
    if (!keys.length) return '';

    const labels = scenarios[keys[0]].projection.map(function (r) { return r.label; });
    const heading = interval === 'week' ? 'Weekly projection' : 'Monthly projection';

    let html = '<div class="card" style="margin-bottom:22px;overflow:auto;">' +
      '<h3 style="margin:0 0 16px;">' + escapeHtml(heading) + '</h3>' +
      '<table class="data-table integration-table forecast-table">' +
        '<thead><tr><th>Scenario</th>';
    labels.forEach(function (m) {
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

  function renderSummaryCards(scenarios, baselineTotal, period, interval) {
    const runRate = computeRunRate(baselineTotal, period);
    const periodsPerYear = interval === 'week' ? 52 : 12;
    const periodLabel = interval === 'week' ? 'weeks' : 'months';
    let html = '<div class="forecast-summary-grid" style="margin-bottom:22px;">';

    Object.keys(scenarios).forEach(function (key) {
      const s = scenarios[key];
      const total = s.projection.reduce(function (sum, r) { return sum + r.amount; }, 0);
      const lift = runRate > 0 ? ((total / (runRate * (s.projection.length / periodsPerYear)) - 1) * 100) : 0;
      html += '<div class="card forecast-summary-card">' +
        '<div class="forecast-summary-label">' + escapeHtml(s.label) + ' forecast</div>' +
        '<div class="forecast-summary-value">' + escapeHtml(formatCurrency(total)) + '</div>' +
        '<div class="forecast-summary-sub">over ' + s.projection.length + ' ' + periodLabel + '</div>' +
        '<div class="forecast-summary-sub">~' + Math.round(lift) + '% vs run-rate</div>' +
      '</div>';
    });

    html += '</div>';
    return html;
  }

  function packageMonthlyValue(pkg) {
    const price = Number(pkg.price) || 0;
    switch (pkg.billing_frequency) {
      case 'weekly': return price * 52 / 12;
      case 'fortnightly': return price * 26 / 12;
      case 'monthly': return price;
      case 'quarterly': return price / 3;
      case 'yearly': return price / 12;
      default: return price;
    }
  }

  function packageIntervalValue(pkg, interval) {
    const price = Number(pkg.price) || 0;
    if (interval === 'week') {
      switch (pkg.billing_frequency) {
        case 'weekly': return price;
        case 'fortnightly': return price / 2;
        case 'monthly': return price * 12 / 52;
        case 'quarterly': return price * 4 / 52;
        case 'yearly': return price / 52;
        default: return price;
      }
    }
    switch (pkg.billing_frequency) {
      case 'weekly': return price * 52 / 12;
      case 'fortnightly': return price * 26 / 12;
      case 'monthly': return price;
      case 'quarterly': return price / 3;
      case 'yearly': return price / 12;
      default: return price;
    }
  }

  function computeGap(scenario, baselinePerInterval, interval) {
    return scenario.projection.map(function (r) {
      return { label: r.label, gap: Math.max(0, r.amount - baselinePerInterval) };
    });
  }

  function salesForGap(gap, pkg, interval) {
    const value = packageIntervalValue(pkg, interval);
    if (!value) return 0;
    return gap / value;
  }

  function renderSalesTargets(scenarios, baselineTotal, period, packages, interval) {
    const activePackages = (packages || []).filter(function (p) { return p.status === 'active'; });
    if (!activePackages.length) {
      return '<div class="card" style="margin-bottom:22px;">' +
        '<h3 style="margin:0 0 12px;">What to add per week</h3>' +
        '<p class="hint">Add active packages on the Pricing page to see how many new sales you need per week to hit each forecast.</p>' +
      '</div>';
    }

    const isWeekly = interval === 'week';
    const periodsPerYear = isWeekly ? 52 : 12;
    const baselinePerInterval = computeRunRate(baselineTotal, period) / periodsPerYear;
    const intervalLabel = isWeekly ? 'week' : 'month';
    const heading = isWeekly ? 'What to add per week to hit forecast' : 'What to add per week to hit forecast';
    const subtext = isWeekly
      ? 'New package sales required each week to close the gap between current revenue and each forecast.'
      : 'New package sales required each month to close the gap between current revenue and each forecast. Each row is cumulative by the end of that month.';

    let html = '<div class="card" style="margin-bottom:22px;">' +
      '<h3 style="margin:0 0 12px;">' + heading + '</h3>' +
      '<p class="hint" style="margin-bottom:18px;">' + subtext + '</p>';

    Object.keys(scenarios).forEach(function (key) {
      const s = scenarios[key];
      const gaps = computeGap(s, baselinePerInterval, interval);
      const totalGap = gaps.reduce(function (sum, g) { return sum + g.gap; }, 0);
      const periodLabel = isWeekly ? 'weeks' : 'months';
      const columnHeader = isWeekly ? 'Week' : 'Month';

      html += '<div class="forecast-target-scenario" style="margin-bottom:22px;">' +
        '<div class="forecast-target-title" style="margin-bottom:12px;">' + escapeHtml(s.label) + ' — ' + escapeHtml(formatCurrency(totalGap)) + ' new revenue needed over ' + s.projection.length + ' ' + periodLabel + '</div>';

      html += '<table class="data-table integration-table forecast-table">' +
        '<thead><tr>' +
          '<th>' + columnHeader + '</th>' +
          '<th class="text-right">Gap to close</th>';
      activePackages.forEach(function (pkg) {
        html += '<th class="text-right" style="min-width:110px;">' + escapeHtml(pkg.name) + ' sales / week</th>';
      });
      html += '</tr></thead><tbody>';

      gaps.forEach(function (g) {
        html += '<tr>' +
          '<td>' + escapeHtml(g.label) + '</td>' +
          '<td class="text-right font-mono">' + escapeHtml(formatCurrency(g.gap)) + '</td>';
        activePackages.forEach(function (pkg) {
          const sales = salesForGap(g.gap, pkg, interval);
          const perWeek = isWeekly ? sales : sales / 4.33;
          const display = perWeek > 0 && perWeek < 0.1 ? '< 0.1' : perWeek.toFixed(1);
          html += '<td class="text-right font-mono">' + display + '</td>';
        });
        html += '</tr>';
      });

      // Average row
      const avgGap = totalGap / s.projection.length;
      html += '<tr style="border-top:2px solid var(--line);">' +
        '<td><strong>' + columnHeader + 'ly average</strong></td>' +
        '<td class="text-right font-mono"><strong>' + escapeHtml(formatCurrency(avgGap)) + '</strong></td>';
      activePackages.forEach(function (pkg) {
        const avgSales = salesForGap(avgGap, pkg, interval);
        const avgPerWeek = isWeekly ? avgSales : avgSales / 4.33;
        const display = avgPerWeek > 0 && avgPerWeek < 0.1 ? '< 0.1' : avgPerWeek.toFixed(1);
        html += '<td class="text-right font-mono"><strong>' + display + '</strong></td>';
      });
      html += '</tr>';

      html += '</tbody></table></div>';
    });

    html += '</div>';
    return html;
  }

  function renderForecastChart(scenarios, interval) {
    if (!Object.keys(scenarios).length) return '';
    const labels = scenarios.conservative.projection.map(function (r) { return r.label; });
    const heading = interval === 'week' ? 'Weekly projection chart' : 'Monthly projection chart';
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
      '<h3 style="margin:0 0 16px;">' + escapeHtml(heading) + '</h3>' +
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
    const interval = state.interval || 'month';
    const count = state.periods || 12;
    const scenarios = {};

    Object.keys(inputs).forEach(function (key) {
      const s = inputs[key];
      // Effective annual growth after churn, scaled by interval
      const periodsPerYear = interval === 'week' ? 52 : 12;
      const effectiveAnnual = Math.max(-0.5, s.growth - s.churn * periodsPerYear);
      scenarios[key] = {
        label: s.label,
        projection: projectForward(runRate, effectiveAnnual, count, interval)
      };
    });

    return { scenarios, baselineTotal, interval };
  }

  async function render() {
    const container = document.getElementById('forecastingWidget');
    if (!container) return;

    container.innerHTML = '<div class="loading">Loading forecast data...</div>';

    try {
      if (!state.packages) {
        const pkgRes = await client.from('packages').select('*').eq('status', 'active').order('created_at', { ascending: false });
        state.packages = pkgRes.data || [];
      }
      if (!state.data) {
        state.data = await fetchCurrentRevenue(state.period);
      }

      const forecast = runForecast(state);

      container.innerHTML =
        renderInputs(state) +
        renderBaselineCard(state) +
        renderSummaryCards(forecast.scenarios, forecast.baselineTotal, state.data.period, forecast.interval) +
        renderSalesTargets(forecast.scenarios, forecast.baselineTotal, state.data.period, state.packages, forecast.interval) +
        renderForecastChart(forecast.scenarios, forecast.interval) +
        renderForecastTable(forecast.scenarios, forecast.interval);

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
        state.interval = inputs.interval;
        state.periods = inputs.periods;
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
    interval: 'month',
    periods: 12,
    inputs: null,
    data: null,
    packages: null
  };

  async function init() {
    await render();
  }

  window.forecasting = {
    init,
    refresh
  };
})();
