-- CRF Comps — Supabase schema setup
-- Run this in the Supabase SQL Editor after creating your project.
-- This script is idempotent and can be re-run safely.

-- ---------- tables ----------

-- Admin-only user profiles (entrants are stored in leads, no auth account required).
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text not null,
  full_name text,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

-- Marketing strategies / lead-generation initiatives.
create table if not exists public.marketing_strategies (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  type text not null default 'giveaway' check (type in ('giveaway', 'lead_magnet', 'challenge', 'webinar', 'funnel', 'other')),
  status text not null default 'draft' check (status in ('draft', 'active', 'paused', 'archived')),
  description text,
  starts_at timestamptz,
  ends_at timestamptz,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  sms_template text,
  form_headline text,
  form_subheadline text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Migration: add SMS template column to strategies if created before this update.
alter table public.marketing_strategies
  add column if not exists sms_template text;

-- Competitions / giveaway rounds. Each belongs to a marketing strategy.
create table if not exists public.competitions (
  id uuid default gen_random_uuid() primary key,
  strategy_id uuid references public.marketing_strategies on delete set null,
  name text not null,
  type text not null default 'random_draw' check (type in ('random_draw', 'referral', 'other')),
  status text not null default 'draft' check (status in ('draft', 'active', 'closed', 'archived')),
  starts_at timestamptz,
  ends_at timestamptz,
  prize_value numeric not null default 0,
  prize_main text not null default 'Main giveaway prize',
  prize_runner_up text,
  prize_runner_up_2 text,
  prize_description text,
  prize_main_bullets text,
  prize_runner_up_bullets text,
  prize_runner_up_2_bullets text,
  hero_headline text not null default 'Enter for free.<br><em>Win coaching.</em>',
  hero_subheadline text not null default 'Join the current giveaway for a chance to win coaching prizes. No purchase needed.',
  rules_text text,
  sms_templates jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Migration: add coaching prize columns if they don't exist and drop old cash columns.
alter table public.competitions
  add column if not exists strategy_id uuid references public.marketing_strategies on delete set null,
  add column if not exists prize_value numeric not null default 0,
  add column if not exists prize_main text not null default 'Main giveaway prize',
  add column if not exists prize_runner_up text,
  add column if not exists prize_runner_up_2 text,
  add column if not exists prize_main_bullets text,
  add column if not exists prize_runner_up_bullets text,
  add column if not exists prize_runner_up_2_bullets text;

alter table public.competitions
  drop column if exists prize_pool,
  drop column if exists prize_first_cash,
  drop column if exists prize_second_cash,
  drop column if exists prize_third_cash;

-- Migration: add per-giveaway SMS templates (array of {name, body}).
alter table public.competitions
  add column if not exists sms_templates jsonb not null default '[]'::jsonb;

-- Leads / entries. One row per capture; tagged to a marketing strategy.
create table if not exists public.leads (
  id uuid default gen_random_uuid() primary key,
  strategy_id uuid references public.marketing_strategies on delete set null,
  competition_id uuid references public.competitions on delete cascade,
  full_name text not null,
  email text,
  phone text,
  opt_in boolean not null default true,
  source text,
  tags text[],
  referral_code text unique,
  referred_by uuid references public.leads on delete set null,
  status text not null default 'entered' check (status in ('entered', 'called', 'no_answer', 'sms_sent', 'email_sent', 'follow_up', 'converted', 'not_interested', 'winner', 'runner_up', 'runner_up_2', 'contact_later', 'disqualified')),
  pool text not null default 'giveaway' check (pool in ('giveaway', 'new_member', 'non_attendance', 'birthday')),
  last_contact_at timestamptz,
  birthday date,
  created_at timestamptz not null default now()
);

create index if not exists idx_leads_birthday on public.leads(birthday);

-- Migration: link leads to strategies and add flexible tagging (run after table exists).
alter table public.leads
  add column if not exists strategy_id uuid references public.marketing_strategies on delete set null,
  add column if not exists source text,
  add column if not exists tags text[];

-- Remove old per-competition unique constraint (duplicates allowed per user decision).
alter table public.leads drop constraint if exists leads_competition_id_email_key;

-- Migration: make competition_id and email nullable for strategy-only / bulk-imported leads.
alter table public.leads alter column competition_id drop not null;
alter table public.leads alter column email drop not null;

-- Migration: expand leads status constraint to include outreach pipeline stages.
alter table public.leads drop constraint if exists leads_status_check;
alter table public.leads add constraint leads_status_check
  check (status in ('entered', 'called', 'no_answer', 'sms_sent', 'email_sent', 'follow_up', 'converted', 'not_interested', 'winner', 'runner_up', 'runner_up_2', 'contact_later', 'disqualified'));

-- Migration: add pool column for separating giveaway, new-member and non-attendance leads.
alter table public.leads
  add column if not exists pool text not null default 'giveaway'
  constraint leads_pool_check check (pool in ('giveaway', 'new_member', 'non_attendance', 'birthday'));

-- Migration: add last_contact_at for speed-to-lead tracking.
alter table public.leads add column if not exists last_contact_at timestamptz;

-- Migration: add birthday date column for birthday pool filtering.
alter table public.leads add column if not exists birthday date;
create index if not exists idx_leads_birthday on public.leads(birthday);

-- Backfill existing rows to the giveaway pool if they have no pool set.
update public.leads set pool = 'giveaway' where pool is null or pool = '';

-- Single-row public site settings and fallback content.
create table if not exists public.site_settings (
  id integer primary key default 1 check (id = 1),
  updated_at timestamptz not null default now(),
  brand_name text not null default 'CRF Comps',
  fallback_headline text not null default 'Win big. Enter free.',
  fallback_subheadline text not null default 'A new competition is coming soon.',
  fallback_prize_value numeric not null default 0,
  admin_contact_email text
);

-- Migration: rename old fallback prize pool column if it exists.
alter table public.site_settings
  drop column if exists fallback_prize_pool;

-- Migration: add fallback_prize_value if site_settings was created before this column.
alter table public.site_settings
  add column if not exists fallback_prize_value numeric not null default 0;

-- Clients / members. Many are promoted from a converted lead, but can also be added manually.
create table if not exists public.clients (
  id uuid default gen_random_uuid() primary key,
  lead_id uuid references public.leads on delete set null,
  full_name text not null,
  email text,
  phone text,
  status text not null default 'prospect' check (status in ('prospect', 'active_member', 'paused', 'inactive_member', 'churned', 'former_client')),
  source text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Client notes (one-to-many).
create table if not exists public.client_notes (
  id uuid default gen_random_uuid() primary key,
  client_id uuid references public.clients on delete cascade not null,
  note text not null,
  created_by uuid references auth.users on delete set null,
  created_at timestamptz not null default now()
);

-- Payments received from clients.
create table if not exists public.payments (
  id uuid default gen_random_uuid() primary key,
  client_id uuid references public.clients on delete set null,
  amount numeric not null default 0,
  method text not null default 'other' check (method in ('cash', 'card', 'transfer', 'stripe', 'paypal', 'other')),
  reference text,
  stripe_charge_id text,
  paid_at timestamptz not null default now(),
  notes text,
  created_at timestamptz not null default now()
);

-- Weflex payments (manual entries from remittance documents).
create table if not exists public.weflex_payments (
  id uuid default gen_random_uuid() primary key,
  paid_at timestamptz not null default now(),
  amount numeric not null default 0,
  remittance_reference text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Invoices / billing records.
create table if not exists public.invoices (
  id uuid default gen_random_uuid() primary key,
  client_id uuid references public.clients on delete set null,
  amount numeric not null default 0,
  status text not null default 'draft' check (status in ('draft', 'sent', 'paid', 'overdue', 'cancelled')),
  issued_at timestamptz,
  due_at timestamptz,
  paid_at timestamptz,
  description text,
  reference text,
  stripe_invoice_id text,
  stripe_payment_intent_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Packages / coaching pricing tiers.
create table if not exists public.packages (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  description text,
  price numeric not null default 0,
  billing_frequency text not null default 'monthly' check (billing_frequency in ('weekly', 'fortnightly', 'monthly', 'quarterly', 'yearly')),
  session_amount integer not null default 1 check (session_amount >= 0),
  session_length_minutes integer not null default 30 check (session_length_minutes > 0),
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Client package subscriptions (links clients to packages for CRM session load).
create table if not exists public.client_packages (
  id uuid default gen_random_uuid() primary key,
  client_id uuid references public.clients on delete cascade not null,
  package_id uuid references public.packages on delete set null,
  status text not null default 'active' check (status in ('active', 'paused', 'cancelled')),
  started_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Business form templates and submissions.
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
  status text not null default 'draft' check (status in ('draft', 'submitted', 'signed', 'archived')),
  answers jsonb default '{}'::jsonb,
  pdf_url text,
  pdf_data text,
  created_by uuid references auth.users on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Sessions / scheduled appointments (default: 1-on-1 coaching).
create table if not exists public.sessions (
  id uuid default gen_random_uuid() primary key,
  client_id uuid references public.clients on delete set null,
  title text not null default '1-on-1 coaching',
  scheduled_at timestamptz not null,
  duration_minutes integer not null default 60,
  status text not null default 'scheduled' check (status in ('scheduled', 'completed', 'cancelled', 'no_show')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Attendance records per session.
create table if not exists public.attendance (
  id uuid default gen_random_uuid() primary key,
  session_id uuid references public.sessions on delete cascade not null,
  client_id uuid references public.clients on delete cascade not null,
  status text not null default 'attended' check (status in ('attended', 'late', 'excused', 'absent')),
  notes text,
  created_at timestamptz not null default now()
);

-- Communications log for leads and clients.
create table if not exists public.communications (
  id uuid default gen_random_uuid() primary key,
  lead_id uuid references public.leads on delete cascade,
  client_id uuid references public.clients on delete cascade,
  type text not null default 'sms' check (type in ('sms', 'call', 'email', 'whatsapp', 'in_person', 'note')),
  direction text not null default 'outbound' check (direction in ('inbound', 'outbound')),
  status text not null default 'completed' check (status in ('completed', 'pending', 'failed', 'no_answer')),
  body text,
  created_by uuid references auth.users on delete set null,
  created_at timestamptz not null default now()
);

-- ---------- indexes ----------

create index if not exists idx_leads_strategy_id on public.leads(strategy_id);
create index if not exists idx_leads_competition_id on public.leads(competition_id);
create index if not exists idx_leads_email on public.leads(email);
create index if not exists idx_leads_status on public.leads(status);
create index if not exists idx_leads_source on public.leads(source);
create index if not exists idx_leads_pool on public.leads(pool);
create index if not exists idx_leads_pool_status on public.leads(pool, status);
create index if not exists idx_competitions_status on public.competitions(status);
create index if not exists idx_competitions_strategy_id on public.competitions(strategy_id);
create index if not exists idx_strategies_status on public.marketing_strategies(status);
create index if not exists idx_clients_lead_id on public.clients(lead_id);
create index if not exists idx_clients_status on public.clients(status);
create index if not exists idx_clients_email on public.clients(email);
create index if not exists idx_client_notes_client_id on public.client_notes(client_id);
create index if not exists idx_payments_client_id on public.payments(client_id);
create index if not exists idx_payments_paid_at on public.payments(paid_at);
create index if not exists idx_payments_stripe_charge_id on public.payments(stripe_charge_id);
create index if not exists idx_weflex_payments_paid_at on public.weflex_payments(paid_at);
create index if not exists idx_invoices_client_id on public.invoices(client_id);
create index if not exists idx_invoices_status on public.invoices(status);
create index if not exists idx_invoices_due_at on public.invoices(due_at);
create index if not exists idx_invoices_stripe_invoice_id on public.invoices(stripe_invoice_id);
create index if not exists idx_packages_status on public.packages(status);
create index if not exists idx_client_packages_client_id on public.client_packages(client_id);
create index if not exists idx_client_packages_package_id on public.client_packages(package_id);
create index if not exists idx_client_packages_status on public.client_packages(status);
create index if not exists idx_form_templates_key on public.form_templates(key);
create index if not exists idx_form_templates_status on public.form_templates(status);
create index if not exists idx_form_submissions_template on public.form_submissions(template_id);
create index if not exists idx_form_submissions_client on public.form_submissions(client_id);
create index if not exists idx_form_submissions_status on public.form_submissions(status);
create index if not exists idx_form_submissions_created on public.form_submissions(created_at desc);
create index if not exists idx_sessions_client_id on public.sessions(client_id);
create index if not exists idx_sessions_scheduled_at on public.sessions(scheduled_at);
create index if not exists idx_sessions_status on public.sessions(status);
create index if not exists idx_attendance_session_id on public.attendance(session_id);
create index if not exists idx_attendance_client_id on public.attendance(client_id);
create index if not exists idx_communications_lead_id on public.communications(lead_id);
create index if not exists idx_communications_client_id on public.communications(client_id);
create index if not exists idx_communications_type on public.communications(type);
create index if not exists idx_communications_created_at on public.communications(created_at);

-- ---------- helper function: is the current user an admin? ----------

create or replace function public.is_admin(user_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select coalesce((select is_admin from public.profiles where id = user_id), false);
$$;

-- ---------- RLS enablement ----------

alter table public.profiles enable row level security;
alter table public.marketing_strategies enable row level security;
alter table public.competitions enable row level security;
alter table public.leads enable row level security;
alter table public.site_settings enable row level security;
alter table public.clients enable row level security;
alter table public.client_notes enable row level security;
alter table public.payments enable row level security;
alter table public.weflex_payments enable row level security;
alter table public.invoices enable row level security;
alter table public.packages enable row level security;
alter table public.sessions enable row level security;
alter table public.attendance enable row level security;
alter table public.communications enable row level security;

-- ---------- profile policies ----------

drop policy if exists "Users can read own profile" on public.profiles;
drop policy if exists "Admins can manage profiles" on public.profiles;

create policy "Users can read own profile"
  on public.profiles
  for select
  to authenticated
  using (auth.uid() = id);

create policy "Admins can manage profiles"
  on public.profiles
  for all
  to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

-- ---------- strategy policies ----------

drop policy if exists "Anyone can read active strategies" on public.marketing_strategies;
drop policy if exists "Admins can manage strategies" on public.marketing_strategies;

-- Public visitors can read active strategies for landing pages and forms.
create policy "Anyone can read active strategies"
  on public.marketing_strategies
  for select
  to anon
  using (status = 'active');

-- Authenticated admins can read all strategies and manage them.
create policy "Admins can manage strategies"
  on public.marketing_strategies
  for all
  to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

-- ---------- competition policies ----------

drop policy if exists "Anyone can read active competitions" on public.competitions;
drop policy if exists "Admins can manage competitions" on public.competitions;

-- Public visitors can read active competitions for the landing page.
create policy "Anyone can read active competitions"
  on public.competitions
  for select
  to anon
  using (status = 'active');

-- Authenticated admins can read all competitions and manage them.
create policy "Admins can manage competitions"
  on public.competitions
  for all
  to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

-- ---------- lead policies ----------

drop policy if exists "Anyone can insert a lead" on public.leads;
drop policy if exists "Admins can manage leads" on public.leads;

-- Anonymous visitors can submit an entry into an active strategy.
-- If a competition is provided, that competition must also be active.
create policy "Anyone can insert a lead"
  on public.leads
  for insert
  to anon
  with check (
    exists (
      select 1 from public.marketing_strategies s
      where s.id = strategy_id and s.status = 'active'
    )
    and (
      competition_id is null
      or exists (
        select 1 from public.competitions c
        where c.id = competition_id and c.status = 'active'
      )
    )
  );

-- Only admins can read/update/delete leads.
create policy "Admins can manage leads"
  on public.leads
  for all
  to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

-- ---------- site settings policies ----------

drop policy if exists "Anyone can read site settings" on public.site_settings;
drop policy if exists "Admins can manage site settings" on public.site_settings;

create policy "Anyone can read site settings"
  on public.site_settings
  for select
  to anon
  using (true);

create policy "Admins can manage site settings"
  on public.site_settings
  for all
  to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

-- ---------- client policies ----------

drop policy if exists "Admins can manage clients" on public.clients;

create policy "Admins can manage clients"
  on public.clients
  for all
  to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

-- ---------- client notes policies ----------

drop policy if exists "Admins can manage client notes" on public.client_notes;

create policy "Admins can manage client notes"
  on public.client_notes
  for all
  to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

-- ---------- payment policies ----------

drop policy if exists "Admins can manage payments" on public.payments;

create policy "Admins can manage payments"
  on public.payments
  for all
  to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

-- ---------- weflex payment policies ----------

drop policy if exists "Admins can manage weflex payments" on public.weflex_payments;

create policy "Admins can manage weflex payments"
  on public.weflex_payments
  for all
  to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

-- ---------- invoice policies ----------

drop policy if exists "Admins can manage invoices" on public.invoices;

create policy "Admins can manage invoices"
  on public.invoices
  for all
  to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

-- ---------- package policies ----------

drop policy if exists "Admins can manage packages" on public.packages;

create policy "Admins can manage packages"
  on public.packages
  for all
  to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

-- ---------- client package policies ----------

drop policy if exists "Admins can manage client packages" on public.client_packages;

create policy "Admins can manage client packages"
  on public.client_packages
  for all
  to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

-- ---------- form policies ----------

drop policy if exists "Admins can manage form templates" on public.form_templates;

create policy "Admins can manage form templates"
  on public.form_templates
  for all
  to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

drop policy if exists "Admins can manage form submissions" on public.form_submissions;

create policy "Admins can manage form submissions"
  on public.form_submissions
  for all
  to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

-- ---------- session policies ----------

drop policy if exists "Admins can manage sessions" on public.sessions;

create policy "Admins can manage sessions"
  on public.sessions
  for all
  to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

-- ---------- attendance policies ----------

drop policy if exists "Admins can manage attendance" on public.attendance;

create policy "Admins can manage attendance"
  on public.attendance
  for all
  to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

-- ---------- communication policies ----------

drop policy if exists "Admins can manage communications" on public.communications;

create policy "Admins can manage communications"
  on public.communications
  for all
  to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

-- ---------- trigger: auto-create admin profile on signup ----------

create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name, is_admin)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    coalesce((new.raw_user_meta_data->>'is_admin')::boolean, false)
  )
  on conflict (id) do update set
    email = excluded.email,
    full_name = coalesce(excluded.full_name, profiles.full_name);
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Keep profile email in sync with auth.users.
create or replace function public.handle_user_email_update()
returns trigger as $$
begin
  update public.profiles set email = new.email where id = new.id;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_updated on auth.users;
create or replace trigger on_auth_user_updated
  after update of email on auth.users
  for each row execute function public.handle_user_email_update();

-- ---------- data migration: link existing competitions/leads to a default strategy ----------

-- Create a default strategy for any competitions that don't have one.
insert into public.marketing_strategies (id, name, type, status, description)
values (
  '00000000-0000-0000-0000-000000000001',
  'Legacy Giveaways',
  'giveaway',
  'active',
  'Default strategy for giveaways created before the marketing portal update.'
)
on conflict (id) do nothing;

-- Attach existing competitions to the default strategy if they have none.
update public.competitions
set strategy_id = '00000000-0000-0000-0000-000000000001'
where strategy_id is null;

-- Attach existing leads to the default strategy via their competition.
update public.leads
set strategy_id = '00000000-0000-0000-0000-000000000001'
where strategy_id is null
  and competition_id is not null;

-- ---------- seed data ----------

insert into public.site_settings (id)
values (1)
on conflict (id) do nothing;

-- Seed core business forms. The frontend keeps an identical fallback so it works
-- before/without this seed, but the DB is the source of truth once migrated.
insert into public.form_templates (key, name, description, category, status, schema)
values
  ('new_contract', 'New contract', 'New member training agreement with term, package and signatures.', 'Contracts', 'active',
   '[{"key":"client_id","type":"client_select","label":"Client","required":true},{"key":"start_date","type":"date","label":"Start date","required":true},{"key":"term_weeks","type":"number","label":"Term (weeks)","required":true,"attrs":{"min":1,"step":1}},{"key":"package_id","type":"package_select","label":"Package","required":true},{"key":"weekly_price","type":"number","label":"Weekly price ($)","required":true,"attrs":{"min":0,"step":"0.01"}},{"key":"billing_frequency","type":"select","label":"Billing frequency","required":true,"options":["Weekly","Fortnightly","Monthly"]},{"key":"trainer_name","type":"text","label":"Trainer name","required":true},{"key":"notes","type":"textarea","label":"Notes / special terms","required":false},{"key":"client_signature","type":"signature","label":"Client signature","required":false},{"key":"trainer_signature","type":"signature","label":"Trainer signature","required":false}]'::jsonb),
  ('modify_contract', 'Modify contract', 'Change an existing member''s package, term or billing arrangement.', 'Contracts', 'active',
   '[{"key":"client_id","type":"client_select","label":"Client","required":true},{"key":"current_package","type":"text","label":"Current package","required":true},{"key":"new_package_id","type":"package_select","label":"New package","required":true},{"key":"change_reason","type":"select","label":"Reason for change","required":true,"options":["Upgrade","Downgrade","Injury / hold return","Other"]},{"key":"effective_date","type":"date","label":"Effective date","required":true},{"key":"new_weekly_price","type":"number","label":"New weekly price ($)","required":true,"attrs":{"min":0,"step":"0.01"}},{"key":"trainer_name","type":"text","label":"Trainer name","required":true},{"key":"notes","type":"textarea","label":"Notes","required":false},{"key":"client_signature","type":"signature","label":"Client signature","required":false},{"key":"trainer_signature","type":"signature","label":"Trainer signature","required":false}]'::jsonb),
  ('cancellation', 'Cancellation', 'Member cancellation notice with reason and final session details.', 'Contracts', 'active',
   '[{"key":"client_id","type":"client_select","label":"Client","required":true},{"key":"cancellation_date","type":"date","label":"Cancellation date","required":true},{"key":"last_session_date","type":"date","label":"Last session date","required":true},{"key":"reason","type":"select","label":"Reason","required":true,"options":["Financial","Relocating","Injury / health","Time commitment","Not a fit","Other"]},{"key":"notice_given","type":"select","label":"Notice given","required":true,"options":["Yes - in term","Yes - out of term","No"]},{"key":"refund_required","type":"select","label":"Refund / credit required","required":true,"options":["None","Credit to account","Partial refund","Full refund"]},{"key":"trainer_name","type":"text","label":"Trainer name","required":true},{"key":"notes","type":"textarea","label":"Notes","required":false},{"key":"client_signature","type":"signature","label":"Client signature","required":false},{"key":"trainer_signature","type":"signature","label":"Trainer signature","required":false}]'::jsonb),
  ('dd_hold_form', 'DD hold form', 'Temporarily suspend direct debits and schedule a resume date.', 'Finance', 'active',
   '[{"key":"client_id","type":"client_select","label":"Client","required":true},{"key":"hold_start","type":"date","label":"Hold start","required":true},{"key":"hold_end","type":"date","label":"Hold end","required":true},{"key":"reason","type":"select","label":"Reason","required":true,"options":["Injury","Illness","Holiday","Financial","Other"]},{"key":"resume_package_id","type":"package_select","label":"Package on resume","required":false},{"key":"trainer_name","type":"text","label":"Trainer name","required":true},{"key":"notes","type":"textarea","label":"Notes","required":false},{"key":"client_signature","type":"signature","label":"Client signature","required":false},{"key":"trainer_signature","type":"signature","label":"Trainer signature","required":false}]'::jsonb),
  ('consult_questionnaire', 'Consult questionnaire', 'Initial consult goals, history and preferences.', 'Questionnaires', 'draft', '[]'::jsonb),
  ('movement_screen', 'Movement screen', 'Movement and mobility assessment placeholder.', 'Questionnaires', 'draft', '[]'::jsonb)
on conflict (key) do update set
  name = excluded.name,
  description = excluded.description,
  category = excluded.category,
  status = excluded.status,
  schema = excluded.schema,
  updated_at = now();

-- ---------- initial admin setup ----------
-- After deploying, create your admin account via login.html, then run:
-- update public.profiles set is_admin = true where id = 'YOUR_USER_ID';
