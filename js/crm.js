/*
 * CRF Comps — CRM / Clients page logic
 *
 * Handles client table, add/edit client modal, notes, and promote-from-lead.
 */

(function () {
  const client = window.sb;
  const ops = window.operations;

  const STATUSES = [
    ['prospect', 'Prospect'],
    ['active_member', 'Active member'],
    ['paused', 'Paused'],
    ['inactive_member', 'Inactive member'],
    ['churned', 'Churned'],
    ['former_client', 'Former client']
  ];

  const STATUS_CLASS = {
    prospect: 'tag-draft',
    active_member: 'tag-active',
    paused: 'tag-warm',
    inactive_member: 'tag-archived',
    churned: 'tag-archived',
    former_client: 'tag-archived'
  };

  function statusLabel(status) {
    const s = STATUSES.find(function (o) { return o[0] === status; });
    return s ? s[1] : status;
  }

  function statusBadge(status) {
    const cls = STATUS_CLASS[status] || 'tag-draft';
    return '<span class="tag ' + cls + '" data-status="' + ops.escapeHtml(status) + '">' + ops.escapeHtml(statusLabel(status)) + '</span>';
  }

  function renderStatusOptions(current) {
    return STATUSES.map(function (o) {
      return '<option value="' + ops.escapeHtml(o[0]) + '"' + (current === o[0] ? ' selected' : '') + '>' + ops.escapeHtml(o[1]) + '</option>';
    }).join('');
  }

  function leadName(leadId) {
    if (!leadId) return '';
    const lead = window.opsData.leads.find(function (l) { return l.id === leadId; });
    return lead ? lead.full_name : '';
  }

  function renderPhone(phone) {
    if (!phone) return '-';
    const clean = String(phone).replace(/\s/g, '');
    return '<a href="tel:' + ops.escapeHtml(clean) + '" class="phone-link">' + ops.escapeHtml(phone) + '</a>';
  }

  function filterClients() {
    const q = (document.getElementById('clientSearch').value || '').toLowerCase().trim();
    const status = document.getElementById('clientStatusFilter').value;
    return window.opsData.clients.filter(function (c) {
      const matchesQ = !q ||
        (c.full_name || '').toLowerCase().includes(q) ||
        (c.email || '').toLowerCase().includes(q) ||
        (c.phone || '').toLowerCase().includes(q) ||
        (c.source || '').toLowerCase().includes(q);
      const matchesStatus = !status || c.status === status;
      return matchesQ && matchesStatus;
    }).sort(function (a, b) {
      return new Date(b.created_at || 0) - new Date(a.created_at || 0);
    });
  }

  function renderClients() {
    const container = document.getElementById('clientsTableWrap');
    const clients = filterClients();

    document.getElementById('statTotal').textContent = window.opsData.clients.length;
    document.getElementById('statActive').textContent = window.opsData.clients.filter(function (c) { return c.status === 'active_member'; }).length;
    document.getElementById('statProspects').textContent = window.opsData.clients.filter(function (c) { return c.status === 'prospect'; }).length;
    document.getElementById('statInactive').textContent = window.opsData.clients.filter(function (c) { return ['inactive_member', 'churned', 'former_client'].includes(c.status); }).length;

    if (!clients.length) {
      container.innerHTML = '<div class="dash-empty">No clients found. Add one manually or promote a lead from Marketing.</div>';
      return;
    }

    let html = '<table class="data-table crm-table">' +
      '<thead><tr>' +
        '<th>Name</th>' +
        '<th>Email</th>' +
        '<th>Phone</th>' +
        '<th>Status</th>' +
        '<th>Source</th>' +
        '<th>Converted from</th>' +
        '<th>Created</th>' +
        '<th>Actions</th>' +
      '</tr></thead><tbody>';

    clients.forEach(function (c) {
      const leadSrc = c.lead_id ? ('Lead · ' + ops.escapeHtml(leadName(c.lead_id))) : '-';
      html += '<tr>' +
        '<td><strong>' + ops.escapeHtml(c.full_name) + '</strong></td>' +
        '<td>' + ops.escapeHtml(c.email || '') + '</td>' +
        '<td>' + renderPhone(c.phone) + '</td>' +
        '<td><select onchange="crm.updateStatus(\'' + ops.escapeHtml(c.id) + '\', this.value)" style="font-size:12px;padding:4px 8px;border-radius:var(--radius);border:1.5px solid var(--line);">' + renderStatusOptions(c.status) + '</select></td>' +
        '<td>' + ops.escapeHtml(c.source || '-') + '</td>' +
        '<td>' + leadSrc + '</td>' +
        '<td>' + ops.fmtDateShort(c.created_at) + '</td>' +
        '<td class="crm-actions">' +
          '<button class="admin-btn" onclick="crm.openDetail(\'' + ops.escapeHtml(c.id) + '\')" style="padding:6px 12px;font-size:11px;">View</button>' +
          '<button class="admin-btn" onclick="crm.editClient(\'' + ops.escapeHtml(c.id) + '\')" style="padding:6px 12px;font-size:11px;">Edit</button>' +
          '<button class="admin-btn danger" onclick="crm.deleteClient(\'' + ops.escapeHtml(c.id) + '\')" style="padding:6px 12px;font-size:11px;">Delete</button>' +
        '</td>' +
      '</tr>';
    });

    html += '</tbody></table>';
    container.innerHTML = html;
  }

  async function refresh() {
    document.getElementById('clientsTableWrap').innerHTML = '<div class="loading">Loading clients...</div>';
    await ops.loadData();
    renderClients();
  }

  function openAddModal() {
    document.getElementById('clientForm').reset();
    document.getElementById('clientId').value = '';
    document.getElementById('modalTitle').textContent = 'Add client';
    document.getElementById('clientSaveBtn').textContent = 'Save client';
    document.getElementById('clientModal').classList.add('show');
  }

  function editClient(id) {
    const c = window.opsData.clients.find(function (x) { return x.id === id; });
    if (!c) return;
    document.getElementById('clientId').value = c.id;
    document.getElementById('clientName').value = c.full_name || '';
    document.getElementById('clientEmail').value = c.email || '';
    document.getElementById('clientPhone').value = c.phone || '';
    document.getElementById('clientStatus').value = c.status || 'prospect';
    document.getElementById('clientSource').value = c.source || '';
    document.getElementById('clientNotes').value = c.notes || '';
    document.getElementById('modalTitle').textContent = 'Edit client';
    document.getElementById('clientSaveBtn').textContent = 'Update client';
    document.getElementById('clientModal').classList.add('show');
  }

  function closeModal(e) {
    if (e && e.target !== e.currentTarget) return;
    document.getElementById('clientModal').classList.remove('show');
  }

  async function saveClient(e) {
    e.preventDefault();
    const btn = document.getElementById('clientSaveBtn');
    btn.disabled = true;

    const id = document.getElementById('clientId').value;
    const payload = {
      full_name: document.getElementById('clientName').value.trim(),
      email: document.getElementById('clientEmail').value.trim() || null,
      phone: document.getElementById('clientPhone').value.trim() || null,
      status: document.getElementById('clientStatus').value,
      source: document.getElementById('clientSource').value.trim() || null,
      notes: document.getElementById('clientNotes').value.trim() || null,
      updated_at: new Date().toISOString()
    };

    try {
      let result;
      if (id) {
        result = await client.from('clients').update(payload).eq('id', id).select();
      } else {
        result = await client.from('clients').insert(payload).select();
      }
      if (result.error) throw result.error;

      closeModal();
      await refresh();
    } catch (err) {
      alert('Could not save client: ' + err.message);
      console.error(err);
    } finally {
      btn.disabled = false;
    }
  }

  async function updateStatus(id, status) {
    try {
      const { error } = await client.from('clients').update({ status: status, updated_at: new Date().toISOString() }).eq('id', id);
      if (error) throw error;
      await refresh();
    } catch (err) {
      alert('Could not update status: ' + err.message);
      console.error(err);
    }
  }

  async function deleteClient(id) {
    const c = window.opsData.clients.find(function (x) { return x.id === id; });
    if (!confirm('Delete ' + (c ? c.full_name : 'this client') + '? This cannot be undone.')) return;
    try {
      const { error } = await client.from('clients').delete().eq('id', id);
      if (error) throw error;
      await refresh();
    } catch (err) {
      alert('Could not delete client: ' + err.message);
      console.error(err);
    }
  }

  function openDetail(id) {
    const c = window.opsData.clients.find(function (x) { return x.id === id; });
    if (!c) return;
    document.getElementById('detailClientId').value = c.id;
    document.getElementById('detailTitle').textContent = c.full_name;

    document.getElementById('detailMeta').innerHTML =
      '<div class="client-detail-row"><span class="label">Email:</span> ' + ops.escapeHtml(c.email || '-') + '</div>' +
      '<div class="client-detail-row"><span class="label">Phone:</span> ' + (c.phone ? renderPhone(c.phone) : '-') + '</div>' +
      '<div class="client-detail-row"><span class="label">Status:</span> ' + statusBadge(c.status) + '</div>' +
      '<div class="client-detail-row"><span class="label">Source:</span> ' + ops.escapeHtml(c.source || '-') + '</div>' +
      '<div class="client-detail-row"><span class="label">Converted from lead:</span> ' + (c.lead_id ? ops.escapeHtml(leadName(c.lead_id)) : '-') + '</div>' +
      '<div class="client-detail-row"><span class="label">Notes:</span> ' + ops.escapeHtml(c.notes || '-') + '</div>';

    renderNotesList(c.id);
    document.getElementById('clientDetailModal').classList.add('show');
  }

  function closeDetailModal(e) {
    if (e && e.target !== e.currentTarget) return;
    document.getElementById('clientDetailModal').classList.remove('show');
  }

  function renderNotesList(clientId) {
    const notes = window.opsData.clientNotes.filter(function (n) { return n.client_id === clientId; })
      .sort(function (a, b) { return new Date(b.created_at) - new Date(a.created_at); });

    const container = document.getElementById('detailNotesList');
    if (!notes.length) {
      container.innerHTML = '<div class="client-notes-empty">No notes yet.</div>';
      return;
    }

    container.innerHTML = notes.map(function (n) {
      return '<div class="client-note">' +
        '<div class="client-note-text">' + ops.escapeHtml(n.note) + '</div>' +
        '<div class="client-note-date">' + ops.fmtDateShort(n.created_at) + '</div>' +
      '</div>';
    }).join('');
  }

  async function addNote(e) {
    e.preventDefault();
    const clientId = document.getElementById('detailClientId').value;
    const text = document.getElementById('detailNoteText').value.trim();
    if (!clientId || !text) return;

    try {
      const { error } = await client.from('client_notes').insert({
        client_id: clientId,
        note: text,
        created_by: window.opsData.user ? window.opsData.user.id : null
      });
      if (error) throw error;
      document.getElementById('detailNoteText').value = '';

      const { data, error: loadErr } = await client.from('client_notes').select('*').eq('client_id', clientId).order('created_at', { ascending: false });
      if (loadErr) throw loadErr;
      window.opsData.clientNotes = window.opsData.clientNotes.filter(function (n) { return n.client_id !== clientId; }).concat(data || []);
      renderNotesList(clientId);
    } catch (err) {
      alert('Could not add note: ' + err.message);
      console.error(err);
    }
  }

  async function init() {
    await refresh();
  }

  window.crm = {
    init,
    refresh,
    renderClients,
    openAddModal,
    editClient,
    closeModal,
    saveClient,
    updateStatus,
    deleteClient,
    openDetail,
    closeDetailModal,
    addNote
  };
})();
