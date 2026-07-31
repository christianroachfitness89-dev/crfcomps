/**
 * CRF Comps — Pricing & packages
 *
 * Manage coaching packages and model price increases.
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

  function renderPackageCard(pkg) {
    return '<div class="card package-card" data-package-id="' + escapeHtml(pkg.id) + '">' +
      '<div class="package-card-head">' +
        '<div>' +
          '<div class="package-name">' + escapeHtml(pkg.name) + '</div>' +
          '<div class="package-price">' + escapeHtml(formatCurrency(pkg.price)) + '<span class="package-frequency">' + escapeHtml(packageFrequencyLabel(pkg.billing_frequency)) + '</span></div>' +
        '</div>' +
        '<span class="tag ' + (pkg.status === 'active' ? 'tag-active' : 'tag-archived') + '">' + escapeHtml(pkg.status) + '</span>' +
      '</div>' +
      '<div class="package-description">' + escapeHtml(pkg.description || '-') + '</div>' +
      '<div class="package-monthly">~' + escapeHtml(formatCurrency(packageMonthlyValue(pkg))) + ' /month value</div>' +
      '<div class="package-actions">' +
        '<button class="btn-ghost" data-package-edit="' + escapeHtml(pkg.id) + '">Edit</button>' +
        '<button class="btn-ghost" data-package-delete="' + escapeHtml(pkg.id) + '" style="color:var(--red);">Delete</button>' +
      '</div>' +
    '</div>';
  }

  function renderPackageForm(existing) {
    const isEdit = !!existing;
    const frequencies = ['weekly', 'fortnightly', 'monthly', 'quarterly', 'yearly'];
    const statuses = ['active', 'archived'];

    let html = '<div class="modal-overlay show" id="packageModal">' +
      '<div class="modal-card weflex-card">' +
        '<form class="weflex-payment-form" onsubmit="return false;">' +
          '<div class="modal-head">' +
            '<h3 style="margin:0;">' + (isEdit ? 'Edit package' : 'Add package') + '</h3>' +
            '<button type="button" class="modal-close" onclick="window.pricing.closeModal()">×</button>' +
          '</div>' +
          '<div class="weflex-form-body">' +
            '<div class="weflex-field-row">' +
              '<label class="field-label" for="pkgName">Package name</label>' +
              '<input type="text" id="pkgName" class="field-input" value="' + escapeHtml(existing ? existing.name : '') + '">' +
            '</div>' +
            '<div class="weflex-field-row">' +
              '<label class="field-label" for="pkgPrice">Price</label>' +
              '<input type="number" id="pkgPrice" class="field-input" step="0.01" min="0" value="' + escapeHtml(existing ? existing.price : '') + '">' +
            '</div>' +
            '<div class="weflex-field-row">' +
              '<label class="field-label" for="pkgFrequency">Billing frequency</label>' +
              '<select id="pkgFrequency" class="field-input">';
    frequencies.forEach(function (f) {
      html += '<option value="' + f + '"' + (existing && existing.billing_frequency === f ? ' selected' : '') + '>' + escapeHtml(f.charAt(0).toUpperCase() + f.slice(1)) + '</option>';
    });
    html += '</select>' +
            '</div>' +
            '<div class="weflex-field-row">' +
              '<label class="field-label" for="pkgStatus">Status</label>' +
              '<select id="pkgStatus" class="field-input">';
    statuses.forEach(function (s) {
      html += '<option value="' + s + '"' + (existing && existing.status === s ? ' selected' : '') + '>' + escapeHtml(s.charAt(0).toUpperCase() + s.slice(1)) + '</option>';
    });
    html += '</select>' +
            '</div>' +
            '<div class="weflex-field-row">' +
              '<label class="field-label" for="pkgDescription">Description</label>' +
              '<textarea id="pkgDescription" class="field-input" rows="3">' + escapeHtml(existing ? existing.description || '' : '') + '</textarea>' +
            '</div>' +
          '</div>' +
          '<div class="modal-foot">' +
            '<button type="button" class="btn-ghost" onclick="window.pricing.closeModal()">Cancel</button>' +
            '<button type="button" class="admin-btn" id="pkgSaveBtn" data-id="' + escapeHtml(existing ? existing.id : '') + '">' + (isEdit ? 'Update' : 'Add') + '</button>' +
          '</div>' +
        '</form>' +
      '</div>' +
    '</div>';
    return html;
  }

  function renderPriceCalculator() {
    return '<div class="card price-calc-card" style="margin-bottom:22px;">' +
      '<h3 style="margin:0 0 18px;">Price increase calculator</h3>' +
      '<div class="price-calc-grid">' +
        '<div class="weflex-field-row">' +
          '<label class="field-label" for="calcCurrentPrice">Current price</label>' +
          '<input type="number" id="calcCurrentPrice" class="field-input" step="0.01" min="0" placeholder="0.00">' +
        '</div>' +
        '<div class="weflex-field-row">' +
          '<label class="field-label" for="calcNewPrice">New price</label>' +
          '<input type="number" id="calcNewPrice" class="field-input" step="0.01" min="0" placeholder="0.00">' +
        '</div>' +
        '<div class="weflex-field-row">' +
          '<label class="field-label" for="calcClients">Clients at current price</label>' +
          '<input type="number" id="calcClients" class="field-input" step="1" min="0" placeholder="0">' +
        '</div>' +
        '<div class="weflex-field-row">' +
          '<label class="field-label" for="calcFrequency">Billing frequency</label>' +
          '<select id="calcFrequency" class="field-input">' +
            '<option value="weekly">Weekly</option>' +
            '<option value="fortnightly">Fortnightly</option>' +
            '<option value="monthly" selected>Monthly</option>' +
            '<option value="quarterly">Quarterly</option>' +
            '<option value="yearly">Yearly</option>' +
          '</select>' +
        '</div>' +
      '</div>' +
      '<div style="margin-top:18px;">' +
        '<button class="admin-btn" id="priceCalcRun">Calculate impact</button>' +
      '</div>' +
      '<div id="priceCalcResults" style="margin-top:18px;display:none;"></div>' +
    '</div>';
  }

  function renderCalcResults(current, newPrice, clients, frequency) {
    const periodsPerYear = {
      weekly: 52,
      fortnightly: 26,
      monthly: 12,
      quarterly: 4,
      yearly: 1
    };
    const periods = periodsPerYear[frequency] || 12;
    const currentAnnual = current * periods * clients;
    const newAnnual = newPrice * periods * clients;
    const increase = newAnnual - currentAnnual;
    const percent = current > 0 ? ((newPrice - current) / current) * 100 : 0;
    const breakEvenClients = newPrice > 0 ? Math.ceil(currentAnnual / (newPrice * periods)) : 0;
    const churnTolerance = currentAnnual > 0 ? (increase / currentAnnual) * 100 : 0;

    return '<div class="stat-grid stripe-stats-grid">' +
      '<div class="stat-box"><div class="stat-label">Price increase</div><div class="stat-value">' + escapeHtml(percent.toFixed(1)) + '%</div></div>' +
      '<div class="stat-box"><div class="stat-label">Revenue uplift / year</div><div class="stat-value">' + escapeHtml(formatCurrency(increase)) + '</div></div>' +
      '<div class="stat-box"><div class="stat-label">New annual revenue</div><div class="stat-value">' + escapeHtml(formatCurrency(newAnnual)) + '</div></div>' +
      '<div class="stat-box"><div class="stat-label">Clients you can afford to lose</div><div class="stat-value">' + escapeHtml(String(clients - breakEvenClients)) + '</div><div class="stat-sub">and still break even</div></div>' +
      '<div class="stat-box"><div class="stat-label">Max churn tolerance</div><div class="stat-value">' + escapeHtml(churnTolerance.toFixed(1)) + '%</div></div>' +
      '<div class="stat-box"><div class="stat-label">Per-client increase</div><div class="stat-value">' + escapeHtml(formatCurrency(newPrice - current)) + '</div><div class="stat-sub">per ' + escapeHtml(frequency) + '</div></div>' +
    '</div>';
  }

  async function loadPackages() {
    const { data, error } = await client.from('packages')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  }

  async function savePackage(pkg) {
    const { data, error } = await client.from('packages').insert(pkg).select();
    if (error) throw error;
    return data && data[0];
  }

  async function updatePackage(id, pkg) {
    const { data, error } = await client.from('packages')
      .update({ ...pkg, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select();
    if (error) throw error;
    return data && data[0];
  }

  async function deletePackage(id) {
    const { error } = await client.from('packages').delete().eq('id', id);
    if (error) throw error;
  }

  function openModal(existing) {
    const modal = document.createElement('div');
    modal.id = 'pricingModalContainer';
    modal.innerHTML = renderPackageForm(existing);
    document.body.appendChild(modal);

    document.getElementById('pkgSaveBtn').addEventListener('click', async function () {
      const id = this.getAttribute('data-id');
      const pkg = {
        name: document.getElementById('pkgName').value.trim(),
        price: parseFloat(document.getElementById('pkgPrice').value) || 0,
        billing_frequency: document.getElementById('pkgFrequency').value,
        status: document.getElementById('pkgStatus').value,
        description: document.getElementById('pkgDescription').value.trim() || null
      };
      if (!pkg.name) {
        alert('Package name is required.');
        return;
      }
      try {
        if (id) {
          await updatePackage(id, pkg);
        } else {
          await savePackage(pkg);
        }
        closeModal();
        await refresh();
      } catch (err) {
        alert('Could not save package: ' + err.message);
      }
    });
  }

  function closeModal() {
    const modal = document.getElementById('pricingModalContainer');
    if (modal) modal.remove();
  }

  function attachListeners(packages) {
    const container = document.getElementById('pricingWidget');
    if (!container) return;

    container.querySelectorAll('[data-package-edit]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const id = btn.getAttribute('data-package-edit');
        const pkg = packages.find(function (p) { return p.id === id; });
        if (pkg) openModal(pkg);
      });
    });

    container.querySelectorAll('[data-package-delete]').forEach(function (btn) {
      btn.addEventListener('click', async function () {
        const id = btn.getAttribute('data-package-delete');
        if (!confirm('Delete this package?')) return;
        try {
          await deletePackage(id);
          await refresh();
        } catch (err) {
          alert('Could not delete package: ' + err.message);
        }
      });
    });

    const addBtn = document.getElementById('addPackageBtn');
    if (addBtn) {
      addBtn.addEventListener('click', function () {
        openModal();
      });
    }

    const calcBtn = document.getElementById('priceCalcRun');
    if (calcBtn) {
      calcBtn.addEventListener('click', function () {
        const current = parseFloat(document.getElementById('calcCurrentPrice').value) || 0;
        const newPrice = parseFloat(document.getElementById('calcNewPrice').value) || 0;
        const clients = parseInt(document.getElementById('calcClients').value, 10) || 0;
        const frequency = document.getElementById('calcFrequency').value;
        const results = document.getElementById('priceCalcResults');
        results.style.display = 'block';
        results.innerHTML = renderCalcResults(current, newPrice, clients, frequency);
      });
    }
  }

  async function render() {
    const container = document.getElementById('pricingWidget');
    if (!container) return;

    container.innerHTML = '<div class="loading">Loading pricing data...</div>';

    try {
      const packages = await loadPackages();
      let html = renderPriceCalculator();

      html += '<div class="page-head" style="margin-bottom:18px;">' +
        '<div>' +
          '<div class="sec-eyebrow">Packages</div>' +
          '<h3 style="margin:0;">Your packages</h3>' +
        '</div>' +
        '<div class="admin-actions">' +
          '<button class="admin-btn" id="addPackageBtn">Add package</button>' +
        '</div>' +
      '</div>';

      if (packages.length) {
        html += '<div class="package-grid">';
        packages.forEach(function (pkg) {
          html += renderPackageCard(pkg);
        });
        html += '</div>';
      } else {
        html += '<div class="dash-empty">No packages yet. Add your first coaching package above.</div>';
      }

      container.innerHTML = html;
      attachListeners(packages);
    } catch (err) {
      container.innerHTML = '<div class="card integration-card" style="border-color:var(--red);">' +
        '<strong>Could not load pricing data</strong>' +
        '<p class="hint" style="margin:6px 0 0;">' + escapeHtml(err.message) + '</p>' +
      '</div>';
      console.error('Pricing render error:', err);
    }
  }

  async function refresh() {
    await render();
  }

  async function init() {
    await render();
  }

  window.pricing = {
    init,
    refresh,
    closeModal
  };
})();
