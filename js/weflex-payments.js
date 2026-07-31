/**
 * CRF Comps — Weflex payments module
 *
 * Manual entry and Excel upload for Weflex remittance payments.
 * Drives the Weflex section on finance.html and feeds the combined revenue overview.
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

  function parsePeriodBounds(period, month, year) {
    const now = new Date();
    const p = period || 'month';
    const m = Math.max(1, Math.min(12, month || (now.getMonth() + 1)));
    const y = year || now.getFullYear();

    let start, end, label;
    if (p === 'year') {
      start = new Date(y, 0, 1);
      end = new Date(y + 1, 0, 1);
      label = String(y);
    } else if (p === 'quarter') {
      const quarter = Math.floor((m - 1) / 3);
      start = new Date(y, quarter * 3, 1);
      end = new Date(y, (quarter + 1) * 3, 1);
      label = 'Q' + (quarter + 1) + ' ' + y;
    } else {
      start = new Date(y, m - 1, 1);
      end = new Date(y, m, 1);
      label = start.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    }
    return { start, end, label };
  }

  function filterWeflexByPeriod(payments, period, month, year) {
    const bounds = parsePeriodBounds(period, month, year);
    return payments.filter(function (p) {
      if (!p.paid_at) return false;
      const d = new Date(p.paid_at);
      return d >= bounds.start && d < bounds.end;
    });
  }

  function computeWeflexMetrics(payments) {
    const total = payments.reduce(function (sum, p) { return sum + (Number(p.amount) || 0); }, 0);
    return {
      count: payments.length,
      total: total,
      average: payments.length ? total / payments.length : 0
    };
  }

  function renderWeflexStats(metrics, label) {
    return '<div class="stat-grid stripe-stats-grid" style="margin-bottom:18px;">' +
      '<div class="stat-box"><div class="stat-label">Weflex revenue (' + escapeHtml(label || '') + ')</div><div class="stat-value">' + escapeHtml(formatCurrency(metrics.total)) + '</div></div>' +
      '<div class="stat-box"><div class="stat-label">Weflex payments</div><div class="stat-value">' + escapeHtml(String(metrics.count)) + '</div></div>' +
      '<div class="stat-box"><div class="stat-label">Average Weflex payment</div><div class="stat-value">' + escapeHtml(formatCurrency(metrics.average)) + '</div></div>' +
    '</div>';
  }

  function buildWeflexFilter(state) {
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const currentYear = new Date().getFullYear();

    let html = '<div class="filter-row stripe-filters" style="margin-bottom:14px;">';

    html += '<select id="weflexPeriod" style="font-size:13px;">' +
      '<option value="month"' + (state.period === 'month' ? ' selected' : '') + '>Month</option>' +
      '<option value="quarter"' + (state.period === 'quarter' ? ' selected' : '') + '>Quarter</option>' +
      '<option value="year"' + (state.period === 'year' ? ' selected' : '') + '>Year</option>' +
      '</select>';

    html += '<select id="weflexMonth" style="font-size:13px;' + (state.period === 'year' ? 'display:none;' : '') + '">';
    for (let i = 1; i <= 12; i++) {
      html += '<option value="' + i + '"' + (i === state.month ? ' selected' : '') + '>' + months[i - 1] + '</option>';
    }
    html += '</select>';

    html += '<select id="weflexYear" style="font-size:13px;">';
    for (let y = currentYear - 2; y <= currentYear + 1; y++) {
      html += '<option value="' + y + '"' + (y === state.year ? ' selected' : '') + '>' + y + '</option>';
    }
    html += '</select>';

    html += '<button class="admin-btn" id="weflexApplyFilter" style="font-size:11px;">Apply</button>';
    html += '</div>';
    return html;
  }

  function renderWeflexTable(payments, limit) {
    if (!payments || !payments.length) {
      return '<div class="dash-empty">No Weflex payments found for this period.</div>';
    }

    let html = '<table class="data-table integration-table">' +
      '<thead><tr>' +
        '<th>Date</th>' +
        '<th>Remittance reference</th>' +
        '<th>Notes</th>' +
        '<th class="text-right">Amount</th>' +
        '<th></th>' +
      '</tr></thead><tbody>';

    payments.slice(0, limit || payments.length).forEach(function (p) {
      html += '<tr>' +
        '<td>' + escapeHtml(fmtDateShort(p.paid_at)) + '</td>' +
        '<td>' + escapeHtml(p.remittance_reference || '-') + '</td>' +
        '<td>' + escapeHtml(p.notes || '-') + '</td>' +
        '<td class="text-right font-mono">' + escapeHtml(formatCurrency(p.amount)) + '</td>' +
        '<td class="text-right">' +
          '<button class="btn-ghost" data-weflex-edit="' + escapeHtml(p.id) + '" style="font-size:12px;">Edit</button> ' +
          '<button class="btn-ghost" data-weflex-delete="' + escapeHtml(p.id) + '" style="font-size:12px;color:var(--red);">Delete</button>' +
        '</td>' +
      '</tr>';
    });

    html += '</tbody></table>';
    return html;
  }

  function renderCombinedOverview(stripeMetrics, weflexMetrics, label) {
    const stripeRevenue = Number(stripeMetrics && stripeMetrics.revenue) || 0;
    const weflexTotal = Number(weflexMetrics && weflexMetrics.total) || 0;
    const totalRevenue = stripeRevenue + weflexTotal;
    const netRevenue = (Number(stripeMetrics && stripeMetrics.net_revenue) || 0) + weflexTotal;

    return '<div class="page-head" style="margin-bottom:18px;">' +
        '<div>' +
          '<div class="sec-eyebrow">Overview</div>' +
          '<h3 style="margin:0;">Combined revenue (' + escapeHtml(label || '') + ')</h3>' +
        '</div>' +
      '</div>' +
      '<div class="stat-grid stripe-stats-grid" style="margin-bottom:24px;">' +
        '<div class="stat-box"><div class="stat-label">Total revenue</div><div class="stat-value">' + escapeHtml(formatCurrency(totalRevenue)) + '</div></div>' +
        '<div class="stat-box"><div class="stat-label">Stripe revenue</div><div class="stat-value">' + escapeHtml(formatCurrency(stripeRevenue)) + '</div></div>' +
        '<div class="stat-box"><div class="stat-label">Weflex revenue</div><div class="stat-value">' + escapeHtml(formatCurrency(weflexTotal)) + '</div></div>' +
        '<div class="stat-box"><div class="stat-label">Net revenue</div><div class="stat-value">' + escapeHtml(formatCurrency(netRevenue)) + '</div></div>' +
        '<div class="stat-box"><div class="stat-label">Stripe outstanding</div><div class="stat-value">' + escapeHtml(formatCurrency(stripeMetrics && stripeMetrics.outstanding)) + '</div></div>' +
        '<div class="stat-box"><div class="stat-label">Stripe overdue</div><div class="stat-value">' + escapeHtml(formatCurrency(stripeMetrics && stripeMetrics.overdue)) + '</div></div>' +
        '<div class="stat-box"><div class="stat-label">Stripe refunds</div><div class="stat-value">' + escapeHtml(formatCurrency(stripeMetrics && stripeMetrics.refunds)) + '</div></div>' +
        '<div class="stat-box"><div class="stat-label">Stripe failed payments</div><div class="stat-value">' + escapeHtml(String((stripeMetrics && stripeMetrics.failed_payments) || 0)) + '</div></div>' +
      '</div>';
  }

  function parseDateInput(value) {
    if (!value) return null;
    const d = new Date(value);
    if (isNaN(d.getTime())) return null;
    return d.toISOString();
  }

  function parseAmount(value) {
    if (value === null || value === undefined || value === '') return 0;
    const cleaned = String(value).replace(/[^0-9.\-]/g, '');
    const n = parseFloat(cleaned);
    return isNaN(n) ? 0 : n;
  }

  function excelDateToISO(serial) {
    if (!serial && serial !== 0) return null;
    // Excel serial date base (1900 epoch, with 1900 leap-year bug)
    const epoch = new Date(Date.UTC(1899, 11, 30));
    const days = Number(serial);
    if (isNaN(days)) return null;
    const ms = days * 24 * 60 * 60 * 1000;
    const d = new Date(epoch.getTime() + ms);
    return d.toISOString();
  }

  function parseUploadedRow(row) {
    // Try to find date, amount, reference, notes by common header names.
    const keys = Object.keys(row);
    const lowerMap = {};
    keys.forEach(function (k) { lowerMap[k.toLowerCase().trim().replace(/\s+/g, '_')] = row[k]; });

    const dateVal = lowerMap['date'] || lowerMap['paid_at'] || lowerMap['paid_date'] || lowerMap['transaction_date'] || lowerMap['remittance_date'];
    const amountVal = lowerMap['amount'] || lowerMap['payment'] || lowerMap['total'] || lowerMap['value'] || lowerMap['gross'];
    const refVal = lowerMap['reference'] || lowerMap['remittance_reference'] || lowerMap['remittance'] || lowerMap['id'] || lowerMap['number'];
    const notesVal = lowerMap['notes'] || lowerMap['description'] || lowerMap['memo'];

    let paidAt = null;
    if (typeof dateVal === 'number') {
      paidAt = excelDateToISO(dateVal);
    } else if (typeof dateVal === 'string' && dateVal.trim()) {
      const d = new Date(dateVal);
      paidAt = isNaN(d.getTime()) ? null : d.toISOString();
    }

    return {
      paid_at: paidAt,
      amount: parseAmount(amountVal),
      remittance_reference: String(refVal || '').trim() || null,
      notes: String(notesVal || '').trim() || null
    };
  }

  function parseExcelFile(file) {
    return new Promise(function (resolve, reject) {
      if (!window.XLSX) {
        reject(new Error('Excel parser not loaded yet. Please refresh.'));
        return;
      }
      const reader = new FileReader();
      reader.onload = function (e) {
        try {
          const data = new Uint8Array(e.target.result);
          const workbook = window.XLSX.read(data, { type: 'array' });
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
          const json = window.XLSX.utils.sheet_to_json(firstSheet, { defval: '' });
          resolve(json.map(parseUploadedRow));
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = function () { reject(new Error('Could not read file.')); };
      reader.readAsArrayBuffer(file);
    });
  }

  async function saveWeflexPayments(payments) {
    const valid = payments.filter(function (p) {
      return p.paid_at && p.amount > 0;
    });
    if (!valid.length) throw new Error('No valid payments to save. Each row needs a date and amount.');

    const { data, error } = await client.from('weflex_payments').insert(valid).select();
    if (error) throw error;
    return data || [];
  }

  async function updateWeflexPayment(id, payment) {
    const { data, error } = await client.from('weflex_payments')
      .update({
        paid_at: payment.paid_at,
        amount: payment.amount,
        remittance_reference: payment.remittance_reference,
        notes: payment.notes,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select();
    if (error) throw error;
    return data && data[0];
  }

  async function deleteWeflexPayment(id) {
    const { error } = await client.from('weflex_payments').delete().eq('id', id);
    if (error) throw error;
  }

  function renderWeflexModal(existing) {
    const isEdit = !!existing;
    const paidAt = existing && existing.paid_at
      ? new Date(existing.paid_at).toISOString().split('T')[0]
      : new Date().toISOString().split('T')[0];

    return '<div class="modal weflex-modal" id="weflexPaymentModal" style="display:flex;">' +
      '<div class="modal-overlay" onclick="window.weflexPayments.closeModal()"></div>' +
      '<div class="modal-content" style="max-width:420px;">' +
        '<div class="modal-header">' +
          '<h3 style="margin:0;">' + (isEdit ? 'Edit Weflex payment' : 'Add Weflex payment') + '</h3>' +
          '<button class="modal-close" onclick="window.weflexPayments.closeModal()">×</button>' +
        '</div>' +
        '<div class="modal-body">' +
          '<div class="weflex-field-row">' +
            '<label class="field-label" for="weflexPaidAt">Date</label>' +
            '<input type="date" id="weflexPaidAt" class="field-input" value="' + escapeHtml(paidAt) + '">' +
          '</div>' +
          '<div class="weflex-field-row">' +
            '<label class="field-label" for="weflexAmount">Amount</label>' +
            '<input type="number" id="weflexAmount" class="field-input" step="0.01" min="0" placeholder="0.00" value="' + escapeHtml(existing ? existing.amount : '') + '">' +
          '</div>' +
          '<div class="weflex-field-row">' +
            '<label class="field-label" for="weflexReference">Remittance reference</label>' +
            '<input type="text" id="weflexReference" class="field-input" placeholder="e.g. REM-2026-001" value="' + escapeHtml(existing ? existing.remittance_reference || '' : '') + '">' +
          '</div>' +
          '<div class="weflex-field-row">' +
            '<label class="field-label" for="weflexNotes">Notes</label>' +
            '<textarea id="weflexNotes" class="field-input" rows="3" placeholder="Optional notes">' + escapeHtml(existing ? existing.notes || '' : '') + '</textarea>' +
          '</div>' +
        '</div>' +
        '<div class="modal-footer">' +
          '<button class="admin-btn" id="weflexSavePayment" data-id="' + escapeHtml(existing ? existing.id : '') + '">' + (isEdit ? 'Update' : 'Add') + '</button>' +
          '<button class="btn-ghost" onclick="window.weflexPayments.closeModal()">Cancel</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  function renderUploadPreview(rows) {
    let html = '<div class="card" style="margin-top:14px;">' +
      '<strong style="display:block;margin-bottom:8px;">Preview (' + rows.length + ' rows detected)</strong>' +
      '<table class="data-table integration-table">' +
        '<thead><tr><th>Date</th><th>Amount</th><th>Reference</th><th>Notes</th></tr></thead><tbody>';

    rows.slice(0, 10).forEach(function (r) {
      html += '<tr>' +
        '<td>' + escapeHtml(r.paid_at ? fmtDateShort(r.paid_at) : '-') + '</td>' +
        '<td>' + escapeHtml(formatCurrency(r.amount)) + '</td>' +
        '<td>' + escapeHtml(r.remittance_reference || '-') + '</td>' +
        '<td>' + escapeHtml(r.notes || '-') + '</td>' +
      '</tr>';
    });

    if (rows.length > 10) {
      html += '<tr><td colspan="4" class="hint">... and ' + (rows.length - 10) + ' more rows</td></tr>';
    }

    html += '</tbody></table>' +
      '<div style="margin-top:12px;">' +
        '<button class="admin-btn" id="weflexConfirmUpload">Save all Weflex payments</button>' +
        '<button class="btn-ghost" id="weflexCancelUpload" style="margin-left:8px;">Cancel</button>' +
      '</div>' +
    '</div>';
    return html;
  }

  const widgetState = {
    period: 'month',
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear(),
    payments: [],
    stripeMetrics: null,
    stripeLabel: null,
    pendingUpload: null
  };

  async function refreshData() {
    const { data, error } = await client.from('weflex_payments')
      .select('*')
      .order('paid_at', { ascending: false });
    if (error) throw error;
    widgetState.payments = data || [];
  }

  async function fetchStripeMetrics() {
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch('/api/stripe/payments?period=' + encodeURIComponent(widgetState.period) +
        '&month=' + widgetState.month +
        '&year=' + widgetState.year +
        '&status=all&limit=1', {
        headers: { 'Authorization': 'Bearer ' + token, 'Accept': 'application/json' }
      });
      if (!res.ok) return;
      const data = await res.json();
      widgetState.stripeMetrics = data.metrics || {};
      widgetState.stripeLabel = data.label || null;
    } catch (err) {
      console.warn('Could not load Stripe metrics for combined view:', err);
      widgetState.stripeMetrics = null;
      widgetState.stripeLabel = null;
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

  function render() {
    const container = document.getElementById('weflexWidget');
    if (!container) return;

    const filtered = filterWeflexByPeriod(widgetState.payments, widgetState.period, widgetState.month, widgetState.year);
    const metrics = computeWeflexMetrics(filtered);
    const bounds = parsePeriodBounds(widgetState.period, widgetState.month, widgetState.year);

    container.innerHTML =
      '<div class="page-head" style="margin-bottom:18px;">' +
        '<div>' +
          '<div class="sec-eyebrow">Manual entry</div>' +
          '<h3 style="margin:0;">Weflex payments</h3>' +
        '</div>' +
        '<div class="admin-actions">' +
          '<button class="admin-btn" id="weflexUploadBtn">Upload remittance</button>' +
          '<button class="admin-btn" id="weflexAddBtn">Add payment</button>' +
        '</div>' +
      '</div>' +
      renderWeflexStats(metrics, bounds.label) +
      buildWeflexFilter(widgetState) +
      '<div id="weflexTableWrap" style="margin-top:14px;">' + renderWeflexTable(filtered, 100) + '</div>' +
      '<div id="weflexUploadArea" style="margin-top:14px;display:none;">' +
        '<input type="file" id="weflexFileInput" accept=".xlsx,.xls,.csv" style="display:none;">' +
        '<div id="weflexUploadPreview"></div>' +
      '</div>';

    attachEventListeners();
  }

  function renderCombined() {
    const container = document.getElementById('combinedRevenue');
    if (!container) return;

    const filtered = filterWeflexByPeriod(widgetState.payments, widgetState.period, widgetState.month, widgetState.year);
    const weflexMetrics = computeWeflexMetrics(filtered);
    const bounds = parsePeriodBounds(widgetState.period, widgetState.month, widgetState.year);
    container.innerHTML = renderCombinedOverview(widgetState.stripeMetrics, weflexMetrics, bounds.label);
  }

  function attachEventListeners() {
    const container = document.getElementById('weflexWidget');
    if (!container) return;

    const uploadBtn = document.getElementById('weflexUploadBtn');
    const addBtn = document.getElementById('weflexAddBtn');
    const fileInput = document.getElementById('weflexFileInput');
    const applyBtn = document.getElementById('weflexApplyFilter');
    const periodSelect = document.getElementById('weflexPeriod');

    if (uploadBtn) {
      uploadBtn.addEventListener('click', function () {
        const area = document.getElementById('weflexUploadArea');
        if (area) area.style.display = 'block';
        if (fileInput) fileInput.click();
      });
    }

    if (addBtn) {
      addBtn.addEventListener('click', function () {
        openModal();
      });
    }

    if (fileInput) {
      fileInput.addEventListener('change', async function () {
        const file = fileInput.files[0];
        if (!file) return;
        try {
          const rows = await parseExcelFile(file);
          widgetState.pendingUpload = rows;
          const preview = document.getElementById('weflexUploadPreview');
          if (preview) {
            preview.innerHTML = renderUploadPreview(rows);
            attachUploadListeners();
          }
        } catch (err) {
          alert('Could not parse file: ' + err.message);
        }
        fileInput.value = '';
      });
    }

    if (applyBtn) {
      applyBtn.addEventListener('click', function () {
        widgetState.period = document.getElementById('weflexPeriod').value;
        widgetState.month = parseInt(document.getElementById('weflexMonth').value, 10);
        widgetState.year = parseInt(document.getElementById('weflexYear').value, 10);
        refreshAndRender();
      });
    }

    if (periodSelect) {
      periodSelect.addEventListener('change', function () {
        const monthSelect = document.getElementById('weflexMonth');
        if (monthSelect) monthSelect.style.display = this.value === 'year' ? 'none' : '';
      });
    }

    container.querySelectorAll('[data-weflex-edit]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const id = btn.getAttribute('data-weflex-edit');
        const payment = widgetState.payments.find(function (p) { return p.id === id; });
        if (payment) openModal(payment);
      });
    });

    container.querySelectorAll('[data-weflex-delete]').forEach(function (btn) {
      btn.addEventListener('click', async function () {
        const id = btn.getAttribute('data-weflex-delete');
        if (!confirm('Delete this Weflex payment?')) return;
        try {
          await deleteWeflexPayment(id);
          await refreshAndRender();
        } catch (err) {
          alert('Could not delete payment: ' + err.message);
        }
      });
    });
  }

  function attachUploadListeners() {
    const confirmBtn = document.getElementById('weflexConfirmUpload');
    const cancelBtn = document.getElementById('weflexCancelUpload');

    if (confirmBtn) {
      confirmBtn.addEventListener('click', async function () {
        if (!widgetState.pendingUpload || !widgetState.pendingUpload.length) return;
        try {
          await saveWeflexPayments(widgetState.pendingUpload);
          widgetState.pendingUpload = null;
          document.getElementById('weflexUploadArea').style.display = 'none';
          await refreshAndRender();
        } catch (err) {
          alert('Could not save payments: ' + err.message);
        }
      });
    }

    if (cancelBtn) {
      cancelBtn.addEventListener('click', function () {
        widgetState.pendingUpload = null;
        const area = document.getElementById('weflexUploadArea');
        if (area) area.style.display = 'none';
        const preview = document.getElementById('weflexUploadPreview');
        if (preview) preview.innerHTML = '';
      });
    }
  }

  function openModal(existing) {
    const modal = document.createElement('div');
    modal.id = 'weflexModalContainer';
    modal.innerHTML = renderWeflexModal(existing);
    document.body.appendChild(modal);

    document.getElementById('weflexSavePayment').addEventListener('click', async function () {
      const id = this.getAttribute('data-id');
      const payment = {
        paid_at: parseDateInput(document.getElementById('weflexPaidAt').value),
        amount: parseAmount(document.getElementById('weflexAmount').value),
        remittance_reference: document.getElementById('weflexReference').value.trim() || null,
        notes: document.getElementById('weflexNotes').value.trim() || null
      };

      if (!payment.paid_at || payment.amount <= 0) {
        alert('Please enter a valid date and amount.');
        return;
      }

      try {
        if (id) {
          await updateWeflexPayment(id, payment);
        } else {
          await saveWeflexPayments([payment]);
        }
        closeModal();
        await refreshAndRender();
      } catch (err) {
        alert('Could not save payment: ' + err.message);
      }
    });
  }

  function closeModal() {
    const modal = document.getElementById('weflexModalContainer');
    if (modal) modal.remove();
  }

  async function refreshAndRender() {
    await refreshData();
    await fetchStripeMetrics();
    render();
    renderCombined();
  }

  async function init() {
    await refreshAndRender();
  }

  window.weflexPayments = {
    init,
    refresh: refreshAndRender,
    closeModal,
    parseExcelFile,
    saveWeflexPayments
  };
})();
