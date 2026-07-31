/**
 * CRF Comps — Goal forecasting
 *
 * Starts from current Stripe + Weflex monthly revenue, lets the user set a
 * revenue goal and timeframe, then shows how many of each active package must be
 * sold to close the gap. A manual simulation lets the user add package counts
 * and see the projected revenue vs the goal.
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

  function packageFrequencyLabel(freq) {
    const map = {
      weekly: '/week',
      fortnightly: '/fortnight',
      monthly: '/month',
      quarterly: '/quarter',
      yearly: '/year'
    };
    return map[freq] || ('/' + freq);
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

  async function fetchBaselineMonthly() {
    const now = new Date();
    const q = 'period=month&month=' + (now.getMonth() + 1) + '&year=' + now.getFullYear() + '&status=all&limit=1';
    const stripe = await api('/api/stripe/payments?' + q);
    const stripeRevenue = Number(stripe && stripe.metrics && stripe.metrics.revenue) || 0;

    const { data, error } = await client.from('weflex_payments').select('amount, paid_at');
    if (error) throw error;

    const weflexTotal = (data || []).reduce(function (sum, p) {
      if (!p.paid_at) return sum;
      const d = new Date(p.paid_at);
      return sum + (d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear() ? Number(p.amount) || 0 : 0);
    }, 0);

    return {
      stripe: stripeRevenue,
      weflex: weflexTotal,
      total: stripeRevenue + weflexTotal,
      label: stripe && stripe.label ? stripe.label : now.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
    };
  }

  async function loadPackages() {
    const { data, error } = await client.from('packages')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  }

  function activePackages(packages) {
    return (packages || []).filter(function (p) { return p.status === 'active'; });
  }

  function readInputs() {
    const goalEl = document.getElementById('goalRevenue');
    const monthsEl = document.getElementById('goalMonths');
    const goal = goalEl ? parseFloat(goalEl.value) || 0 : 0;
    const months = monthsEl ? parseInt(monthsEl.value, 10) || 12 : 12;

    const manual = {};
    state.packages.forEach(function (pkg) {
      const el = document.getElementById('manualPkg_' + pkg.id);
      manual[pkg.id] = el ? parseInt(el.value, 10) || 0 : 0;
    });

    return { goal: goal, months: months, manual: manual };
  }

  function renderBaselineCard() {
    return '<div class="stat-grid stripe-stats-grid" style="margin-bottom:22px;">' +
      '<div class="stat-box"><div class="stat-label">Current period</div><div class="stat-value">' + escapeHtml(state.baseline.label) + '</div></div>' +
      '<div class="stat-box"><div class="stat-label">Stripe revenue</div><div class="stat-value">' + escapeHtml(formatCurrency(state.baseline.stripe)) + '</div></div>' +
      '<div class="stat-box"><div class="stat-label">Weflex revenue</div><div class="stat-value">' + escapeHtml(formatCurrency(state.baseline.weflex)) + '</div></div>' +
      '<div class="stat-box"><div class="stat-label">Current monthly revenue</div><div class="stat-value">' + escapeHtml(formatCurrency(state.baseline.total)) + '</div></div>' +
    '</div>';
  }

  function renderGoalInputs() {
    const monthsOptions = [3, 6, 9, 12, 18, 24, 36];
    const totalTarget = state.goal * state.months;
    const gapMonthly = Math.max(0, state.goal - state.baseline.total);
    const totalGap = gapMonthly * state.months;

    return '<div class="card goal-inputs-card" style="margin-bottom:22px;">' +
      '<h3 style="margin:0 0 18px;">Goal & timeframe</h3>' +
      '<div class="goal-inputs-grid">' +
        '<div class="forecast-field">' +
          '<label class="field-label" for="goalRevenue">Target monthly revenue</label>' +
          '<input type="number" id="goalRevenue" class="field-input" step="0.01" min="0" placeholder="0.00" value="' + (state.goal > 0 ? state.goal : '') + '" style="max-width:280px;">' +
        '<;/div>' +
        '<div class="forecast-field">' +
          '<label class="field-label" for="goalMonths">Timeframe</label>' +
          '<select id="goalMonths" class="field-input" style="max-width:280px;">' +
            monthsOptions.map(function (m) {
              return '<option value="' + m + '"' + (state.months === m ? ' selected' : '') + '>' + m + ' months</option>';
            }).join('') +
          '<;/select>' +
        '<;/div>' +
      '<;/div>' +
      '<div class="goal-inputs-summary" style="margin-top:18px;">' +
        '<span class="goal-summary-item">Total target: <strong>' + escapeHtml(formatCurrency(totalTarget)) + '</strong></span> ' +
        '<span class="goal-summary-item">Monthly gap: <strong>' + escapeHtml(formatCurrency(gapMonthly)) + '</strong></span> ' +
        '<span class="goal-summary-item">Total gap: <strong>' + escapeHtml(formatCurrency(totalGap)) + '</strong></span>' +
      '<;/div>' +
      '<div style="margin-top:18px;">' +
        '<button class="admin-btn" id="goalUpdateBtn">Update goal</button>' +
      '<;/div>' +
    '<;/div>';
  }

  function renderAutoCalc() {
    const actives = activePackages(state.packages);
    const gapMonthly = Math.max(0, state.goal - state.baseline.total);

    if (!actives.length) {
      return '<div class="card" style="margin-bottom:22px;">' +
        '<h3 style="margin:0 0 12px;">Packages needed to close the gap</h3>' +
        '<p class="hint">No active packages yet. Add packages on the <a href="pricing.html">Pricing</a> page to see how many sales are required.</p>' +
      '<;/div>';
    }

    let html = '<div class="card" style="margin-bottom:22px;">' +
      '<h3 style="margin:0 0 12px;">Packages needed to close the gap</h3>' +
      '<p class="hint" style="margin-bottom:18px;">New sales required to lift monthly revenue from ' + escapeHtml(formatCurrency(state.baseline.total)) + ' to ' + escapeHtml(formatCurrency(state.goal)) + '.</p>' +
      '<table class="data-table integration-table forecast-table">' +
        '<thead><tr>' +
          '<th>Package</th>' +
          '<th class="text-right">Price</th>' +
          '<th class="text-right">Monthly value</th>' +
          '<th class="text-right">Sales needed</th>' +
          '<th class="text-right">Per week over ' + state.months + ' mo</th>' +
          '<th class="text-right">Total value over ' + state.months + ' mo</th>' +
        '<;/tr></thead><tbody>';

    actives.forEach(function (pkg) {
      const monthlyValue = packageMonthlyValue(pkg);
      const salesNeeded = gapMonthly > 0 && monthlyValue > 0 ? Math.ceil(gapMonthly / monthlyValue) : 0;
      const perWeek = salesNeeded > 0 && state.months > 0 ? salesNeeded / (state.months * 4.345) : 0;
      const totalValue = monthlyValue * salesNeeded * state.months;

      html += '<tr>' +
        '<td><strong>' + escapeHtml(pkg.name) + '</strong><br><span class="hint">' + escapeHtml(pkg.description || '') + '</span></td>' +
        '<td class="text-right font-mono">' + escapeHtml(formatCurrency(pkg.price)) + escapeHtml(packageFrequencyLabel(pkg.billing_frequency)) + '</td>' +
        '<td class="text-right font-mono">' + escapeHtml(formatCurrency(monthlyValue)) + '/mo</td>' +
        '<td class="text-right font-mono">' + escapeHtml(String(salesNeeded)) + '</td>' +
        '<td class="text-right font-mono">' + (perWeek > 0 && perWeek < 0.1 ? '< 0.1' : perWeek.toFixed(1)) + '</td>' +
        '<td class="text-right font-mono">' + escapeHtml(formatCurrency(totalValue)) + '</td>' +
      '<;/tr>';
    });

    html += '<;/tbody></table>' +
      '<p class="hint" style="margin-top:12px;">Sales needed is the total number of new packages to sell to reach the monthly goal. The per-week pace spreads those sales evenly across the timeframe.</p>' +
    '<;/div>';
    return html;
  }

  function renderSimulation() {
    const actives = activePackages(state.packages);

    if (!actives.length) return '';

    let addedMonthly = 0;
    let html = '<div class="card" style="margin-bottom:22px;">' +
      '<h3 style="margin:0 0 12px;">Manual package simulation</h3>' +
      '<p class="hint" style="margin-bottom:18px;">Enter how many of each package you plan to add and see the projected revenue.</p>' +
      '<div class="goal-package-grid">';

    actives.forEach(function (pkg) {
      const monthlyValue = packageMonthlyValue(pkg);
      const count = state.manual[pkg.id] || 0;
      addedMonthly += monthlyValue * count;

      html += '<div class="goal-package-card card" style="padding:18px;">' +
        '<div class="package-card-head" style="margin-bottom:10px;">' +
          '<div class="package-name">' + escapeHtml(pkg.name) + '</div>' +
          '<span class="tag tag-active">' + escapeHtml(pkg.billing_frequency) + '</span>' +
        '<;/div>' +
        '<div class="package-price" style="font-size:22px; margin-bottom:4px;">' + escapeHtml(formatCurrency(pkg.price)) + '<span class="package-frequency">' + escapeHtml(packageFrequencyLabel(pkg.billing_frequency)) + '</span></div>' +
        '<div class="package-monthly">' + escapeHtml(formatCurrency(monthlyValue)) + ' /month value</div>' +
        '<div class="forecast-field" style="margin-top:12px;">' +
          '<label class="field-label" for="manualPkg_' + escapeHtml(pkg.id) + '">Packages to add</label>' +
          '<input type="number" id="manualPkg_' + escapeHtml(pkg.id) + '" class="field-input" min="0" step="1" value="' + count + '">' +
        '<;/div>' +
      '<;/div>';
    });

    html += '<;/div>';

    const projectedMonthly = state.baseline.total + addedMonthly;
    const projectedTotal = projectedMonthly * state.months;
    const targetTotal = state.goal * state.months;
    const diff = projectedTotal - targetTotal;
    const isSurplus = diff >= 0;

    html += '<div class="stat-grid stripe-stats-grid" style="margin-top:22px;">' +
      '<div class="stat-box"><div class="stat-label">Added monthly revenue</div><div class="stat-value">' + escapeHtml(formatCurrency(addedMonthly)) + '</div></div>' +
      '<div class="stat-box"><div class="stat-label">Projected monthly revenue</div><div class="stat-value">' + escapeHtml(formatCurrency(projectedMonthly)) + '</div></div>' +
      '<div class="stat-box"><div class="stat-label">Projected total (' + state.months + ' mo)</div><div class="stat-value">' + escapeHtml(formatCurrency(projectedTotal)) + '</div></div>' +
      '<div class="stat-box"><div class="stat-label">' + (isSurplus ? 'Surplus over goal' : 'Shortfall to goal') + '</div><div class="stat-value" style="color:' + (isSurplus ? 'var(--green)' : 'var(--red)') + '">' + escapeHtml(formatCurrency(Math.abs(diff))) + '</div></div>' +
    '<;/div>';

    if (!isSurplus) {
      const remainingMonthly = state.goal - projectedMonthly;
      html += '<div style="margin-top:18px;">' +
        '<strong>Still need more? Add this many more of each package:</strong>' +
        '<table class="data-table integration-table forecast-table" style="margin-top:12px;">' +
          '<thead><tr><th>Package</th><th class="text-right">Monthly value</th><th class="text-right">Extra sales needed</th></tr></thead><tbody>';
      actives.forEach(function (pkg) {
        const monthlyValue = packageMonthlyValue(pkg);
        const extraNeeded = remainingMonthly > 0 && monthlyValue > 0 ? Math.ceil(remainingMonthly / monthlyValue) : 0;
        html += '<tr><td>' + escapeHtml(pkg.name) + '</td><td class="text-right font-mono">' + escapeHtml(formatCurrency(monthlyValue)) + '</td><td class="text-right font-mono">' + extraNeeded + '</td></tr>';
      });
      html += '<;/tbody></table>' +
      '<;/div>';
    }

    html += '<;/div>';
    return html;
  }

  function attachListeners() {
    const updateBtn = document.getElementById('goalUpdateBtn');
    if (updateBtn) {
      updateBtn.addEventListener('click', function () {
        const inputs = readInputs();
        state.goal = inputs.goal;
        state.months = inputs.months;
        state.manual = inputs.manual;
        render();
      });
    }

    state.packages.forEach(function (pkg) {
      const el = document.getElementById('manualPkg_' + pkg.id);
      if (el) {
        el.addEventListener('change', function () {
          const inputs = readInputs();
          state.goal = inputs.goal;
          state.months = inputs.months;
          state.manual = inputs.manual;
          render();
        });
      }
    });
  }

  function render() {
    const container = document.getElementById('goalForecastingWidget');
    if (!container) return;

    if (state.loading) {
      container.innerHTML = '<div class="loading">Loading goal forecasting data...</div>';
      return;
    }

    if (state.error) {
      container.innerHTML = '<div class="card integration-card" style="border-color:var(--red);">' +
        '<strong>Could not load revenue data</strong>' +
        '<p class="hint" style="margin:6px 0 0;">' + escapeHtml(state.error) + '</p>' +
        '<button class="admin-btn" style="margin-top:12px;" onclick="goalForecasting.refresh()">Retry</button>' +
      '<;/div>';
      return;
    }

    container.innerHTML =
      renderBaselineCard() +
      renderGoalInputs() +
      renderAutoCalc() +
      renderSimulation();

    attachListeners();
  }

  async function refresh() {
    state.loading = true;
    state.error = null;
    render();

    try {
      state.baseline = await fetchBaselineMonthly();
      state.packages = await loadPackages();
      if (state.goal === 0 && state.baseline.total > 0) {
        state.goal = state.baseline.total;
      }
      state.loading = false;
      render();
    } catch (err) {
      state.loading = false;
      state.error = err.message;
      console.error('Goal forecasting error:', err);
      render();
    }
  }

  async function init() {
    await refresh();
  }

  const state = {
    loading: true,
    error: null,
    baseline: { stripe: 0, weflex: 0, total: 0, label: '' },
    packages: [],
    goal: 0,
    months: 12,
    manual: {}
  };

  window.goalForecasting = {
    init,
    refresh
  };
})();
