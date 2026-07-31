/*
 * CRF Comps — Business Forms
 *
 * Schema-driven form builder, draft/submit save, and PDF generation.
 */

(function () {
  const client = window.sb;
  const ops = window.operations;

  const FALLBACK_TEMPLATES = [
    {
      id: 'new_contract',
      key: 'new_contract',
      name: 'New contract',
      description: 'New member training agreement with term, package and signatures.',
      category: 'Contracts',
      status: 'active',
      schema: [
        { key: 'client_id', type: 'client_select', label: 'Client', required: true },
        { key: 'start_date', type: 'date', label: 'Start date', required: true },
        { key: 'term_weeks', type: 'number', label: 'Term (weeks)', required: true, attrs: { min: 1, step: 1 } },
        { key: 'package_id', type: 'package_select', label: 'Package', required: true },
        { key: 'weekly_price', type: 'number', label: 'Weekly price ($)', required: true, attrs: { min: 0, step: '0.01' } },
        { key: 'billing_frequency', type: 'select', label: 'Billing frequency', required: true, options: ['Weekly', 'Fortnightly', 'Monthly'] },
        { key: 'trainer_name', type: 'text', label: 'Trainer name', required: true },
        { key: 'notes', type: 'textarea', label: 'Notes / special terms', required: false },
        { key: 'client_signature', type: 'signature', label: 'Client signature', required: false },
        { key: 'trainer_signature', type: 'signature', label: 'Trainer signature', required: false }
      ]
    },
    {
      id: 'modify_contract',
      key: 'modify_contract',
      name: 'Modify contract',
      description: 'Change an existing members package, term or billing arrangement.',
      category: 'Contracts',
      status: 'active',
      schema: [
        { key: 'client_id', type: 'client_select', label: 'Client', required: true },
        { key: 'current_package', type: 'text', label: 'Current package', required: true },
        { key: 'new_package_id', type: 'package_select', label: 'New package', required: true },
        { key: 'change_reason', type: 'select', label: 'Reason for change', required: true, options: ['Upgrade', 'Downgrade', 'Injury / hold return', 'Other'] },
        { key: 'effective_date', type: 'date', label: 'Effective date', required: true },
        { key: 'new_weekly_price', type: 'number', label: 'New weekly price ($)', required: true, attrs: { min: 0, step: '0.01' } },
        { key: 'trainer_name', type: 'text', label: 'Trainer name', required: true },
        { key: 'notes', type: 'textarea', label: 'Notes', required: false },
        { key: 'client_signature', type: 'signature', label: 'Client signature', required: false },
        { key: 'trainer_signature', type: 'signature', label: 'Trainer signature', required: false }
      ]
    },
    {
      id: 'cancellation',
      key: 'cancellation',
      name: 'Cancellation',
      description: 'Member cancellation notice with reason and final session details.',
      category: 'Contracts',
      status: 'active',
      schema: [
        { key: 'client_id', type: 'client_select', label: 'Client', required: true },
        { key: 'cancellation_date', type: 'date', label: 'Cancellation date', required: true },
        { key: 'last_session_date', type: 'date', label: 'Last session date', required: true },
        { key: 'reason', type: 'select', label: 'Reason', required: true, options: ['Financial', 'Relocating', 'Injury / health', 'Time commitment', 'Not a fit', 'Other'] },
        { key: 'notice_given', type: 'select', label: 'Notice given', required: true, options: ['Yes - in term', 'Yes - out of term', 'No'] },
        { key: 'refund_required', type: 'select', label: 'Refund / credit required', required: true, options: ['None', 'Credit to account', 'Partial refund', 'Full refund'] },
        { key: 'trainer_name', type: 'text', label: 'Trainer name', required: true },
        { key: 'notes', type: 'textarea', label: 'Notes', required: false },
        { key: 'client_signature', type: 'signature', label: 'Client signature', required: false },
        { key: 'trainer_signature', type: 'signature', label: 'Trainer signature', required: false }
      ]
    },
    {
      id: 'dd_hold_form',
      key: 'dd_hold_form',
      name: 'DD hold form',
      description: 'Temporarily suspend direct debits and schedule a resume date.',
      category: 'Finance',
      status: 'active',
      schema: [
        { key: 'client_id', type: 'client_select', label: 'Client', required: true },
        { key: 'hold_start', type: 'date', label: 'Hold start', required: true },
        { key: 'hold_end', type: 'date', label: 'Hold end', required: true },
        { key: 'reason', type: 'select', label: 'Reason', required: true, options: ['Injury', 'Illness', 'Holiday', 'Financial', 'Other'] },
        { key: 'resume_package_id', type: 'package_select', label: 'Package on resume', required: false },
        { key: 'trainer_name', type: 'text', label: 'Trainer name', required: true },
        { key: 'notes', type: 'textarea', label: 'Notes', required: false },
        { key: 'client_signature', type: 'signature', label: 'Client signature', required: false },
        { key: 'trainer_signature', type: 'signature', label: 'Trainer signature', required: false }
      ]
    },
    {
      id: 'consult_questionnaire',
      key: 'consult_questionnaire',
      name: 'Consult questionnaire',
      description: 'Initial consult goals, history and preferences.',
      category: 'Questionnaires',
      status: 'draft'
    },
    {
      id: 'movement_screen',
      key: 'movement_screen',
      name: 'Movement screen',
      description: 'Movement and mobility assessment placeholder.',
      category: 'Questionnaires',
      status: 'draft'
    }
  ];

  const CATEGORY_ORDER = ['Contracts', 'Finance', 'Questionnaires'];

  let state = {
    templates: [],
    currentKey: null,
    currentSubmission: null,
    submissions: []
  };

  function ensureTemplates() {
    const fromOps = window.opsData.formTemplates || [];
    if (fromOps.length) {
      state.templates = fromOps;
      return;
    }
    // If DB is not migrated yet, use the seeded placeholders so the UI still works.
    state.templates = FALLBACK_TEMPLATES.map(function (t, idx) {
      return { ...t, id: t.id || ('placeholder_' + idx) };
    });
  }

  function categories() {
    const map = {};
    state.templates.forEach(function (t) {
      const cat = t.category || 'Other';
      if (!map[cat]) map[cat] = [];
      map[cat].push(t);
    });
    return map;
  }

  function clientById(id) {
    return (window.opsData.clients || []).find(function (c) { return c.id === id; });
  }

  function packageById(id) {
    return (window.opsData.packages || []).find(function (p) { return p.id === id; });
  }

  function renderGallery() {
    const container = document.getElementById('formsWidget');
    const cats = categories();

    let html = '<div class="form-gallery-wrap">';

    CATEGORY_ORDER.forEach(function (cat) {
      const list = cats[cat];
      if (!list || !list.length) return;
      html += '<div class="form-category">' +
        '<h3 class="form-category-title">' + ops.escapeHtml(cat) + '</h3>' +
        '<div class="form-gallery-grid">';

      list.forEach(function (t) {
        const isDraft = t.status === 'draft';
        html += '<div class="form-gallery-card ' + (isDraft ? 'draft' : '') + '">' +
          '<div class="form-card-icon">' +
            '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/></svg>' +
          '</div>' +
          '<div class="form-card-info">' +
            '<div class="form-card-name">' + ops.escapeHtml(t.name) + (isDraft ? ' <span class="tag tag-archived">Coming soon</span>' : '') + '</div>' +
            '<div class="form-card-desc">' + ops.escapeHtml(t.description || '') + '</div>' +
          '</div>' +
          '<div class="form-card-actions">' +
            (isDraft
              ? '<button class="admin-btn" disabled style="opacity:.6">Open</button>'
              : '<button class="admin-btn" onclick="forms.openForm(\'' + ops.escapeHtml(t.key) + '\')">Open form</button>') +
          '</div>' +
        '</div>';
      });

      html += '</div></div>';
    });

    html += '</div>';
    container.innerHTML = html;
  }

  function renderFormBuilder(key) {
    const tmpl = state.templates.find(function (t) { return t.key === key; });
    if (!tmpl) return;
    state.currentKey = key;

    const container = document.getElementById('formsWidget');
    const schema = tmpl.schema || [];

    let html = '<div class="form-builder">' +
      '<div class="form-builder-head">' +
        '<button class="admin-btn" onclick="forms.showGallery()">← Back to forms</button>' +
        '<div class="form-builder-actions">' +
          '<button class="admin-btn" onclick="forms.saveDraft()">Save draft</button>' +
          '<button class="admin-btn" onclick="forms.previewPdf()">Preview PDF</button>' +
          '<button class="submit-btn" onclick="forms.submitForm()">Submit form</button>' +
        '</div>' +
      '</div>' +
      '<div class="card form-builder-card">' +
        '<div class="form-builder-title">' + ops.escapeHtml(tmpl.name) + '</div>' +
        '<p class="hint" style="margin-bottom:22px;">' + ops.escapeHtml(tmpl.description || '') + '</p>' +
        '<form id="businessForm" onsubmit="return false;">' +
          '<input type="hidden" id="formTemplateKey" value="' + ops.escapeHtml(tmpl.key) + '">';

    schema.forEach(function (field, idx) {
      html += '<div class="form-field-row" data-field="' + ops.escapeHtml(field.key) + '">' +
        renderField(field, idx) +
      '</div>';
    });

    html += '</form></div>';

    // PDF preview modal placeholder
    html += '<div class="modal-overlay" id="pdfPreviewModal" onclick="forms.closePdfPreview(event)">' +
      '<div class="modal-card modal-card-wide" onclick="event.stopPropagation()">' +
        '<div class="modal-head">' +
          '<h3>PDF preview</h3>' +
          '<button class="modal-close" onclick="forms.closePdfPreview()" aria-label="Close">×</button>' +
        '</div>' +
        '<div id="pdfPreviewBody"></div>' +
        '<div class="modal-foot">' +
          '<button class="btn-ghost" onclick="forms.closePdfPreview()">Close</button>' +
          '<button class="admin-btn" onclick="forms.downloadPdf()">Download PDF</button>' +
        '</div>' +
      '</div>' +
    '</div>';

    container.innerHTML = html;

    // Pre-fill client if URL has ?client=...
    const params = new URLSearchParams(window.location.search);
    const prefillClient = params.get('client');
    if (prefillClient) {
      const select = document.getElementById('field_client_id');
      if (select) select.value = prefillClient;
    }
  }

  function renderField(field, idx) {
    const id = 'field_' + field.key;
    const requiredAttr = field.required ? ' required' : '';
    let label = '<label class="form-field-label" for="' + id + '">' + ops.escapeHtml(field.label) + (field.required ? ' *' : '') + '</label>';
    let input = '';

    switch (field.type) {
      case 'text':
      case 'email':
      case 'tel':
      case 'number':
      case 'date':
        input = '<input type="' + field.type + '" id="' + id + '" class="form-field-input"' + requiredAttr + attrsString(field.attrs) + '>';
        break;
      case 'textarea':
        input = '<textarea id="' + id + '" class="form-field-input" rows="4"' + requiredAttr + attrsString(field.attrs) + '></textarea>';
        break;
      case 'select':
        input = '<select id="' + id + '" class="form-field-input"' + requiredAttr + '>' +
          '<option value="">Select...</option>' +
          (field.options || []).map(function (o) {
            return '<option value="' + ops.escapeHtml(o) + '">' + ops.escapeHtml(o) + '</option>';
          }).join('') +
        '</select>';
        break;
      case 'client_select':
        input = '<select id="' + id + '" class="form-field-input"' + requiredAttr + '>' +
          '<option value="">Select client...</option>' +
          (window.opsData.clients || []).map(function (c) {
            return '<option value="' + ops.escapeHtml(c.id) + '">' + ops.escapeHtml(c.full_name) + (c.email ? ' · ' + ops.escapeHtml(c.email) : '') + '</option>';
          }).join('') +
        '</select>';
        break;
      case 'package_select':
        input = '<select id="' + id + '" class="form-field-input"' + requiredAttr + '>' +
          '<option value="">Select package...</option>' +
          (window.opsData.packages || []).filter(function (p) { return p.status === 'active'; }).map(function (p) {
            return '<option value="' + ops.escapeHtml(p.id) + '">' + ops.escapeHtml(p.name) + ' · ' + ops.formatCurrency(p.price) + ' · ' + ops.escapeHtml(p.billing_frequency) + '</option>';
          }).join('') +
        '</select>';
        break;
      case 'checkbox':
        input = '<label class="form-checkbox"><input type="checkbox" id="' + id + '"' + requiredAttr + '> ' + ops.escapeHtml(field.label) + '</label>';
        label = '';
        break;
      case 'signature':
        input = '<div class="signature-line"><input type="text" id="' + id + '" class="form-field-input signature-input" placeholder="Type full name to sign"' + requiredAttr + '></div>';
        break;
      default:
        input = '<input type="text" id="' + id + '" class="form-field-input"' + requiredAttr + '>';
    }

    return label + input;
  }

  function attrsString(attrs) {
    if (!attrs) return '';
    return Object.keys(attrs).map(function (k) {
      return ' ' + k + '="' + ops.escapeHtml(String(attrs[k])) + '"';
    }).join('');
  }

  function collectAnswers() {
    const tmpl = state.templates.find(function (t) { return t.key === state.currentKey; });
    if (!tmpl || !tmpl.schema) return {};

    const answers = {};
    tmpl.schema.forEach(function (field) {
      const el = document.getElementById('field_' + field.key);
      if (!el) return;
      if (field.type === 'checkbox') {
        answers[field.key] = el.checked;
      } else if (field.type === 'number') {
        answers[field.key] = parseFloat(el.value) || null;
      } else {
        answers[field.key] = el.value || null;
      }
    });
    return answers;
  }

  function validateAnswers(answers, schema) {
    const missing = [];
    schema.forEach(function (field) {
      if (!field.required) return;
      const val = answers[field.key];
      if (val === null || val === undefined || String(val).trim() === '') {
        missing.push(field.label);
      }
    });
    return missing;
  }

  async function saveDraft() {
    await persistSubmission('draft');
  }

  async function submitForm() {
    const tmpl = state.templates.find(function (t) { return t.key === state.currentKey; });
    const answers = collectAnswers();
    const missing = validateAnswers(answers, tmpl.schema || []);
    if (missing.length) {
      alert('Please complete required fields:\n• ' + missing.join('\n• '));
      return;
    }
    await persistSubmission('submitted');
  }

  async function persistSubmission(status) {
    const tmpl = state.templates.find(function (t) { return t.key === state.currentKey; });
    const answers = collectAnswers();
    const clientId = answers.client_id || null;
    const user = window.opsData.user;

    try {
      const payload = {
        template_id: tmpl.id,
        client_id: clientId,
        status: status,
        answers: answers,
        created_by: user ? user.id : null,
        updated_at: new Date().toISOString()
      };

      let result;
      if (state.currentSubmission && state.currentSubmission.id) {
        result = await client.from('form_submissions')
          .update(payload)
          .eq('id', state.currentSubmission.id)
          .select();
      } else {
        result = await client.from('form_submissions')
          .insert(payload)
          .select();
      }

      if (result.error) throw result.error;
      state.currentSubmission = result.data && result.data[0] ? result.data[0] : state.currentSubmission;
      alert(status === 'submitted' ? 'Form submitted.' : 'Draft saved.');
    } catch (err) {
      alert('Could not save form: ' + err.message);
      console.error(err);
    }
  }

  function previewPdf() {
    const tmpl = state.templates.find(function (t) { return t.key === state.currentKey; });
    const answers = collectAnswers();
    const body = document.getElementById('pdfPreviewBody');
    body.innerHTML = buildPdfHtml(tmpl, answers);
    document.getElementById('pdfPreviewModal').classList.add('show');
  }

  function closePdfPreview(e) {
    if (e && e.target !== e.currentTarget) return;
    document.getElementById('pdfPreviewModal').classList.remove('show');
  }

  function downloadPdf() {
    const tmpl = state.templates.find(function (t) { return t.key === state.currentKey; });
    const answers = collectAnswers();
    const element = document.createElement('div');
    element.innerHTML = buildPdfHtml(tmpl, answers);
    element.className = 'pdf-export';
    document.body.appendChild(element);

    const opt = {
      margin: 12,
      filename: tmpl.key + '_' + new Date().toISOString().slice(0, 10) + '.pdf',
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    html2pdf().set(opt).from(element).save().then(function () {
      element.remove();
    }).catch(function (err) {
      console.error('PDF error:', err);
      alert('Could not generate PDF: ' + err.message);
      element.remove();
    });
  }

  function buildPdfHtml(tmpl, answers) {
    const today = new Date().toLocaleDateString();
    const c = answers.client_id ? clientById(answers.client_id) : null;
    const clientName = c ? c.full_name : (answers.client_id || '-');

    let rows = '';
    (tmpl.schema || []).forEach(function (field) {
      if (field.type === 'client_select') return; // shown in header
      let val = answers[field.key];
      if (field.type === 'package_select' && val) {
        const pkg = packageById(val);
        val = pkg ? pkg.name + ' (' + ops.formatCurrency(pkg.price) + ' ' + pkg.billing_frequency + ')' : val;
      }
      if (val === null || val === undefined || val === '') val = '-';
      rows += '<tr>' +
        '<td class="pdf-label">' + ops.escapeHtml(field.label) + '</td>' +
        '<td class="pdf-value">' + ops.escapeHtml(String(val)) + '</td>' +
      '</tr>';
    });

    return '<div class="pdf-document">' +
      '<div class="pdf-header">' +
        '<div class="pdf-logo">CRF Comps</div>' +
        '<div class="pdf-title">' + ops.escapeHtml(tmpl.name) + '</div>' +
        '<div class="pdf-meta">Date: ' + ops.escapeHtml(today) + ' · Client: ' + ops.escapeHtml(clientName) + '</div>' +
      '</div>' +
      '<table class="pdf-table">' + rows + '</table>' +
      '<div class="pdf-signatures">' +
        '<div class="pdf-sig-block"><div class="pdf-sig-line"></div><div>Client signature / date</div></div>' +
        '<div class="pdf-sig-block"><div class="pdf-sig-line"></div><div>Trainer signature / date</div></div>' +
      '</div>' +
      '<div class="pdf-footer">Generated by CRF Comps · This form is a business record and should be stored securely.</div>' +
    '</div>';
  }

  function showGallery() {
    state.currentKey = null;
    state.currentSubmission = null;
    renderGallery();
  }

  async function loadSubmissions() {
    try {
      const { data, error } = await client.from('form_submissions')
        .select('*, form_templates(name, key)')
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      state.submissions = data || [];
    } catch (err) {
      console.warn('Could not load submissions:', err.message);
      state.submissions = [];
    }
  }

  function renderRecentSubmissions() {
    if (!state.submissions.length) return '';
    let html = '<div class="card" style="margin-top:28px;">' +
      '<h3 style="margin:0 0 16px;">Recent submissions</h3>' +
      '<table class="data-table">' +
        '<thead><tr><th>Form</th><th>Client</th><th>Status</th><th>Date</th></tr></thead><tbody>';
    state.submissions.forEach(function (s) {
      const c = s.client_id ? clientById(s.client_id) : null;
      const name = c ? c.full_name : '-';
      const formName = s.form_templates ? s.form_templates.name : s.template_id;
      html += '<tr>' +
        '<td>' + ops.escapeHtml(formName) + '</td>' +
        '<td>' + ops.escapeHtml(name) + '</td>' +
        '<td><span class="tag ' + (s.status === 'submitted' ? 'tag-active' : 'tag-draft') + '">' + ops.escapeHtml(s.status) + '</span></td>' +
        '<td>' + ops.fmtDateShort(s.created_at) + '</td>' +
      '</tr>';
    });
    html += '</tbody></table></div>';
    return html;
  }

  async function refresh() {
    await ops.loadData();
    ensureTemplates();
    await loadSubmissions();
    if (state.currentKey) {
      renderFormBuilder(state.currentKey);
    } else {
      renderGallery();
      const container = document.getElementById('formsWidget');
      container.insertAdjacentHTML('beforeend', renderRecentSubmissions());
    }
  }

  async function init() {
    await refresh();
  }

  window.forms = {
    init,
    refresh,
    showGallery,
    openForm: renderFormBuilder,
    saveDraft,
    submitForm,
    previewPdf,
    closePdfPreview,
    downloadPdf
  };
})();
