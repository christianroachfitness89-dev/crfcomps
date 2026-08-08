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

  function packageById(id) {
    return window.opsData.packages.find(function (p) { return p.id === id; });
  }

  function clientPackages(clientId) {
    return window.opsData.clientPackages.filter(function (cp) { return cp.client_id === clientId; });
  }

  function activeClientWeeklyLoad() {
    let sessions = 0;
    let minutes = 0;
    window.opsData.clients.forEach(function (c) {
      if (c.status !== 'active_member') return;
      clientPackages(c.id).forEach(function (cp) {
        if (cp.status !== 'active') return;
        const pkg = packageById(cp.package_id);
        if (!pkg) return;
        sessions += window.operations.packageWeeklySessions(pkg);
        minutes += window.operations.packageWeeklyMinutes(pkg);
      });
    });
    return { sessions: sessions, minutes: minutes };
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
    const load = activeClientWeeklyLoad();
    document.getElementById('statWeeklySessions').textContent = load.sessions.toFixed(1);
    document.getElementById('statWeeklyMinutes').textContent = load.minutes.toFixed(0);

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
    const inviteBox = document.getElementById('clientInvitePortal');
    if (inviteBox) inviteBox.checked = false;
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
    const inviteBox = document.getElementById('clientInvitePortal');
    const shouldInvite = inviteBox && inviteBox.checked;

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

      const saved = result.data ? result.data[0] : null;

      if (shouldInvite && saved && saved.email) {
        await sendPortalInvite(saved.id);
      } else if (shouldInvite && saved && !saved.email) {
        alert('Client saved, but no email was provided so a portal invitation could not be sent.');
      }

      closeModal();
      await refresh();
    } catch (err) {
      alert('Could not save client: ' + err.message);
      console.error(err);
    } finally {
      btn.disabled = false;
      if (inviteBox) inviteBox.checked = false;
    }
  }

  async function sendPortalInvite(clientId) {
    try {
      const { data: sessionData } = await client.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error('Admin session not found.');

      const res = await fetch('/api/portal/invite', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + token,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ client_id: clientId })
      });

      const result = await res.json().catch(function () { return { error: 'Unknown response' }; });
      if (!res.ok) throw new Error(result.error || 'Invite failed');

      if (result.already_invited) {
        alert('This client has already been invited to the portal.');
      } else {
        alert(result.message || 'Portal invitation sent.');
      }
      return result;
    } catch (err) {
      console.error(err);
      alert('Could not send portal invite: ' + err.message);
      throw err;
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
    document.getElementById('detailPackageClientId').value = c.id;
    document.getElementById('detailTitle').textContent = c.full_name;
    renderClientPackages(c.id);

    document.getElementById('detailMeta').innerHTML =
      '<div class="client-detail-row">' +
        '<div class="cd-icon"><svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5z"/></svg></div>' +
        '<div class="cd-content"><span class="label">Email</span>' + ops.escapeHtml(c.email || '-') + '</div>' +
      '</div>' +
      '<div class="client-detail-row">' +
        '<div class="cd-icon"><svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/></svg></div>' +
        '<div class="cd-content"><span class="label">Phone</span>' + (c.phone ? renderPhone(c.phone) : '-') + '</div>' +
      '</div>' +
      '<div class="client-detail-row">' +
        '<div class="cd-icon"><svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg></div>' +
        '<div class="cd-content"><span class="label">Status</span>' + statusBadge(c.status) + '</div>' +
      '</div>' +
      '<div class="client-detail-row">' +
        '<div class="cd-icon"><svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg></div>' +
        '<div class="cd-content"><span class="label">Source</span>' + ops.escapeHtml(c.source || '-') + '</div>' +
      '</div>' +
      '<div class="client-detail-row">' +
        '<div class="cd-icon"><svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11zM9 10H7v2h2v-2zm4 0h-2v2h2v-2zm4 0h-2v2h2v-2z"/></svg></div>' +
        '<div class="cd-content"><span class="label">Converted from lead</span>' + (c.lead_id ? ops.escapeHtml(leadName(c.lead_id)) : '-') + '</div>' +
      '</div>' +
      '<div class="client-detail-row">' +
        '<div class="cd-icon"><svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm-1 7V3.5L18.5 9H13zm1 13h-2v-6H6v-2h6v-6h2v6h6v2h-6v6z"/></svg></div>' +
        '<div class="cd-content"><span class="label">Notes</span>' + ops.escapeHtml(c.notes || '-') + '</div>' +
      '</div>';

    renderNotesList(c.id);
    renderCommunications(c.id);
    loadPortalSection(c.id);
    document.getElementById('clientDetailModal').classList.add('show');
  }

  function renderClientPackages(clientId) {
    const list = document.getElementById('detailPackagesList');
    const select = document.getElementById('detailPackageSelect');
    const activePkgs = window.opsData.packages.filter(function (p) { return p.status === 'active'; });

    select.innerHTML = '<option value="">Select active package...</option>' +
      activePkgs.map(function (p) {
        return '<option value="' + ops.escapeHtml(p.id) + '">' + ops.escapeHtml(p.name) + ' · ' + ops.escapeHtml(window.operations.formatCurrency ? window.operations.formatCurrency(p.price) : ('$' + p.price)) + ' · ' + ops.escapeHtml(p.billing_frequency) + '</option>';
      }).join('');

    const assigned = clientPackages(clientId);
    if (!assigned.length) {
      list.innerHTML = '<div class="client-package-empty">No packages assigned yet.</div>';
      return;
    }

    list.innerHTML = assigned.map(function (cp) {
      const pkg = packageById(cp.package_id);
      const name = pkg ? pkg.name : 'Unknown package';
      const sessions = pkg ? window.operations.packageWeeklySessions(pkg) : 0;
      const minutes = pkg ? window.operations.packageWeeklyMinutes(pkg) : 0;
      return '<div class="client-package-item">' +
        '<div class="client-package-info">' +
          '<div class="client-package-name">' + ops.escapeHtml(name) + ' <span class="tag ' + (cp.status === 'active' ? 'tag-active' : 'tag-archived') + '">' + ops.escapeHtml(cp.status) + '</span></div>' +
          '<div class="client-package-load">' + sessions.toFixed(1) + ' sessions/week · ' + minutes.toFixed(0) + ' min/week</div>' +
        '</div>' +
        '<button type="button" class="admin-btn danger" onclick="crm.removePackage(\'' + ops.escapeHtml(cp.id) + '\')" style="padding:6px 12px;font-size:11px;">Remove</button>' +
      '</div>';
    }).join('');
  }

  async function assignPackage(e) {
    e.preventDefault();
    const clientId = document.getElementById('detailPackageClientId').value;
    const packageId = document.getElementById('detailPackageSelect').value;
    if (!clientId || !packageId) return;

    try {
      const { data, error } = await client.from('client_packages').insert({
        client_id: clientId,
        package_id: packageId,
        status: 'active',
        started_at: new Date().toISOString()
      }).select();
      if (error) throw error;
      window.opsData.clientPackages.push(data[0]);
      renderClientPackages(clientId);
      const load = activeClientWeeklyLoad();
      document.getElementById('statWeeklySessions').textContent = load.sessions.toFixed(1);
      document.getElementById('statWeeklyMinutes').textContent = load.minutes.toFixed(0);
    } catch (err) {
      alert('Could not assign package: ' + err.message);
      console.error(err);
    }
  }

  async function removePackage(id) {
    if (!confirm('Remove this package assignment?')) return;
    const cp = window.opsData.clientPackages.find(function (x) { return x.id === id; });
    try {
      const { error } = await client.from('client_packages').delete().eq('id', id);
      if (error) throw error;
      window.opsData.clientPackages = window.opsData.clientPackages.filter(function (x) { return x.id !== id; });
      if (cp) renderClientPackages(cp.client_id);
      const load = activeClientWeeklyLoad();
      document.getElementById('statWeeklySessions').textContent = load.sessions.toFixed(1);
      document.getElementById('statWeeklyMinutes').textContent = load.minutes.toFixed(0);
    } catch (err) {
      alert('Could not remove package assignment: ' + err.message);
      console.error(err);
    }
  }

  function renderCommunications(clientId) {
    const container = document.getElementById('detailCommunicationsList');
    if (!container) return;
    const list = window.opsData.communications.filter(function (x) { return x.client_id === clientId; })
      .sort(function (a, b) { return new Date(b.created_at) - new Date(a.created_at); });

    if (!list.length) {
      container.innerHTML = '<div class="client-notes-empty">No communications logged yet.</div>';
      return;
    }

    container.innerHTML = list.map(function (x) {
      return '<div class="client-note">' +
        '<div class="client-note-text"><span class="tag ' + commClass(x.type) + '">' + ops.escapeHtml(x.type) + '</span> ' + ops.escapeHtml(x.status) + (x.direction ? ' · ' + ops.escapeHtml(x.direction) : '') + '</div>' +
        '<div class="client-note-text">' + ops.escapeHtml(x.body || '') + '</div>' +
        '<div class="client-note-date">' + ops.fmtDateShort(x.created_at) + '</div>' +
      '</div>';
    }).join('');
  }

  function commClass(type) {
    const map = { sms: 'tag-warm', call: 'tag-active', email: 'tag-draft', whatsapp: 'tag-active', in_person: 'tag-active', note: 'tag-archived' };
    return map[type] || 'tag-draft';
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
    const visibleBox = document.getElementById('detailNoteVisible');
    if (!clientId || !text) return;

    try {
      const { error } = await client.from('client_notes').insert({
        client_id: clientId,
        note: text,
        visible_to_client: visibleBox ? !!visibleBox.checked : false,
        created_by: window.opsData.user ? window.opsData.user.id : null
      });
      if (error) throw error;
      document.getElementById('detailNoteText').value = '';
      if (visibleBox) visibleBox.checked = false;

      const { data, error: loadErr } = await client.from('client_notes').select('*').eq('client_id', clientId).order('created_at', { ascending: false });
      if (loadErr) throw loadErr;
      window.opsData.clientNotes = window.opsData.clientNotes.filter(function (n) { return n.client_id !== clientId; }).concat(data || []);
      renderNotesList(clientId);
    } catch (err) {
      alert('Could not add note: ' + err.message);
      console.error(err);
    }
  }

  async function inviteToPortal() {
    const clientId = document.getElementById('detailClientId').value;
    if (!clientId) return;
    const c = window.opsData.clients.find(function (x) { return x.id === clientId; });
    if (!c) return;

    if (!confirm('Send a portal invitation to ' + c.full_name + ' at ' + (c.email || 'no email') + '?')) return;

    try {
      const { data: sessionData } = await client.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error('Admin session not found. Please sign in again.');

      const res = await fetch('/api/portal/invite', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + token,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ client_id: clientId })
      });

      const result = await res.json().catch(function () { return { error: 'Unknown response' }; });
      if (!res.ok) throw new Error(result.error || 'Invite failed');

      alert(result.message || 'Invitation sent.');
      c.auth_user_id = result.auth_user_id || c.auth_user_id;
      c.portal_invited_at = new Date().toISOString();
      loadPortalSection(clientId);
    } catch (err) {
      alert('Could not invite client: ' + err.message);
      console.error(err);
    }
  }

  async function loadPortalSection(clientId) {
    const c = window.opsData.clients.find(function (x) { return x.id === clientId; });
    const statusEl = document.getElementById('detailPortalStatus');
    const inviteBtn = document.getElementById('detailInviteBtn');
    const metricForm = document.getElementById('detailMetricForm');
    const metricsList = document.getElementById('detailMetricsList');

    if (!c) return;

    if (c.auth_user_id) {
      statusEl.innerHTML =
        '<div class="cd-icon"><svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg></div>' +
        '<div class="cd-content"><span class="label">Portal</span>Invited · last login ' + (c.portal_last_login ? ops.fmtDateShort(c.portal_last_login) : 'never') + '</div>';
      inviteBtn.style.display = 'none';
      metricForm.style.display = 'block';
    } else {
      statusEl.innerHTML =
        '<div class="cd-icon"><svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6h-2V7zm0 8h2v2h-2v-2z"/></svg></div>' +
        '<div class="cd-content"><span class="label">Portal</span>Not yet invited</div>';
      inviteBtn.style.display = 'inline-block';
      metricForm.style.display = 'none';
    }

    try {
      const [{ data: metrics, error: mErr }, { data: photos, error: pErr }] = await Promise.all([
        client.from('client_metrics').select('*').eq('client_id', clientId).order('measured_at', { ascending: false }).limit(20),
        client.from('client_photos').select('*').eq('client_id', clientId).order('taken_at', { ascending: false }).limit(8)
      ]);
      if (mErr) throw mErr;
      if (pErr) throw pErr;

      let html = '';
      if (!metrics || !metrics.length) {
        html += '<div class="client-notes-empty">No progress metrics yet.</div>';
      } else {
        html += '<table class="data-table" style="font-size:13px;"><thead><tr><th>Date</th><th>Weight</th><th>Body fat</th><th>Muscle</th><th>Waist</th></tr></thead><tbody>' +
          metrics.map(function (m) {
            return '<tr>' +
              '<td>' + ops.fmtDateShort(m.measured_at) + '</td>' +
              '<td>' + formatMetric(m.weight_kg, 'kg') + '</td>' +
              '<td>' + formatMetric(m.body_fat_pct, '%') + '</td>' +
              '<td>' + formatMetric(m.muscle_mass_pct, '%') + '</td>' +
              '<td>' + formatMetric(m.waist_cm, 'cm') + '</td>' +
            '</tr>';
          }).join('') +
          '</tbody></table>';
      }

      if (photos && photos.length) {
        html += '<div style="margin-top:16px;">' +
          photos.map(function (p) {
            return '<img src="' + ops.escapeHtml(p.photo_url) + '" style="width:80px;height:80px;object-fit:cover;border-radius:4px;margin-right:8px;cursor:pointer;" onclick="window.open(\'' + ops.escapeHtml(p.photo_url) + '\',\'_blank\')" title="' + ops.escapeHtml(p.label || 'photo') + ' · ' + ops.fmtDateShort(p.taken_at) + '" alt="" loading="lazy">';
          }).join('') +
          '</div>';
      }

      metricsList.innerHTML = html;
      document.getElementById('detailMetricDate').valueAsDate = new Date();
    } catch (err) {
      console.error(err);
      metricsList.innerHTML = '<div class="client-notes-empty">Could not load metrics.</div>';
    }
  }

  function formatMetric(v, unit) {
    if (v === null || v === undefined) return '-';
    return Number(v).toFixed(1) + unit;
  }

  async function addMetric(e) {
    e.preventDefault();
    const clientId = document.getElementById('detailClientId').value;
    if (!clientId) return;

    const weight = document.getElementById('detailMetricWeight').value;
    const bodyFat = document.getElementById('detailMetricBodyFat').value;
    const waist = document.getElementById('detailMetricWaist').value;

    if (!weight && !bodyFat && !waist) {
      alert('Enter at least one metric value.');
      return;
    }

    try {
      const { error } = await client.from('client_metrics').insert({
        client_id: clientId,
        measured_at: document.getElementById('detailMetricDate').value,
        weight_kg: weight ? Number(weight) : null,
        body_fat_pct: bodyFat ? Number(bodyFat) : null,
        waist_cm: waist ? Number(waist) : null,
        created_by: window.opsData.user ? window.opsData.user.id : null
      });
      if (error) throw error;
      document.getElementById('detailMetricForm').reset();
      document.getElementById('detailMetricDate').valueAsDate = new Date();
      loadPortalSection(clientId);
    } catch (err) {
      alert('Could not add metric: ' + err.message);
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
    addNote,
    assignPackage,
    removePackage,
    inviteToPortal,
    addMetric,
    loadPortalSection
  };
})();
