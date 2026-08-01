-- Phase 13: Business forms
-- Templates for contracts, amendments, cancellations, DD holds and future questionnaires,
-- plus stored form submissions and generated PDF data.

create table if not exists public.form_templates (
  id uuid default gen_random_uuid() primary key,
  key text not null unique,
  name text not null,
  description text,
  category text not null default 'Other',
  status text not null default 'active' check (status in ('active', 'draft', 'archived')),
  schema jsonb default '[]'::jsonb,
  pdf_layout jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.form_submissions (
  id uuid default gen_random_uuid() primary key,
  template_id uuid references public.form_templates on delete set null,
  client_id uuid references public.clients on delete set null,
  lead_id uuid references public.leads on delete set null,
  status text not null default 'draft' check (status in ('draft', 'submitted', 'signed', 'archived')),
  answers jsonb default '{}'::jsonb,
  pdf_url text,
  pdf_data text,
  created_by uuid references auth.users on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_form_templates_key on public.form_templates(key);
create index if not exists idx_form_templates_status on public.form_templates(status);
create index if not exists idx_form_submissions_template on public.form_submissions(template_id);
create index if not exists idx_form_submissions_client on public.form_submissions(client_id);
create index if not exists idx_form_submissions_lead on public.form_submissions(lead_id);
create index if not exists idx_form_submissions_status on public.form_submissions(status);
create index if not exists idx_form_submissions_created on public.form_submissions(created_at desc);

alter table public.form_templates enable row level security;
alter table public.form_submissions enable row level security;

drop policy if exists form_templates_admin_all on public.form_templates;
create policy form_templates_admin_all on public.form_templates
  for all to authenticated using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

drop policy if exists form_submissions_admin_all on public.form_submissions;
create policy form_submissions_admin_all on public.form_submissions
  for all to authenticated using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

-- Migration: add lead_id to form_submissions if it was created before this update.
alter table public.form_submissions
  add column if not exists lead_id uuid references public.leads on delete set null;

-- Seed the four critical operational forms.
-- The app also keeps a matching JS fallback so the UI works before/without this seed.
insert into public.form_templates (key, name, description, category, status, schema)
values
  ('new_contract', 'New contract', 'New member training agreement with term, package and signatures.', 'Contracts', 'active',
   '[
     {"key":"client_id","type":"client_select","label":"Client","required":true},
     {"key":"start_date","type":"date","label":"Start date","required":true},
     {"key":"term_weeks","type":"number","label":"Term (weeks)","required":true,"attrs":{"min":1,"step":1}},
     {"key":"package_id","type":"package_select","label":"Package","required":true},
     {"key":"weekly_price","type":"number","label":"Weekly price ($)","required":true,"attrs":{"min":0,"step":"0.01"}},
     {"key":"billing_frequency","type":"select","label":"Billing frequency","required":true,"options":["Weekly","Fortnightly","Monthly"]},
     {"key":"trainer_name","type":"text","label":"Trainer name","required":true},
     {"key":"notes","type":"textarea","label":"Notes / special terms","required":false},
     {"key":"client_signature","type":"signature","label":"Client signature","required":false},
     {"key":"trainer_signature","type":"signature","label":"Trainer signature","required":false}
   ]'::jsonb),
  ('modify_contract', 'Modify contract', 'Change an existing member''s package, term or billing arrangement.', 'Contracts', 'active',
   '[
     {"key":"client_id","type":"client_select","label":"Client","required":true},
     {"key":"current_package","type":"text","label":"Current package","required":true},
     {"key":"new_package_id","type":"package_select","label":"New package","required":true},
     {"key":"change_reason","type":"select","label":"Reason for change","required":true,"options":["Upgrade","Downgrade","Injury / hold return","Other"]},
     {"key":"effective_date","type":"date","label":"Effective date","required":true},
     {"key":"new_weekly_price","type":"number","label":"New weekly price ($)","required":true,"attrs":{"min":0,"step":"0.01"}},
     {"key":"trainer_name","type":"text","label":"Trainer name","required":true},
     {"key":"notes","type":"textarea","label":"Notes","required":false},
     {"key":"client_signature","type":"signature","label":"Client signature","required":false},
     {"key":"trainer_signature","type":"signature","label":"Trainer signature","required":false}
   ]'::jsonb),
  ('cancellation', 'Cancellation', 'Member cancellation notice with reason and final session details.', 'Contracts', 'active',
   '[
     {"key":"client_id","type":"client_select","label":"Client","required":true},
     {"key":"cancellation_date","type":"date","label":"Cancellation date","required":true},
     {"key":"last_session_date","type":"date","label":"Last session date","required":true},
     {"key":"reason","type":"select","label":"Reason","required":true,"options":["Financial","Relocating","Injury / health","Time commitment","Not a fit","Other"]},
     {"key":"notice_given","type":"select","label":"Notice given","required":true,"options":["Yes - in term","Yes - out of term","No"]},
     {"key":"refund_required","type":"select","label":"Refund / credit required","required":true,"options":["None","Credit to account","Partial refund","Full refund"]},
     {"key":"trainer_name","type":"text","label":"Trainer name","required":true},
     {"key":"notes","type":"textarea","label":"Notes","required":false},
     {"key":"client_signature","type":"signature","label":"Client signature","required":false},
     {"key":"trainer_signature","type":"signature","label":"Trainer signature","required":false}
   ]'::jsonb),
  ('dd_hold_form', 'DD hold form', 'Temporarily suspend direct debits and schedule a resume date.', 'Finance', 'active',
   '[
     {"key":"client_id","type":"client_select","label":"Client","required":true},
     {"key":"hold_start","type":"date","label":"Hold start","required":true},
     {"key":"hold_end","type":"date","label":"Hold end","required":true},
     {"key":"reason","type":"select","label":"Reason","required":true,"options":["Injury","Illness","Holiday","Financial","Other"]},
     {"key":"resume_package_id","type":"package_select","label":"Package on resume","required":false},
     {"key":"trainer_name","type":"text","label":"Trainer name","required":true},
     {"key":"notes","type":"textarea","label":"Notes","required":false},
     {"key":"client_signature","type":"signature","label":"Client signature","required":false},
     {"key":"trainer_signature","type":"signature","label":"Trainer signature","required":false}
   ]'::jsonb),
  ('consult_questionnaire', 'Consult questionnaire', 'Initial consult goals, history and preferences.', 'Questionnaires', 'draft', '[]'::jsonb),
  ('movement_screen', 'Movement screen', 'Movement and mobility assessment placeholder.', 'Questionnaires', 'draft', '[]'::jsonb)
on conflict (key) do update set
  name = excluded.name,
  description = excluded.description,
  category = excluded.category,
  status = excluded.status,
  schema = excluded.schema,
  updated_at = now();
