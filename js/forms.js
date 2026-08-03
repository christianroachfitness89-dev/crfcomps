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
    "id": "new_contract",
    "key": "new_contract",
    "name": "New contract",
    "description": "Client training agreement, payment terms and T&Cs.",
    "category": "Contracts",
    "status": "active",
    "schema": [
      {
        "key": "client_id",
        "type": "client_select",
        "label": "Client",
        "required": true
      },
      {
        "key": "start_date",
        "type": "date",
        "label": "Agreement start date",
        "required": true
      },
      {
        "key": "session_length_minutes",
        "type": "number",
        "label": "Session length (minutes)",
        "required": true,
        "attrs": {
          "min": 1,
          "step": 1
        }
      },
      {
        "key": "sessions_per_week",
        "type": "number",
        "label": "Sessions per week",
        "required": true,
        "attrs": {
          "min": 1,
          "step": 1
        }
      },
      {
        "key": "weekly_rate",
        "type": "number",
        "label": "Weekly training fee ($)",
        "required": true,
        "attrs": {
          "min": 0,
          "step": "0.01"
        }
      },
      {
        "key": "billing_frequency",
        "type": "select",
        "label": "Billing frequency",
        "required": true,
        "options": [
          "Weekly",
          "Fortnightly",
          "Monthly"
        ]
      },
      {
        "key": "initial_setup_fee",
        "type": "number",
        "label": "Initial setup fee ($)",
        "required": true,
        "attrs": {
          "min": 0,
          "step": "0.01"
        }
      },
      {
        "key": "termination_fee",
        "type": "number",
        "label": "Contract termination fee ($)",
        "required": true,
        "attrs": {
          "min": 0,
          "step": "0.01"
        }
      },
      {
        "key": "cooling_off_days",
        "type": "number",
        "label": "Cooling-off period (days)",
        "required": true,
        "attrs": {
          "min": 0,
          "step": 1
        }
      },
      {
        "key": "trainer_name",
        "type": "text",
        "label": "Trainer name",
        "required": true
      },
      {
        "key": "agreed_to_terms",
        "type": "checkbox",
        "label": "I have read and understood the agreement and terms & conditions",
        "required": true
      },
      {
        "key": "client_signature",
        "type": "signature",
        "label": "Client signature",
        "required": false
      },
      {
        "key": "trainer_signature",
        "type": "signature",
        "label": "Trainer signature",
        "required": false
      }
    ]
  },
  {
    "id": "modify_contract",
    "key": "modify_contract",
    "name": "Modify contract",
    "description": "Change an existing member's package, billing or term.",
    "category": "Contracts",
    "status": "active",
    "schema": [
      {
        "key": "client_id",
        "type": "client_select",
        "label": "Client",
        "required": true
      },
      {
        "key": "current_package",
        "type": "text",
        "label": "Current package",
        "required": true
      },
      {
        "key": "new_package_id",
        "type": "package_select",
        "label": "New package",
        "required": true
      },
      {
        "key": "change_reason",
        "type": "select",
        "label": "Reason for change",
        "required": true,
        "options": [
          "Upgrade",
          "Downgrade",
          "Add sessions",
          "Reduce sessions",
          "Billing change",
          "Injury / hold return",
          "Other"
        ]
      },
      {
        "key": "effective_date",
        "type": "date",
        "label": "Effective date",
        "required": true
      },
      {
        "key": "new_weekly_price",
        "type": "number",
        "label": "New weekly price ($)",
        "required": true,
        "attrs": {
          "min": 0,
          "step": "0.01"
        }
      },
      {
        "key": "trainer_name",
        "type": "text",
        "label": "Trainer name",
        "required": true
      },
      {
        "key": "notes",
        "type": "textarea",
        "label": "Notes / special terms",
        "required": false
      },
      {
        "key": "client_signature",
        "type": "signature",
        "label": "Client signature",
        "required": false
      },
      {
        "key": "trainer_signature",
        "type": "signature",
        "label": "Trainer signature",
        "required": false
      }
    ]
  },
  {
    "id": "cancellation",
    "key": "cancellation",
    "name": "Cancellation / DD stop",
    "description": "Direct-debit cancellation request and final payment details.",
    "category": "Contracts",
    "status": "active",
    "schema": [
      {
        "key": "client_id",
        "type": "client_select",
        "label": "Client",
        "required": true
      },
      {
        "key": "client_email",
        "type": "email",
        "label": "Client email",
        "required": true
      },
      {
        "key": "client_phone",
        "type": "tel",
        "label": "Client phone",
        "required": true
      },
      {
        "key": "trainer_name",
        "type": "text",
        "label": "Trainer name",
        "required": true
      },
      {
        "key": "club_name",
        "type": "text",
        "label": "Club / location",
        "required": true
      },
      {
        "key": "stop_debits_date",
        "type": "date",
        "label": "Stop all future debits from",
        "required": true
      },
      {
        "key": "amount_per_cycle",
        "type": "number",
        "label": "Amount per cycle ($)",
        "required": true,
        "attrs": {
          "min": 0,
          "step": "0.01"
        }
      },
      {
        "key": "billing_cycle",
        "type": "select",
        "label": "Billing cycle",
        "required": true,
        "options": [
          "Weekly",
          "Fortnightly"
        ]
      },
      {
        "key": "final_payment_date",
        "type": "date",
        "label": "Final payment date",
        "required": true
      },
      {
        "key": "outstanding_payments",
        "type": "radio",
        "label": "Are there any outstanding payments?",
        "required": true,
        "options": [
          "Yes",
          "No"
        ]
      },
      {
        "key": "proceed_with_cancellation",
        "type": "radio",
        "label": "Proceed with cancellation",
        "required": true,
        "options": [
          "Yes - all payments settled",
          "No - payment required first"
        ]
      },
      {
        "key": "progress_photos_taken",
        "type": "radio",
        "label": "Progress photos taken",
        "required": true,
        "options": [
          "Yes",
          "No"
        ]
      },
      {
        "key": "progress_photos_why",
        "type": "textarea",
        "label": "If progress photos not taken, why?",
        "required": false
      },
      {
        "key": "feedback",
        "type": "textarea",
        "label": "Feedback on how we can add more value",
        "required": false
      },
      {
        "key": "client_signature",
        "type": "signature",
        "label": "Client signature",
        "required": false
      },
      {
        "key": "trainer_signature",
        "type": "signature",
        "label": "Trainer signature",
        "required": false
      }
    ]
  },
  {
    "id": "dd_hold_form",
    "key": "dd_hold_form",
    "name": "DD hold form",
    "description": "Temporarily suspend direct debits and preserve paid sessions.",
    "category": "Finance",
    "status": "active",
    "schema": [
      {
        "key": "client_id",
        "type": "client_select",
        "label": "Client",
        "required": true
      },
      {
        "key": "hold_start",
        "type": "date",
        "label": "Hold start",
        "required": true
      },
      {
        "key": "hold_end",
        "type": "date",
        "label": "Hold end",
        "required": true
      },
      {
        "key": "reason",
        "type": "select",
        "label": "Reason",
        "required": true,
        "options": [
          "Injury",
          "Illness",
          "Holiday",
          "Financial",
          "Other"
        ]
      },
      {
        "key": "weekly_freeze_fee",
        "type": "number",
        "label": "Weekly freeze fee ($)",
        "required": true,
        "attrs": {
          "min": 0,
          "step": "0.01"
        }
      },
      {
        "key": "sessions_preserved",
        "type": "checkbox",
        "label": "Paid sessions are preserved and remain available for use within the agreed timeframe",
        "required": true
      },
      {
        "key": "trainer_name",
        "type": "text",
        "label": "Trainer name",
        "required": true
      },
      {
        "key": "notes",
        "type": "textarea",
        "label": "Notes",
        "required": false
      },
      {
        "key": "client_signature",
        "type": "signature",
        "label": "Client signature",
        "required": false
      },
      {
        "key": "trainer_signature",
        "type": "signature",
        "label": "Trainer signature",
        "required": false
      }
    ]
  },
  {
    "id": "consult_questionnaire",
    "key": "consult_questionnaire",
    "name": "Consult questionnaire",
    "description": "Initial consult goals, health history, 5 Whys, identity/vision and commitment.",
    "category": "Questionnaires",
    "status": "active",
    "schema": [
      {
        "key": "static_intro",
        "type": "static",
        "label": "The Deep Why & Goal Discovery Form",
        "content": "Please complete this form honestly. Your answers help us build a program that fits your goals, history and lifestyle.",
        "required": false
      },
      {
        "key": "lead_id",
        "type": "lead_select",
        "label": "Prospect",
        "required": true
      },
      {
        "key": "form_date",
        "type": "date",
        "label": "Date",
        "required": true
      },
      {
        "key": "dob",
        "type": "date",
        "label": "Date of birth",
        "required": true
      },
      {
        "key": "email",
        "type": "email",
        "label": "Email",
        "required": true
      },
      {
        "key": "mobile",
        "type": "tel",
        "label": "Mobile",
        "required": true
      },
      {
        "key": "occupation",
        "type": "text",
        "label": "Occupation",
        "required": false
      },
      {
        "key": "static_health",
        "type": "static",
        "label": "Health status",
        "content": "Have you ever experienced any of the following? Tick all that apply.",
        "required": false
      },
      {
        "key": "health_conditions",
        "type": "checkbox_group",
        "label": "Health conditions / history",
        "required": false,
        "options": [
          "Heart trouble",
          "High blood pressure",
          "Chest pains",
          "Epilepsy",
          "Back problems",
          "Sports injury",
          "Arthritis or joint pain",
          "Asthma",
          "Dizzy spells or fainting"
        ]
      },
      {
        "key": "health_conditions_other",
        "type": "text",
        "label": "Other health condition",
        "required": false
      },
      {
        "key": "postmenopausal",
        "type": "radio",
        "label": "Postmenopausal",
        "required": false,
        "options": [
          "Yes",
          "No"
        ]
      },
      {
        "key": "diabetic",
        "type": "radio",
        "label": "Diabetic",
        "required": false,
        "options": [
          "Yes",
          "No"
        ]
      },
      {
        "key": "joint_problems",
        "type": "radio",
        "label": "Do you have any joint problems, aches or pains we should be aware of?",
        "required": false,
        "options": [
          "Yes",
          "No"
        ]
      },
      {
        "key": "joint_problems_details",
        "type": "textarea",
        "label": "If yes, how does it affect your day-to-day life?",
        "required": false
      },
      {
        "key": "smoker",
        "type": "radio",
        "label": "Do you smoke?",
        "required": false,
        "options": [
          "Yes",
          "No"
        ]
      },
      {
        "key": "want_quit_smoking",
        "type": "radio",
        "label": "If yes, do you want to quit?",
        "required": false,
        "options": [
          "Yes",
          "No"
        ]
      },
      {
        "key": "smoking_why",
        "type": "textarea",
        "label": "If yes, why?",
        "required": false
      },
      {
        "key": "drink_alcohol",
        "type": "radio",
        "label": "Do you drink alcohol?",
        "required": false,
        "options": [
          "Yes",
          "No"
        ]
      },
      {
        "key": "alcohol_frequency",
        "type": "text",
        "label": "If yes, how frequently do you drink?",
        "required": false
      },
      {
        "key": "pregnant",
        "type": "radio",
        "label": "Are you pregnant?",
        "required": false,
        "options": [
          "Yes",
          "No"
        ]
      },
      {
        "key": "due_date",
        "type": "date",
        "label": "If yes, when are you due?",
        "required": false
      },
      {
        "key": "prescription_medication",
        "type": "radio",
        "label": "Do you take any prescription medication?",
        "required": false,
        "options": [
          "Yes",
          "No"
        ]
      },
      {
        "key": "medication_details",
        "type": "textarea",
        "label": "If yes, please specify",
        "required": false
      },
      {
        "key": "static_goals",
        "type": "static",
        "label": "Goals",
        "content": "What is the No.1 goal you are looking to achieve and accomplish?",
        "required": false
      },
      {
        "key": "primary_goal",
        "type": "textarea",
        "label": "Primary goal",
        "required": true
      },
      {
        "key": "static_5whys",
        "type": "static",
        "label": "The 5 Whys",
        "content": "Peeling back the layers to find your real why. Use the client's exact words.",
        "required": false
      },
      {
        "key": "why_1",
        "type": "textarea",
        "label": "Why #1: Why is that goal important to you?",
        "required": false
      },
      {
        "key": "why_2",
        "type": "textarea",
        "label": "Why #2: And why does that matter to you?",
        "required": false
      },
      {
        "key": "why_3",
        "type": "textarea",
        "label": "Why #3: Why is that significant in your life right now?",
        "required": false
      },
      {
        "key": "why_4",
        "type": "textarea",
        "label": "Why #4: What would that really give you, deep down?",
        "required": false
      },
      {
        "key": "why_5",
        "type": "textarea",
        "label": "Why #5: And ultimately, why does THAT matter more than anything?",
        "required": false
      },
      {
        "key": "core_why",
        "type": "textarea",
        "label": "Their Core Why (in their own words)",
        "required": false
      },
      {
        "key": "static_identity",
        "type": "static",
        "label": "Identity & Vision",
        "content": "Who do you want to become?",
        "required": false
      },
      {
        "key": "best_version_12m",
        "type": "textarea",
        "label": "When you close your eyes and picture the best version of yourself 12 months from now — who is that person?",
        "required": false
      },
      {
        "key": "daily_differences",
        "type": "textarea",
        "label": "What does that version of you do differently on a daily basis?",
        "required": false
      },
      {
        "key": "future_self_message",
        "type": "textarea",
        "label": "If the best version of you could send a message back right now, what would they say?",
        "required": false
      },
      {
        "key": "static_pain",
        "type": "static",
        "label": "Pain vs Vision",
        "content": "What are you running from and toward? Be honest.",
        "required": false
      },
      {
        "key": "current_frustration",
        "type": "textarea",
        "label": "What frustrates you MOST about where you are right now?",
        "required": false
      },
      {
        "key": "impact_on_life",
        "type": "textarea",
        "label": "How does your current situation affect your confidence, energy, relationships or daily life?",
        "required": false
      },
      {
        "key": "feeling_if_no_change",
        "type": "textarea",
        "label": "If absolutely NOTHING changes in the next 12 months, how does that honestly make you feel?",
        "required": false
      },
      {
        "key": "goal_unlock",
        "type": "textarea",
        "label": "What would achieving this goal unlock for you in your life that you don't currently have?",
        "required": false
      },
      {
        "key": "impact_on_loved_ones",
        "type": "textarea",
        "label": "How would it change the way you show up for the people you love?",
        "required": false
      },
      {
        "key": "achievement_feeling",
        "type": "textarea",
        "label": "Imagine you've achieved everything. What does it FEEL like?",
        "required": false
      },
      {
        "key": "static_investment",
        "type": "static",
        "label": "Investment & Commitment",
        "content": "This goal deserves your time, energy and resources.",
        "required": false
      },
      {
        "key": "thinking_about_action",
        "type": "textarea",
        "label": "How long have you been thinking about taking action towards this goal?",
        "required": false
      },
      {
        "key": "previous_barriers",
        "type": "textarea",
        "label": "What has stopped you from achieving this before now? Be brutally honest.",
        "required": false
      },
      {
        "key": "two_hours_available",
        "type": "radio",
        "label": "If your goal could be achieved with only 2 hours per week, would you have the time?",
        "required": false,
        "options": [
          "Yes",
          "No"
        ]
      },
      {
        "key": "goal_priority",
        "type": "radio",
        "label": "You've said staying the same is not an option — this goal is a priority, correct?",
        "required": false,
        "options": [
          "Yes",
          "No"
        ]
      },
      {
        "key": "weekly_disposable_income",
        "type": "number",
        "label": "What amount per week are you prepared to allocate towards achieving your goals?",
        "required": false,
        "attrs": {
          "min": 0,
          "step": "0.01"
        }
      },
      {
        "key": "seeks_guidance",
        "type": "radio",
        "label": "99% of people with goals seek education and accountability. Are you the same?",
        "required": false,
        "options": [
          "Yes",
          "No"
        ]
      },
      {
        "key": "different_this_time",
        "type": "textarea",
        "label": "What will be different THIS time?",
        "required": false
      },
      {
        "key": "deep_why_connection",
        "type": "number",
        "label": "How emotionally connected are you to your Deep Why? (1 = Not at all / 10 = It moves me)",
        "required": false,
        "attrs": {
          "min": 1,
          "max": 10,
          "step": 1
        }
      },
      {
        "key": "readiness",
        "type": "number",
        "label": "How ready are you to do what it takes, even on the hard days? (1 = Not ready / 10 = Absolutely)",
        "required": false,
        "attrs": {
          "min": 1,
          "max": 10,
          "step": 1
        }
      },
      {
        "key": "static_statement",
        "type": "static",
        "label": "Your Deep Why Statement",
        "content": "I am committed to [goal/transformation] because [deep why / core emotion] and I refuse to stay [pain point] because I deserve to feel [vision / identity / emotion].",
        "required": false
      },
      {
        "key": "deep_why_statement",
        "type": "textarea",
        "label": "Their Deep Why Statement",
        "required": false
      },
      {
        "key": "confirm_accuracy",
        "type": "checkbox",
        "label": "I confirm the above information is true and accurate",
        "required": true
      },
      {
        "key": "client_signature",
        "type": "signature",
        "label": "Client signature",
        "required": false
      },
      {
        "key": "client_name_printed",
        "type": "text",
        "label": "Name (printed)",
        "required": false
      },
      {
        "key": "trainer_signature",
        "type": "signature",
        "label": "Trainer signature",
        "required": false
      }
    ]
  },
  {
    "id": "movement_screen",
    "key": "movement_screen",
    "name": "Movement screen",
    "description": "Movement and mobility assessment placeholder.",
    "category": "Questionnaires",
    "status": "draft",
    "schema": []
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

  function leadById(id) {
    return (window.opsData.leads || []).find(function (l) { return l.id === id; });
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
              : '<button class="admin-btn" onclick="window.forms.openForm(\'' + ops.escapeHtml(t.key) + '\')">Open form</button>') +
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
        '<button class="admin-btn" onclick="window.forms.showGallery()">← Back to forms</button>' +
        '<div class="form-builder-actions">' +
          '<button class="admin-btn" onclick="window.forms.saveDraft()">Save draft</button>' +
          '<button class="admin-btn" onclick="window.forms.previewPdf()">Preview PDF</button>' +
          '<button class="submit-btn" onclick="window.forms.submitForm()">Submit form</button>' +
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
    html += '<div class="modal-overlay" id="pdfPreviewModal" onclick="window.forms.closePdfPreview(event)">' +
      '<div class="modal-card modal-card-wide" onclick="event.stopPropagation()">' +
        '<div class="modal-head">' +
          '<h3>PDF preview</h3>' +
          '<button class="modal-close" onclick="window.forms.closePdfPreview()" aria-label="Close">×</button>' +
        '</div>' +
        '<div id="pdfPreviewBody"></div>' +
        '<div class="modal-foot">' +
          '<button class="btn-ghost" onclick="window.forms.closePdfPreview()">Close</button>' +
          '<button class="admin-btn" onclick="window.forms.downloadPdf()">Download PDF</button>' +
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
    const prefillLead = params.get('lead');
    if (prefillLead) {
      const select = document.getElementById('field_lead_id');
      if (select) select.value = prefillLead;
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
      case 'lead_select':
        input = '<select id="' + id + '" class="form-field-input"' + requiredAttr + '>' +
          '<option value="">Select prospect...</option>' +
          (window.opsData.leads || []).map(function (l) {
            return '<option value="' + ops.escapeHtml(l.id) + '">' + ops.escapeHtml(l.full_name) + (l.email ? ' · ' + ops.escapeHtml(l.email) : '') + '</option>';
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
      case 'static':
        input = '<div class="form-static-block"><strong>' + ops.escapeHtml(field.label || '') + '</strong>' +
          (field.content ? '<p>' + ops.escapeHtml(field.content) + '</p>' : '') + '</div>';
        label = '';
        break;
      case 'checkbox_group':
        input = '<div class="form-checkbox-group">' +
          (field.options || []).map(function (o, i) {
            return '<label class="form-checkbox"><input type="checkbox" name="' + ops.escapeHtml(field.key) + '" value="' + ops.escapeHtml(o) + '" id="' + id + '_' + i + '"> ' + ops.escapeHtml(o) + '</label>';
          }).join('') +
        '</div>';
        break;
      case 'radio':
        input = '<div class="form-radio-group">' +
          (field.options || []).map(function (o, i) {
            return '<label class="form-radio"><input type="radio" name="' + ops.escapeHtml(field.key) + '" value="' + ops.escapeHtml(o) + '" id="' + id + '_' + i + '"' + requiredAttr + '> ' + ops.escapeHtml(o) + '</label>';
          }).join('') +
        '</div>';
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
      if (field.type === 'checkbox') {
        const el = document.getElementById('field_' + field.key);
        answers[field.key] = el ? el.checked : false;
      } else if (field.type === 'checkbox_group') {
        const checked = Array.from(document.querySelectorAll('input[name="' + field.key + '"]:checked'));
        answers[field.key] = checked.map(function (c) { return c.value; });
      } else if (field.type === 'radio') {
        const selected = document.querySelector('input[name="' + field.key + '"]:checked');
        answers[field.key] = selected ? selected.value : null;
      } else if (field.type === 'number') {
        const el = document.getElementById('field_' + field.key);
        answers[field.key] = el ? (parseFloat(el.value) || null) : null;
      } else if (field.type === 'static') {
        answers[field.key] = null;
      } else {
        const el = document.getElementById('field_' + field.key);
        answers[field.key] = el ? (el.value || null) : null;
      }
    });
    return answers;
  }

  function validateAnswers(answers, schema) {
    const missing = [];
    schema.forEach(function (field) {
      if (!field.required || field.type === 'static') return;
      const val = answers[field.key];
      if (field.type === 'checkbox') {
        if (!val) missing.push(field.label);
      } else if (field.type === 'checkbox_group') {
        if (!Array.isArray(val) || !val.length) missing.push(field.label);
      } else if (val === null || val === undefined || String(val).trim() === '') {
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
    const leadId = answers.lead_id || null;
    const user = window.opsData.user;

    try {
      const payload = {
        template_id: tmpl.id,
        client_id: clientId,
        lead_id: leadId,
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
    const html = buildPdfHtml(tmpl, answers);
    const wrapper = document.createElement('div');
    wrapper.innerHTML = html;
    wrapper.style.position = 'absolute';
    wrapper.style.left = '0';
    wrapper.style.top = '0';
    wrapper.style.width = '794px';
    wrapper.style.minHeight = '1123px';
    wrapper.style.background = '#fff';
    wrapper.style.zIndex = '-1000';
    document.body.appendChild(wrapper);

    const opt = {
      margin: 0,
      filename: tmpl.key + '_' + new Date().toISOString().slice(0, 10) + '.pdf',
      image: { type: 'jpeg', quality: 1 },
      html2canvas: { scale: 2, useCORS: true, scrollY: 0, windowWidth: 794 },
      jsPDF: { unit: 'px', format: [794, 1123], orientation: 'portrait' }
    };

    html2pdf().set(opt).from(wrapper).save().then(function () {
      wrapper.remove();
    }).catch(function (err) {
      console.error('PDF error:', err);
      alert('Could not generate PDF: ' + err.message);
      wrapper.remove();
    });
  }

  function buildPdfHtml(tmpl, answers) {
    const today = new Date().toLocaleDateString();
    let entityName = '-';
    if (answers.client_id) {
      const c = clientById(answers.client_id);
      entityName = c ? c.full_name : answers.client_id;
    } else if (answers.lead_id) {
      const l = leadById(answers.lead_id);
      entityName = l ? l.full_name : answers.lead_id;
    }

    let rows = '';
    (tmpl.schema || []).forEach(function (field) {
      if (field.type === 'client_select' || field.type === 'lead_select' || field.type === 'static') return; // shown in header or layout only
      let val = answers[field.key];
      if (field.type === 'checkbox') val = val ? 'Yes' : 'No';
      if (field.type === 'checkbox_group' && Array.isArray(val)) val = val.join(', ');
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
        '<div class="pdf-meta">Date: ' + ops.escapeHtml(today) + ' · Client / Prospect: ' + ops.escapeHtml(entityName) + '</div>' +
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
        '<thead><tr><th>Form</th><th>Client / Prospect</th><th>Status</th><th>Date</th></tr></thead><tbody>';
    state.submissions.forEach(function (s) {
      let name = '-';
      if (s.client_id) {
        const c = clientById(s.client_id);
        name = c ? c.full_name : '-';
      } else if (s.lead_id) {
        const l = leadById(s.lead_id);
        name = l ? l.full_name : '-';
      }
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
