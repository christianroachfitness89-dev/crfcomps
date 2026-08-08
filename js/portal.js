(function () {
  const state = {
    profile: null,
    charts: {}
  };

  async function init() {
    try {
      const session = await requireClientSession();
      if (!session) return;
      await loadDashboard();
    } catch (err) {
      console.error(err);
      showGlobalError('Could not load portal. Please sign in again.');
      setTimeout(() => { window.location.href = 'portal-login.html'; }, 2000);
    }
  }

  function showGlobalError(msg) {
    document.querySelector('.portal-body').insertAdjacentHTML('afterbegin',
      '<div class="portal-card" style="background:#f8e8e5;color:var(--red-dark);margin-bottom:24px;">' + escapeHtml(msg) + '</div>');
  }

  async function loadDashboard() {
    const token = await getPortalAccessToken();
    if (!token) {
      window.location.href = 'portal-login.html';
      return;
    }

    const res = await fetch('/api/portal/profile', {
      headers: { 'Authorization': 'Bearer ' + token }
    });

    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        await signOut();
        window.location.href = 'portal-login.html';
        return;
      }
      throw new Error('Failed to load profile');
    }

    const data = await res.json();
    state.profile = data;
    renderHeader(data);
    renderDashboard(data);
    renderProgress(data);
    renderSessions(data);
    renderForms(data);
    renderBilling(data);
  }

  async function getPortalAccessToken() {
    const { data } = await window.sb.auth.getSession();
    return data?.session?.access_token || null;
  }

  function renderHeader(data) {
    const firstName = (data.client?.full_name || '').split(' ')[0] || 'there';
    document.getElementById('greeting').textContent = 'Hello, ' + firstName;
    document.getElementById('clientPackage').textContent = data.package?.packages?.name || data.package?.package_name || 'Client';
    document.getElementById('avatar').textContent = initials(data.client?.full_name || '');
  }

  function sessionListFromProfile(data) {
    const upcoming = data.attendance?.upcoming_sessions || [];
    const past = data.attendance?.past_sessions || [];
    return [
      ...upcoming.map(s => ({ ...s, _direction: 'upcoming', is_complete: s.status === 'completed' })),
      ...past.map(s => ({ ...s, _direction: 'past', is_complete: s.status === 'completed' }))
    ];
  }

  function renderDashboard(data) {
    const sessions = sessionListFromProfile(data);
    const upcoming = sessions.filter(s => !s.is_complete);
    const next = upcoming.length
      ? upcoming.slice().sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at))[0]
      : null;

    if (next) {
      const d = new Date(next.scheduled_at);
      document.getElementById('nextSession').innerHTML = `
        <div class="next-session">
          <div class="date-box">
            <div class="day">${d.getDate()}</div>
            <div class="month">${d.toLocaleString('en-US', { month: 'short' })}</div>
          </div>
          <div class="info">
            <div style="font-weight:700;margin-bottom:4px;">${next.title || 'Training session'}</div>
            <div class="time">${formatTime(d)} · ${next.duration_minutes ? next.duration_minutes + ' min' : 'Studio'}</div>
            <div style="margin-top:10px;"><span class="tag green">${capitalize(next.status || 'scheduled')}</span></div>
          </div>
        </div>`;
    } else {
      document.getElementById('nextSession').innerHTML = '<p class="muted">No upcoming sessions scheduled.</p>';
    }

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const completedThisMonth = (data.attendance?.past_sessions || [])
      .filter(s => s.status === 'completed' && new Date(s.scheduled_at) >= monthStart).length;
    document.getElementById('sessionsCount').textContent = completedThisMonth;

    const latestMetric = data.metrics?.[0];
    document.getElementById('latestWeight').textContent = latestMetric?.weight_kg ? Number(latestMetric.weight_kg).toFixed(1) : '-';

    renderMeasurementsPanel(latestMetric);
    renderAttendance(data.attendance);
    renderOverviewChart(data.metrics || []);
  }

  function renderMeasurementsPanel(metric) {
    if (!metric) {
      document.getElementById('latestMeasurements').innerHTML = '<p class="muted">No measurements yet.</p>';
      return;
    }
    const rows = [
      ['Body fat', metric.body_fat_pct, '%'],
      ['Muscle mass', metric.muscle_mass_pct, '%'],
      ['Waist', metric.waist_cm, 'cm'],
      ['Hips', metric.hips_cm, 'cm'],
      ['Chest', metric.chest_cm, 'cm'],
      ['Arms', metric.arm_cm, 'cm'],
      ['Thighs', metric.thigh_cm, 'cm']
    ].filter(function (r) { return r[1] != null; });

    document.getElementById('latestMeasurements').innerHTML = rows.map(([label, value, unit]) =>
      `<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--line);">
        <span class="muted">${label}</span>
        <span style="font-weight:600;">${Number(value).toFixed(1)}${unit}</span>
      </div>`
    ).join('');
  }

  function renderAttendance(attendance) {
    const recent = (attendance?.past_sessions || [])
      .slice(0, 10)
      .map(function (s) {
        return {
          session_date: s.scheduled_at,
          session_type: s.title,
          status: s.status,
          coach_note: s.notes
        };
      });
    if (!recent.length) {
      document.getElementById('attendanceList').innerHTML = '<p class="muted">No attendance records yet.</p>';
      return;
    }
    document.getElementById('attendanceList').innerHTML = `
      <table class="data-table">
        <thead><tr><th>Date</th><th>Session</th><th>Status</th><th>Coach note</th></tr></thead>
        <tbody>
          ${recent.map(a => `
            <tr>
              <td>${formatDate(a.session_date)}</td>
              <td>${a.session_type || '-'}</td>
              <td><span class="tag ${a.status === 'completed' || a.status === 'attended' ? 'green' : ''}">${capitalize(a.status || '-')}</span></td>
              <td>${a.coach_note ? truncate(a.coach_note, 60) : '-'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>`;
  }

  function renderProgress(data) {
    const metrics = (data.metrics || []).slice().sort((a, b) => new Date(a.measured_at) - new Date(b.measured_at));
    renderWeightChart(metrics);
    renderBodyFatChart(metrics);
    renderMuscleChart(metrics);
    renderPhotoGallery(data.photos || []);
    renderAllMeasurements((data.metrics || []).slice());
    document.getElementById('mDate').valueAsDate = new Date();
  }

  function chartOptions(yLabel) {
    return {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: { backgroundColor: 'rgba(11,12,16,0.9)', titleFont: { family: 'Inter' }, bodyFont: { family: 'Inter' } }
      },
      scales: {
        x: { grid: { display: false }, ticks: { font: { family: 'Inter', size: 11 }, color: '#5b626a' } },
        y: { border: { display: false }, grid: { color: 'rgba(0,0,0,.05)' }, ticks: { font: { family: 'Inter', size: 11 }, color: '#5b626a' }, title: { display: !!yLabel, text: yLabel, color: '#8f97a1', font: { size: 11 } } }
      }
    };
  }

  function renderOverviewChart(metrics) {
    const ctx = document.getElementById('progressChart').getContext('2d');
    const labels = metrics.map(m => formatShortDate(m.measured_at));
    const data = metrics.map(m => m.weight_kg);
    if (state.charts.overview) state.charts.overview.destroy();
    state.charts.overview = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Weight (kg)',
          data,
          borderColor: '#c73e2a',
          backgroundColor: 'rgba(199,62,42,0.08)',
          fill: true,
          tension: 0.35,
          pointRadius: 4,
          pointBackgroundColor: '#c73e2a',
          borderWidth: 2
        }]
      },
      options: chartOptions('kg')
    });
  }

  function renderWeightChart(metrics) {
    const ctx = document.getElementById('weightChart').getContext('2d');
    if (state.charts.weight) state.charts.weight.destroy();
    state.charts.weight = new Chart(ctx, {
      type: 'line',
      data: {
        labels: metrics.map(m => formatShortDate(m.measured_at)),
        datasets: [{
          label: 'Weight (kg)',
          data: metrics.map(m => m.weight_kg),
          borderColor: '#c73e2a',
          backgroundColor: 'rgba(199,62,42,0.08)',
          fill: true,
          tension: 0.35,
          borderWidth: 2,
          pointRadius: 4
        }]
      },
      options: chartOptions('kg')
    });
  }

  function renderBodyFatChart(metrics) {
    const ctx = document.getElementById('bodyFatChart').getContext('2d');
    if (state.charts.bodyFat) state.charts.bodyFat.destroy();
    state.charts.bodyFat = new Chart(ctx, {
      type: 'line',
      data: {
        labels: metrics.map(m => formatShortDate(m.measured_at)),
        datasets: [{
          label: 'Body fat %',
          data: metrics.map(m => m.body_fat_pct),
          borderColor: '#3b82f6',
          backgroundColor: 'rgba(59,130,246,0.08)',
          fill: true,
          tension: 0.35,
          borderWidth: 2,
          pointRadius: 4
        }]
      },
      options: chartOptions('%')
    });
  }

  function renderMuscleChart(metrics) {
    const ctx = document.getElementById('muscleChart').getContext('2d');
    if (state.charts.muscle) state.charts.muscle.destroy();
    state.charts.muscle = new Chart(ctx, {
      type: 'line',
      data: {
        labels: metrics.map(m => formatShortDate(m.measured_at)),
        datasets: [{
          label: 'Muscle mass %',
          data: metrics.map(m => m.muscle_mass_pct),
          borderColor: '#10b981',
          backgroundColor: 'rgba(16,185,129,0.08)',
          fill: true,
          tension: 0.35,
          borderWidth: 2,
          pointRadius: 4
        }]
      },
      options: chartOptions('%')
    });
  }

  function renderPhotoGallery(photos) {
    if (!photos.length) {
      document.getElementById('photoGallery').innerHTML = '<div class="empty-state">No photos uploaded yet.</div>';
      return;
    }
    document.getElementById('photoGallery').innerHTML = `
      <div class="photo-grid">
        ${photos.map(p => `
          <div>
            <div class="photo-thumb" style="background-image:url('${escapeHtml(p.photo_url)}')"
                 onclick="window.open('${escapeHtml(p.photo_url)}','_blank')"></div>
            <div class="photo-meta">${formatDate(p.taken_at)} · ${escapeHtml(p.label || 'progress')}</div>
          </div>
        `).join('')}
      </div>`;
  }

  function renderAllMeasurements(metrics) {
    if (!metrics.length) {
      document.getElementById('allMeasurements').innerHTML = '<p class="muted">No measurements yet.</p>';
      return;
    }
    document.getElementById('allMeasurements').innerHTML = `
      <table class="data-table">
        <thead>
          <tr>
            <th>Date</th><th>Weight</th><th>Body fat</th><th>Muscle</th><th>Waist</th><th>Hips</th><th>Chest</th><th>Arms</th><th>Thighs</th>
          </tr>
        </thead>
        <tbody>
          ${metrics.map(m => `
            <tr>
              <td>${formatDate(m.measured_at)}</td>
              <td>${formatNum(m.weight_kg, 'kg')}</td>
              <td>${formatNum(m.body_fat_pct, '%')}</td>
              <td>${formatNum(m.muscle_mass_pct, '%')}</td>
              <td>${formatNum(m.waist_cm, 'cm')}</td>
              <td>${formatNum(m.hips_cm, 'cm')}</td>
              <td>${formatNum(m.chest_cm, 'cm')}</td>
              <td>${formatNum(m.arm_cm, 'cm')}</td>
              <td>${formatNum(m.thigh_cm, 'cm')}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>`;
  }

  function renderSessions(data) {
    const upcoming = (data.attendance?.upcoming_sessions || []).slice();
    const past = (data.attendance?.past_sessions || []).slice();

    document.getElementById('upcomingSessions').innerHTML = upcoming.length ? sessionTable(upcoming) : '<p class="muted">No upcoming sessions.</p>';
    document.getElementById('pastSessions').innerHTML = past.length ? sessionTable(past) : '<p class="muted">No past sessions.</p>';
  }

  function sessionTable(list) {
    return `
      <table class="data-table">
        <thead><tr><th>Date</th><th>Time</th><th>Type</th><th>Duration</th><th>Status</th></tr></thead>
        <tbody>
          ${list.map(s => {
            const d = new Date(s.scheduled_at);
            return `<tr>
              <td>${formatDate(s.scheduled_at)}</td>
              <td>${formatTime(d)}</td>
              <td>${s.title || '-'}</td>
              <td>${s.duration_minutes ? s.duration_minutes + ' min' : '-'}</td>
              <td><span class="tag ${s.status === 'completed' ? 'green' : ''}">${capitalize(s.status || 'scheduled')}</span></td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>`;
  }

  function renderForms(data) {
    const forms = data.forms || [];
    if (!forms.length) {
      document.getElementById('formsList').innerHTML = '<p class="muted">No forms or contracts on file.</p>';
    } else {
      document.getElementById('formsList').innerHTML = `
        <table class="data-table">
          <thead><tr><th>Form</th><th>Type</th><th>Submitted</th><th>Action</th></tr></thead>
          <tbody>
            ${forms.map(f => `
              <tr>
                <td>${escapeHtml(f.form_templates?.name || f.template_id || '-')}</td>
                <td>${escapeHtml(f.status || '-')}</td>
                <td>${formatDate(f.created_at)}</td>
                <td>${f.pdf_url ? `<a href="${escapeHtml(f.pdf_url)}" target="_blank" class="link">View</a>` : '-'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>`;
    }

    const notes = data.notes || [];
    if (!notes.length) {
      document.getElementById('notesList').innerHTML = '<p class="muted">No coach notes shared with you yet.</p>';
    } else {
      document.getElementById('notesList').innerHTML = notes.map(n => `
        <div style="padding:14px 0;border-bottom:1px solid var(--line);">
          <div class="muted" style="margin-bottom:6px;font-size:12px;">${formatDate(n.created_at)}${n.created_by_name ? ' · ' + escapeHtml(n.created_by_name) : ''}</div>
          <div style="white-space:pre-line;">${escapeHtml(n.note)}</div>
        </div>
      `).join('');
    }
  }

  function renderBilling(data) {
    const invoices = data.billing?.invoices || [];
    document.getElementById('invoicesList').innerHTML = invoices.length ? `
      <table class="data-table">
        <thead><tr><th>Invoice #</th><th>Date</th><th>Amount</th><th>Status</th><th>Action</th></tr></thead>
        <tbody>
          ${invoices.map(inv => `
            <tr>
              <td>${escapeHtml(inv.reference || inv.id?.slice(0, 8) || '-')}</td>
              <td>${formatDate(inv.issued_at)}</td>
              <td style="font-weight:600;">${formatCurrencyFromDollars(inv.amount)}</td>
              <td><span class="tag ${inv.status === 'paid' ? 'green' : ''}">${capitalize(inv.status || 'pending')}</span></td>
              <td>${inv.pdf_url ? `<a href="${escapeHtml(inv.pdf_url)}" target="_blank" class="link">View</a>` : '-'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>` : '<p class="muted">No invoices.</p>';

    const payments = data.billing?.payments || [];
    document.getElementById('paymentsList').innerHTML = payments.length ? `
      <table class="data-table">
        <thead><tr><th>Date</th><th>Method</th><th>Amount</th><th>Status</th></tr></thead>
        <tbody>
          ${payments.map(p => `
            <tr>
              <td>${formatDate(p.paid_at || p.created_at)}</td>
              <td>${escapeHtml(p.method || '-')}</td>
              <td style="font-weight:600;">${formatCurrencyFromDollars(p.amount)}</td>
              <td><span class="tag ${p.status === 'succeeded' || p.status === 'completed' ? 'green' : ''}">${capitalize(p.status || '-')}</span></td>
            </tr>
          `).join('')}
        </tbody>
      </table>` : '<p class="muted">No payments recorded.</p>';
  }

  async function addMetric(e) {
    e.preventDefault();
    const btn = document.getElementById('metricBtn');
    const msg = document.getElementById('metricMsg');

    const payload = {
      measured_at: document.getElementById('mDate').value,
      weight_kg: val('mWeight'),
      body_fat_pct: val('mBodyFat'),
      muscle_mass_pct: val('mMuscle'),
      waist_cm: val('mWaist')
    };

    if (!payload.weight_kg && !payload.body_fat_pct && !payload.muscle_mass_pct && !payload.waist_cm) {
      msg.innerHTML = '<span style="color:var(--red-dark);">Please enter at least one value.</span>';
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Saving...';

    try {
      const token = await getPortalAccessToken();
      const res = await fetch('/api/portal/metrics', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + token,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(result.error || 'Could not save metric');

      msg.innerHTML = '<span style="color:#2e7d32;">Saved.</span>';
      document.getElementById('metricsForm').reset();
      document.getElementById('mDate').valueAsDate = new Date();
      await loadDashboard();
    } catch (err) {
      console.error(err);
      msg.innerHTML = '<span style="color:var(--red-dark);">' + escapeHtml(err.message || 'Save failed') + '</span>';
    } finally {
      btn.disabled = false;
      btn.textContent = 'Save entry';
    }
  }
  window.addMetric = addMetric;

  function val(id) {
    const v = document.getElementById(id).value;
    return v === '' ? null : Number(v);
  }

  function switchSection(name, e) {
    if (e) e.preventDefault();
    document.querySelectorAll('.portal-section').forEach(s => s.style.display = 'none');
    document.getElementById(name).style.display = 'block';
    document.querySelectorAll('[data-section]').forEach(a => a.classList.remove('active'));
    document.querySelectorAll('[data-section="' + name + '"]').forEach(a => a.classList.add('active'));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  window.switchSection = switchSection;

  function logout() {
    signOut().then(() => { window.location.href = 'portal-login.html'; });
  }
  window.logout = logout;

  function formatDate(iso) {
    if (!iso) return '-';
    return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function formatShortDate(iso) {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
  }

  function formatTime(d) {
    if (!d || isNaN(d.getTime())) return '-';
    return d.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' });
  }

  function formatCurrencyFromDollars(amount) {
    if (amount == null) return '-';
    const dollars = typeof amount === 'number' ? amount : Number(amount);
    return '$' + dollars.toFixed(2);
  }

  function formatNum(n, suffix) {
    if (n == null) return '-';
    return Number(n).toFixed(1) + (suffix || '');
  }

  function capitalize(s) {
    if (!s) return '-';
    return String(s).replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }

  function initials(name) {
    return (name || '').split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase() || '-';
  }

  function truncate(str, len) {
    if (!str) return '';
    return str.length > len ? str.slice(0, len) + '…' : str;
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }

  init();
})();