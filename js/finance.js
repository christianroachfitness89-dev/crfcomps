/*
 * CRF Comps — Finance / Payments page logic
 *
 * Handles payments, invoices, revenue summaries, and modals.
 */

(function () {
  const client = window.sb;
  const ops = window.operations;

  const PAYMENT_METHODS = [
    ['cash', 'Cash'],
    ['card', 'Card'],
    ['transfer', 'Transfer'],
    ['stripe', 'Stripe'],
    ['paypal', 'PayPal'],
    ['other', 'Other']
  ];

  const INVOICE_STATUSES = [
    ['draft', 'Draft'],
    ['sent', 'Sent'],
    ['paid', 'Paid'],
    ['overdue', 'Overdue'],
    ['cancelled', 'Cancelled']
  ];

  const INVOICE_CLASS = {
    draft: 'tag-draft',
    sent: 'tag-warm',
    paid: 'tag-active',
    overdue: 'tag-hot',
    cancelled: 'tag-archived'
  };

  function clientName(id) {
    if (!id) return '-';
    const c = window.opsData.clients.find(function (x) { return x.id === id; });
    return c ? c.full_name : 'Unknown client';
  }

  function methodLabel(key) {
    const m = PAYMENT_METHODS.find(function (x) { return x[0] === key; });
    return m ? m[1] : key;
  }

  function invoiceStatusLabel(key) {
    const s = INVOICE_STATUSES.find(function (x) { return x[0] === key; });
    return s ? s[1] : key;
  }

  function invoiceStatusBadge(status) {
    const cls = INVOICE_CLASS[status] || 'tag-draft';
    return '<span class="tag ' + cls + '">' + ops.escapeHtml(invoiceStatusLabel(status)) + '</span>';
  }

  function fmtDateTimeLocal(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    const pad = function (n) { return n < 10 ? '0' + n : n; };
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  function renderClientOptions(selectId, currentId) {
    const select = document.getElementById(selectId);
    if (!select) return;
    select.innerHTML = '<option value="">No client</option>' +
      window.opsData.clients.map(function (c) {
        return '<option value="' + ops.escapeHtml(c.id) + '"' + (c.id === currentId ? ' selected' : '') + '>' + ops.escapeHtml(c.full_name) + '</option>';
      }).join('');
  }

  function refresh() {
    document.getElementById('paymentsTableWrap').innerHTML = '<div class="loading">Loading payments...</div>';
    document.getElementById('invoicesTableWrap').innerHTML = '<div class="loading">Loading invoices...</div>';
    return ops.loadData().then(function () {
      renderStats();
      renderPayments();
      renderInvoices();
    });
  }

  function renderStats() {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfYear = new Date(now.getFullYear(), 0, 1);

    const revenueMonth = window.opsData.payments
      .filter(function (p) { return p.paid_at && new Date(p.paid_at) >= startOfMonth; })
      .reduce(function (sum, p) { return sum + (Number(p.amount) || 0); }, 0);

    const paidYear = window.opsData.payments
      .filter(function (p) { return p.paid_at && new Date(p.paid_at) >= startOfYear; })
      .reduce(function (sum, p) { return sum + (Number(p.amount) || 0); }, 0);

    const outstanding = window.opsData.invoices
      .filter(function (i) { return ['draft', 'sent', 'overdue'].includes(i.status); })
      .reduce(function (sum, i) { return sum + (Number(i.amount) || 0); }, 0);

    const overdue = window.opsData.invoices
      .filter(function (i) {
        if (i.status !== 'overdue') return false;
        return true;
      })
      .reduce(function (sum, i) { return sum + (Number(i.amount) || 0); }, 0);

    document.getElementById('statRevenueMonth').textContent = ops.formatCurrency(revenueMonth);
    document.getElementById('statOutstanding').textContent = ops.formatCurrency(outstanding);
    document.getElementById('statOverdue').textContent = ops.formatCurrency(overdue);
    document.getElementById('statPaidYear').textContent = ops.formatCurrency(paidYear);
  }

  function filterPayments() {
    const q = (document.getElementById('paymentSearch').value || '').toLowerCase().trim();
    const method = document.getElementById('paymentMethodFilter').value;
    return window.opsData.payments.filter(function (p) {
      const cname = clientName(p.client_id).toLowerCase();
      const matchesQ = !q || cname.includes(q) || (p.reference || '').toLowerCase().includes(q) || (p.notes || '').toLowerCase().includes(q);
      const matchesMethod = !method || p.method === method;
      return matchesQ && matchesMethod;
    }).sort(function (a, b) { return new Date(b.paid_at || 0) - new Date(a.paid_at || 0); });
  }

  function renderPayments() {
    const container = document.getElementById('paymentsTableWrap');
    const payments = filterPayments();

    if (!payments.length) {
      container.innerHTML = '<div class="dash-empty">No payments found. Add one to get started.</div>';
      return;
    }

    let html = '<table class="data-table finance-table">' +
      '<thead><tr>' +
        '<th>Client</th>' +
        '<th>Amount</th>' +
        '<th>Method</th>' +
        '<th>Reference</th>' +
        '<th>Paid at</th>' +
        '<th>Actions</th>' +
      '</tr></thead><tbody>';

    payments.forEach(function (p) {
      html += '<tr>' +
        '<td>' + ops.escapeHtml(clientName(p.client_id)) + '</td>' +
        '<td><strong>' + ops.formatCurrency(p.amount) + '</strong></td>' +
        '<td>' + ops.escapeHtml(methodLabel(p.method)) + '</td>' +
        '<td>' + ops.escapeHtml(p.reference || '-') + '</td>' +
        '<td>' + ops.fmtDateShort(p.paid_at) + '</td>' +
        '<td class="finance-actions">' +
          '<button class="admin-btn" onclick="finance.editPayment(\'' + ops.escapeHtml(p.id) + '\')" style="padding:6px 12px;font-size:11px;">Edit</button>' +
          '<button class="admin-btn danger" onclick="finance.deletePayment(\'' + ops.escapeHtml(p.id) + '\')" style="padding:6px 12px;font-size:11px;">Delete</button>' +
        '</td>' +
      '</tr>';
    });

    html += '</tbody></table>';
    container.innerHTML = html;
  }

  function filterInvoices() {
    const q = (document.getElementById('invoiceSearch').value || '').toLowerCase().trim();
    const status = document.getElementById('invoiceStatusFilter').value;
    return window.opsData.invoices.filter(function (i) {
      const cname = clientName(i.client_id).toLowerCase();
      const matchesQ = !q || cname.includes(q) || (i.description || '').toLowerCase().includes(q);
      const matchesStatus = !status || i.status === status;
      return matchesQ && matchesStatus;
    }).sort(function (a, b) { return new Date(b.issued_at || 0) - new Date(a.issued_at || 0); });
  }

  function renderInvoices() {
    const container = document.getElementById('invoicesTableWrap');
    const invoices = filterInvoices();

    if (!invoices.length) {
      container.innerHTML = '<div class="dash-empty">No invoices found. Add one to get started.</div>';
      return;
    }

    let html = '<table class="data-table finance-table">' +
      '<thead><tr>' +
        '<th>Client</th>' +
        '<th>Amount</th>' +
        '<th>Status</th>' +
        '<th>Issued</th>' +
        '<th>Due</th>' +
        '<th>Reference</th>' +
        '<th>Description</th>' +
        '<th>Actions</th>' +
      '</tr></thead><tbody>';

    invoices.forEach(function (i) {
      html += '<tr>' +
        '<td>' + ops.escapeHtml(clientName(i.client_id)) + '</td>' +
        '<td><strong>' + ops.formatCurrency(i.amount) + '</strong></td>' +
        '<td><select onchange="finance.updateInvoiceStatus(\'' + ops.escapeHtml(i.id) + '\', this.value)" style="font-size:12px;padding:4px 8px;border-radius:var(--radius);border:1.5px solid var(--line);">' +
          INVOICE_STATUSES.map(function (o) {
            return '<option value="' + ops.escapeHtml(o[0]) + '"' + (i.status === o[0] ? ' selected' : '') + '>' + ops.escapeHtml(o[1]) + '</option>';
          }).join('') +
        '</select></td>' +
        '<td>' + ops.fmtDateShort(i.issued_at) + '</td>' +
        '<td>' + ops.fmtDateShort(i.due_at) + '</td>' +
        '<td>' + ops.escapeHtml(i.description || '-') + '</td>' +
        '<td class="finance-actions">' +
          '<button class="admin-btn" onclick="finance.editInvoice(\'' + ops.escapeHtml(i.id) + '\')" style="padding:6px 12px;font-size:11px;">Edit</button>' +
          '<button class="admin-btn danger" onclick="finance.deleteInvoice(\'' + ops.escapeHtml(i.id) + '\')" style="padding:6px 12px;font-size:11px;">Delete</button>' +
        '</td>' +
      '</tr>';
    });

    html += '</tbody></table>';
    container.innerHTML = html;
  }

  function switchTab(tab, btn) {
    document.querySelectorAll('.finance-tab').forEach(function (b) { b.classList.remove('active'); });
    btn.classList.add('active');
    document.getElementById('paymentsTab').style.display = tab === 'payments' ? 'block' : 'none';
    document.getElementById('invoicesTab').style.display = tab === 'invoices' ? 'block' : 'none';
  }

  function openPaymentModal() {
    document.getElementById('paymentForm').reset();
    document.getElementById('paymentId').value = '';
    document.getElementById('paymentModalTitle').textContent = 'Add payment';
    document.getElementById('paymentSaveBtn').textContent = 'Save payment';
    document.getElementById('paymentPaidAt').value = fmtDateTimeLocal(new Date());
    renderClientOptions('paymentClient', '');
    document.getElementById('paymentModal').classList.add('show');
  }

  function editPayment(id) {
    const p = window.opsData.payments.find(function (x) { return x.id === id; });
    if (!p) return;
    document.getElementById('paymentId').value = p.id;
    document.getElementById('paymentAmount').value = p.amount;
    document.getElementById('paymentMethod').value = p.method || 'other';
    document.getElementById('paymentReference').value = p.reference || p.stripe_charge_id || '';
    document.getElementById('paymentPaidAt').value = fmtDateTimeLocal(p.paid_at);
    document.getElementById('paymentNotes').value = p.notes || '';
    document.getElementById('paymentModalTitle').textContent = 'Edit payment';
    document.getElementById('paymentSaveBtn').textContent = 'Update payment';
    renderClientOptions('paymentClient', p.client_id);
    document.getElementById('paymentModal').classList.add('show');
  }

  function closePaymentModal(e) {
    if (e && e.target !== e.currentTarget) return;
    document.getElementById('paymentModal').classList.remove('show');
  }

  async function savePayment(e) {
    e.preventDefault();
    const btn = document.getElementById('paymentSaveBtn');
    btn.disabled = true;

    const id = document.getElementById('paymentId').value;
    const reference = document.getElementById('paymentReference').value.trim() || null;
    const method = document.getElementById('paymentMethod').value;
    const payload = {
      client_id: document.getElementById('paymentClient').value || null,
      amount: Number(document.getElementById('paymentAmount').value),
      method: method,
      reference: reference,
      paid_at: document.getElementById('paymentPaidAt').value ? new Date(document.getElementById('paymentPaidAt').value).toISOString() : new Date().toISOString(),
      notes: document.getElementById('paymentNotes').value.trim() || null
    };

    if (method === 'stripe' && reference && reference.indexOf('ch_') === 0) {
      payload.stripe_charge_id = reference;
    }

    try {
      let result;
      if (id) {
        result = await client.from('payments').update(payload).eq('id', id).select();
      } else {
        result = await client.from('payments').insert(payload).select();
      }
      if (result.error) throw result.error;
      closePaymentModal();
      await refresh();
    } catch (err) {
      alert('Could not save payment: ' + err.message);
      console.error(err);
    } finally {
      btn.disabled = false;
    }
  }

  async function deletePayment(id) {
    if (!confirm('Delete this payment?')) return;
    try {
      const { error } = await client.from('payments').delete().eq('id', id);
      if (error) throw error;
      await refresh();
    } catch (err) {
      alert('Could not delete payment: ' + err.message);
      console.error(err);
    }
  }

  function openInvoiceModal() {
    document.getElementById('invoiceForm').reset();
    document.getElementById('invoiceId').value = '';
    document.getElementById('invoiceModalTitle').textContent = 'Add invoice';
    document.getElementById('invoiceSaveBtn').textContent = 'Save invoice';
    document.getElementById('invoiceIssued').value = fmtDateTimeLocal(new Date());
    const due = new Date();
    due.setDate(due.getDate() + 7);
    document.getElementById('invoiceDue').value = fmtDateTimeLocal(due);
    document.getElementById('invoiceReference').value = '';
    renderClientOptions('invoiceClient', '');
    document.getElementById('invoiceModal').classList.add('show');
  }

  function editInvoice(id) {
    const i = window.opsData.invoices.find(function (x) { return x.id === id; });
    if (!i) return;
    document.getElementById('invoiceId').value = i.id;
    document.getElementById('invoiceAmount').value = i.amount;
    document.getElementById('invoiceStatus').value = i.status || 'draft';
    document.getElementById('invoiceIssued').value = fmtDateTimeLocal(i.issued_at);
    document.getElementById('invoiceDue').value = fmtDateTimeLocal(i.due_at);
    document.getElementById('invoiceReference').value = i.reference || i.stripe_invoice_id || '';
    document.getElementById('invoiceDescription').value = i.description || '';
    document.getElementById('invoiceModalTitle').textContent = 'Edit invoice';
    document.getElementById('invoiceSaveBtn').textContent = 'Update invoice';
    renderClientOptions('invoiceClient', i.client_id);
    document.getElementById('invoiceModal').classList.add('show');
  }

  function closeInvoiceModal(e) {
    if (e && e.target !== e.currentTarget) return;
    document.getElementById('invoiceModal').classList.remove('show');
  }

  async function saveInvoice(e) {
    e.preventDefault();
    const btn = document.getElementById('invoiceSaveBtn');
    btn.disabled = true;

    const id = document.getElementById('invoiceId').value;
    const status = document.getElementById('invoiceStatus').value;
    const reference = document.getElementById('invoiceReference').value.trim() || null;
    const payload = {
      client_id: document.getElementById('invoiceClient').value || null,
      amount: Number(document.getElementById('invoiceAmount').value),
      status: status,
      issued_at: document.getElementById('invoiceIssued').value ? new Date(document.getElementById('invoiceIssued').value).toISOString() : new Date().toISOString(),
      due_at: document.getElementById('invoiceDue').value ? new Date(document.getElementById('invoiceDue').value).toISOString() : null,
      reference: reference,
      description: document.getElementById('invoiceDescription').value.trim() || null,
      paid_at: status === 'paid' ? new Date().toISOString() : null,
      updated_at: new Date().toISOString()
    };

    if (reference && reference.indexOf('in_') === 0) {
      payload.stripe_invoice_id = reference;
    }

    try {
      let result;
      if (id) {
        result = await client.from('invoices').update(payload).eq('id', id).select();
      } else {
        result = await client.from('invoices').insert(payload).select();
      }
      if (result.error) throw result.error;
      closeInvoiceModal();
      await refresh();
    } catch (err) {
      alert('Could not save invoice: ' + err.message);
      console.error(err);
    } finally {
      btn.disabled = false;
    }
  }

  async function updateInvoiceStatus(id, status) {
    try {
      const payload = { status: status, updated_at: new Date().toISOString() };
      if (status === 'paid') payload.paid_at = new Date().toISOString();
      const { error } = await client.from('invoices').update(payload).eq('id', id);
      if (error) throw error;
      await refresh();
    } catch (err) {
      alert('Could not update invoice: ' + err.message);
      console.error(err);
    }
  }

  async function deleteInvoice(id) {
    if (!confirm('Delete this invoice?')) return;
    try {
      const { error } = await client.from('invoices').delete().eq('id', id);
      if (error) throw error;
      await refresh();
    } catch (err) {
      alert('Could not delete invoice: ' + err.message);
      console.error(err);
    }
  }

  async function init() {
    await refresh();
  }

  window.finance = {
    init,
    refresh,
    renderStats,
    renderPayments,
    renderInvoices,
    switchTab,
    openPaymentModal,
    editPayment,
    closePaymentModal,
    savePayment,
    deletePayment,
    openInvoiceModal,
    editInvoice,
    closeInvoiceModal,
    saveInvoice,
    updateInvoiceStatus,
    deleteInvoice
  };
})();
