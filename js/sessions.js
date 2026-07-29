/*
 * CRF Comps — Sessions / Schedule page logic
 *
 * Handles 1-on-1 session scheduling, status updates, and attendance.
 */

(function () {
  const client = window.sb;
  const ops = window.operations;

  const SESSION_STATUSES = [
    ['scheduled', 'Scheduled'],
    ['completed', 'Completed'],
    ['cancelled', 'Cancelled'],
    ['no_show', 'No show']
  ];

  const ATTENDANCE_STATUSES = [
    ['attended', 'Attended'],
    ['late', 'Late'],
    ['excused', 'Excused'],
    ['absent', 'Absent']
  ];

  const SESSION_CLASS = {
    scheduled: 'tag-warm',
    completed: 'tag-active',
    cancelled: 'tag-archived',
    no_show: 'tag-hot'
  };

  const ATTENDANCE_CLASS = {
    attended: 'tag-active',
    late: 'tag-warm',
    excused: 'tag-draft',
    absent: 'tag-hot'
  };

  function clientName(id) {
    if (!id) return '-';
    const c = window.opsData.clients.find(function (x) { return x.id === id; });
    return c ? c.full_name : 'Unknown client';
  }

  function sessionStatusLabel(key) {
    const s = SESSION_STATUSES.find(function (x) { return x[0] === key; });
    return s ? s[1] : key;
  }

  function attendanceStatusLabel(key) {
    const s = ATTENDANCE_STATUSES.find(function (x) { return x[0] === key; });
    return s ? s[1] : key;
  }

  function sessionStatusBadge(status) {
    const cls = SESSION_CLASS[status] || 'tag-draft';
    return '<span class="tag ' + cls + '">' + ops.escapeHtml(sessionStatusLabel(status)) + '</span>';
  }

  function attendanceStatusBadge(status) {
    const cls = ATTENDANCE_CLASS[status] || 'tag-draft';
    return '<span class="tag ' + cls + '">' + ops.escapeHtml(attendanceStatusLabel(status)) + '</span>';
  }

  function fmtDateTimeLocal(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    const pad = function (n) { return n < 10 ? '0' + n : n; };
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  function fmtDateTime(iso) {
    if (!iso) return '-';
    const d = new Date(iso);
    return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  function renderClientOptions(selectId, currentId) {
    const select = document.getElementById(selectId);
    if (!select) return;
    select.innerHTML = window.opsData.clients.map(function (c) {
      return '<option value="' + ops.escapeHtml(c.id) + '"' + (c.id === currentId ? ' selected' : '') + '>' + ops.escapeHtml(c.full_name) + '</option>';
    }).join('');
  }

  function refresh() {
    document.getElementById('sessionsTableWrap').innerHTML = '<div class="loading">Loading sessions...</div>';
    return ops.loadData().then(function () {
      renderStats();
      renderSessions();
    });
  }

  function renderStats() {
    const now = new Date();
    const dayStart = new Date(now); dayStart.setHours(0, 0, 0, 0);
    const weekAgo = new Date(now); weekAgo.setDate(weekAgo.getDate() - 7);

    const upcoming = window.opsData.sessions.filter(function (s) {
      return s.scheduled_at && new Date(s.scheduled_at) >= dayStart && s.status === 'scheduled';
    }).length;

    const thisWeek = window.opsData.sessions.filter(function (s) {
      return s.scheduled_at && new Date(s.scheduled_at) >= weekAgo;
    }).length;

    const completed = window.opsData.sessions.filter(function (s) {
      return s.status === 'completed';
    }).length;

    const attended = window.opsData.attendance.filter(function (a) {
      const session = window.opsData.sessions.find(function (s) { return s.id === a.session_id; });
      return session && session.scheduled_at && new Date(session.scheduled_at) >= weekAgo && a.status === 'attended';
    }).length;
    const totalWeek = window.opsData.attendance.filter(function (a) {
      const session = window.opsData.sessions.find(function (s) { return s.id === a.session_id; });
      return session && session.scheduled_at && new Date(session.scheduled_at) >= weekAgo;
    }).length;

    document.getElementById('statUpcoming').textContent = upcoming;
    document.getElementById('statThisWeek').textContent = thisWeek;
    document.getElementById('statCompleted').textContent = completed;
    document.getElementById('statAttendance').textContent = attended + (totalWeek ? '/' + totalWeek : '');
  }

  function filterSessions() {
    const q = (document.getElementById('sessionSearch').value || '').toLowerCase().trim();
    const status = document.getElementById('sessionStatusFilter').value;
    return window.opsData.sessions.filter(function (s) {
      const cname = clientName(s.client_id).toLowerCase();
      const matchesQ = !q || cname.includes(q) || (s.title || '').toLowerCase().includes(q) || (s.notes || '').toLowerCase().includes(q);
      const matchesStatus = !status || s.status === status;
      return matchesQ && matchesStatus;
    }).sort(function (a, b) { return new Date(a.scheduled_at || 0) - new Date(b.scheduled_at || 0); });
  }

  function getAttendanceForSession(sessionId) {
    return window.opsData.attendance.filter(function (a) { return a.session_id === sessionId; });
  }

  function renderSessions() {
    const container = document.getElementById('sessionsTableWrap');
    const sessions = filterSessions();

    if (!sessions.length) {
      container.innerHTML = '<div class="dash-empty">No sessions found. Add one to get started.</div>';
      return;
    }

    let html = '<table class="data-table sessions-table">' +
      '<thead><tr>' +
        '<th>Client</th>' +
        '<th>Title</th>' +
        '<th>Scheduled</th>' +
        '<th>Duration</th>' +
        '<th>Status</th>' +
        '<th>Attendance</th>' +
        '<th>Actions</th>' +
      '</tr></thead><tbody>';

    sessions.forEach(function (s) {
      const attendees = getAttendanceForSession(s.id);
      const attendanceSummary = attendees.length
        ? attendees.map(function (a) { return attendanceStatusBadge(a.status); }).join(' ')
        : '-';

      html += '<tr>' +
        '<td><strong>' + ops.escapeHtml(clientName(s.client_id)) + '</strong></td>' +
        '<td>' + ops.escapeHtml(s.title || '1-on-1 coaching') + '</td>' +
        '<td>' + fmtDateTime(s.scheduled_at) + '</td>' +
        '<td>' + (s.duration_minutes || 60) + ' min</td>' +
        '<td><select onchange="sessions.updateSessionStatus(\'' + ops.escapeHtml(s.id) + '\', this.value)" style="font-size:12px;padding:4px 8px;border-radius:var(--radius);border:1.5px solid var(--line);">' +
          SESSION_STATUSES.map(function (o) {
            return '<option value="' + ops.escapeHtml(o[0]) + '"' + (s.status === o[0] ? ' selected' : '') + '>' + ops.escapeHtml(o[1]) + '</option>';
          }).join('') +
        '</select></td>' +
        '<td>' + attendanceSummary + '</td>' +
        '<td class="sessions-actions">' +
          '<button class="admin-btn" onclick="sessions.openAttendanceModal(\'' + ops.escapeHtml(s.id) + '\')" style="padding:6px 12px;font-size:11px;">Attendance</button>' +
          '<button class="admin-btn" onclick="sessions.editSession(\'' + ops.escapeHtml(s.id) + '\')" style="padding:6px 12px;font-size:11px;">Edit</button>' +
          '<button class="admin-btn danger" onclick="sessions.deleteSession(\'' + ops.escapeHtml(s.id) + '\')" style="padding:6px 12px;font-size:11px;">Delete</button>' +
        '</td>' +
      '</tr>';
    });

    html += '</tbody></table>';
    container.innerHTML = html;
  }

  async function updateSessionStatus(id, status) {
    try {
      const payload = { status: status, updated_at: new Date().toISOString() };
      const { error } = await client.from('sessions').update(payload).eq('id', id);
      if (error) throw error;
      await refresh();
    } catch (err) {
      alert('Could not update session: ' + err.message);
      console.error(err);
    }
  }

  function openSessionModal() {
    document.getElementById('sessionForm').reset();
    document.getElementById('sessionId').value = '';
    document.getElementById('sessionModalTitle').textContent = 'Add session';
    document.getElementById('sessionSaveBtn').textContent = 'Save session';
    document.getElementById('sessionTitle').value = '1-on-1 coaching';
    document.getElementById('sessionDuration').value = '60';
    document.getElementById('sessionScheduledAt').value = '';
    renderClientOptions('sessionClient', '');
    document.getElementById('sessionModal').classList.add('show');
  }

  function editSession(id) {
    const s = window.opsData.sessions.find(function (x) { return x.id === id; });
    if (!s) return;
    document.getElementById('sessionId').value = s.id;
    document.getElementById('sessionTitle').value = s.title || '1-on-1 coaching';
    document.getElementById('sessionScheduledAt').value = fmtDateTimeLocal(s.scheduled_at);
    document.getElementById('sessionDuration').value = s.duration_minutes || 60;
    document.getElementById('sessionStatus').value = s.status || 'scheduled';
    document.getElementById('sessionNotes').value = s.notes || '';
    document.getElementById('sessionModalTitle').textContent = 'Edit session';
    document.getElementById('sessionSaveBtn').textContent = 'Update session';
    renderClientOptions('sessionClient', s.client_id);
    document.getElementById('sessionModal').classList.add('show');
  }

  function closeSessionModal(e) {
    if (e && e.target !== e.currentTarget) return;
    document.getElementById('sessionModal').classList.remove('show');
  }

  async function saveSession(e) {
    e.preventDefault();
    const btn = document.getElementById('sessionSaveBtn');
    btn.disabled = true;

    const id = document.getElementById('sessionId').value;
    const payload = {
      client_id: document.getElementById('sessionClient').value,
      title: document.getElementById('sessionTitle').value.trim() || '1-on-1 coaching',
      scheduled_at: new Date(document.getElementById('sessionScheduledAt').value).toISOString(),
      duration_minutes: Number(document.getElementById('sessionDuration').value) || 60,
      status: document.getElementById('sessionStatus').value,
      notes: document.getElementById('sessionNotes').value.trim() || null,
      updated_at: new Date().toISOString()
    };

    try {
      let result;
      if (id) {
        result = await client.from('sessions').update(payload).eq('id', id).select();
      } else {
        result = await client.from('sessions').insert(payload).select();
      }
      if (result.error) throw result.error;
      closeSessionModal();
      await refresh();
    } catch (err) {
      alert('Could not save session: ' + err.message);
      console.error(err);
    } finally {
      btn.disabled = false;
    }
  }

  async function deleteSession(id) {
    if (!confirm('Delete this session?')) return;
    try {
      const { error } = await client.from('sessions').delete().eq('id', id);
      if (error) throw error;
      await refresh();
    } catch (err) {
      alert('Could not delete session: ' + err.message);
      console.error(err);
    }
  }

  function openAttendanceModal(sessionId) {
    const session = window.opsData.sessions.find(function (s) { return s.id === sessionId; });
    document.getElementById('attendanceSessionId').value = sessionId;
    document.getElementById('attendanceModalTitle').textContent = 'Attendance — ' + (session ? ops.escapeHtml(session.title || 'Session') : 'Session');

    renderClientOptions('attendanceClient', session ? session.client_id : '');
    document.getElementById('attendanceStatus').value = 'attended';
    document.getElementById('attendanceNotes').value = '';

    const current = getAttendanceForSession(sessionId);
    const container = document.getElementById('attendanceCurrent');
    if (!current.length) {
      container.innerHTML = '<div class="attendance-empty">No attendance recorded yet.</div>';
    } else {
      container.innerHTML = '<div class="attendance-list">' +
        current.map(function (a) {
          return '<div class="attendance-row">' +
            '<span class="attendance-name">' + ops.escapeHtml(clientName(a.client_id)) + '</span>' +
            attendanceStatusBadge(a.status) +
            (a.notes ? '<div class="attendance-note">' + ops.escapeHtml(a.notes) + '</div>' : '') +
          '</div>';
        }).join('') +
      '</div>';
    }

    document.getElementById('attendanceModal').classList.add('show');
  }

  function closeAttendanceModal(e) {
    if (e && e.target !== e.currentTarget) return;
    document.getElementById('attendanceModal').classList.remove('show');
  }

  async function saveAttendance(e) {
    e.preventDefault();
    const sessionId = document.getElementById('attendanceSessionId').value;
    const clientId = document.getElementById('attendanceClient').value;
    const status = document.getElementById('attendanceStatus').value;
    const notes = document.getElementById('attendanceNotes').value.trim() || null;

    if (!sessionId || !clientId) return;

    try {
      const existing = window.opsData.attendance.find(function (a) { return a.session_id === sessionId && a.client_id === clientId; });
      if (existing) {
        const { error } = await client.from('attendance').update({ status: status, notes: notes }).eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await client.from('attendance').insert({ session_id: sessionId, client_id: clientId, status: status, notes: notes });
        if (error) throw error;
      }
      await refresh();
      openAttendanceModal(sessionId);
      document.getElementById('attendanceNotes').value = '';
    } catch (err) {
      alert('Could not save attendance: ' + err.message);
      console.error(err);
    }
  }

  async function init() {
    await refresh();
  }

  window.sessions = {
    init,
    refresh,
    renderStats,
    renderSessions,
    updateSessionStatus,
    openSessionModal,
    editSession,
    closeSessionModal,
    saveSession,
    deleteSession,
    openAttendanceModal,
    closeAttendanceModal,
    saveAttendance
  };
})();
