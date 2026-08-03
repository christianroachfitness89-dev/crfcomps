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
  type text not null default 'giveaway' check (type in ('giveaway', 'lead_magnet', 'challenge', 'webinar', 'funnel', 'flawless_feedback', 'other')),
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
  voucher_value numeric not null default 100,
  booking_url text,
  booking_url_2 text,
  booking_label text,
  booking_label_2 text,
  survey_questions jsonb default '[]'::jsonb,
  closing_script text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Migration: add SMS template column to strategies if created before this update.
alter table public.marketing_strategies
  add column if not exists sms_template text;

-- Migration: add Flawless Feedback columns to strategies if they don't exist.
alter table public.marketing_strategies
  add column if not exists voucher_value numeric not null default 100,
  add column if not exists booking_url text,
  add column if not exists booking_url_2 text,
  add column if not exists booking_label text,
  add column if not exists booking_label_2 text,
  add column if not exists survey_questions jsonb default '[]'::jsonb,
  add column if not exists closing_script text;

-- Migration: expand type enum to include flawless_feedback.
alter table public.marketing_strategies drop constraint if exists marketing_strategies_type_check;
alter table public.marketing_strategies add constraint marketing_strategies_type_check
  check (type in ('giveaway', 'lead_magnet', 'challenge', 'webinar', 'funnel', 'flawless_feedback', 'other'));

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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
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

-- Migration: add updated_at column for lead status updates.
alter table public.leads add column if not exists updated_at timestamptz not null default now();

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
  lead_id uuid references public.leads on delete set null,
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
  ('new_contract', 'New contract', 'Client training agreement, payment terms and T&Cs.', 'Contracts', 'active', '[{"key":"client_id","type":"client_select","label":"Client","required":true},{"key":"start_date","type":"date","label":"Agreement start date","required":true},{"key":"session_length_minutes","type":"number","label":"Session length (minutes)","required":true,"attrs":{"min":1,"step":1}},{"key":"sessions_per_week","type":"number","label":"Sessions per week","required":true,"attrs":{"min":1,"step":1}},{"key":"weekly_rate","type":"number","label":"Weekly training fee ($)","required":true,"attrs":{"min":0,"step":"0.01"}},{"key":"billing_frequency","type":"select","label":"Billing frequency","required":true,"options":["Weekly","Fortnightly","Monthly"]},{"key":"initial_setup_fee","type":"number","label":"Initial setup fee ($)","required":true,"attrs":{"min":0,"step":"0.01"}},{"key":"termination_fee","type":"number","label":"Contract termination fee ($)","required":true,"attrs":{"min":0,"step":"0.01"}},{"key":"cooling_off_days","type":"number","label":"Cooling-off period (days)","required":true,"attrs":{"min":0,"step":1}},{"key":"trainer_name","type":"text","label":"Trainer name","required":true},{"key":"agreed_to_terms","type":"checkbox","label":"I have read and understood the agreement and terms & conditions","required":true},{"key":"client_signature","type":"signature","label":"Client signature","required":false},{"key":"trainer_signature","type":"signature","label":"Trainer signature","required":false}]'::jsonb),
  ('modify_contract', 'Modify contract', 'Change an existing member''s package, billing or term.', 'Contracts', 'active', '[{"key":"client_id","type":"client_select","label":"Client","required":true},{"key":"current_package","type":"text","label":"Current package","required":true},{"key":"new_package_id","type":"package_select","label":"New package","required":true},{"key":"change_reason","type":"select","label":"Reason for change","required":true,"options":["Upgrade","Downgrade","Add sessions","Reduce sessions","Billing change","Injury / hold return","Other"]},{"key":"effective_date","type":"date","label":"Effective date","required":true},{"key":"new_weekly_price","type":"number","label":"New weekly price ($)","required":true,"attrs":{"min":0,"step":"0.01"}},{"key":"trainer_name","type":"text","label":"Trainer name","required":true},{"key":"notes","type":"textarea","label":"Notes / special terms","required":false},{"key":"client_signature","type":"signature","label":"Client signature","required":false},{"key":"trainer_signature","type":"signature","label":"Trainer signature","required":false}]'::jsonb),
  ('cancellation', 'Cancellation / DD stop', 'Direct-debit cancellation request and final payment details.', 'Contracts', 'active', '[{"key":"client_id","type":"client_select","label":"Client","required":true},{"key":"client_email","type":"email","label":"Client email","required":true},{"key":"client_phone","type":"tel","label":"Client phone","required":true},{"key":"trainer_name","type":"text","label":"Trainer name","required":true},{"key":"club_name","type":"text","label":"Club / location","required":true},{"key":"stop_debits_date","type":"date","label":"Stop all future debits from","required":true},{"key":"amount_per_cycle","type":"number","label":"Amount per cycle ($)","required":true,"attrs":{"min":0,"step":"0.01"}},{"key":"billing_cycle","type":"select","label":"Billing cycle","required":true,"options":["Weekly","Fortnightly"]},{"key":"final_payment_date","type":"date","label":"Final payment date","required":true},{"key":"outstanding_payments","type":"radio","label":"Are there any outstanding payments?","required":true,"options":["Yes","No"]},{"key":"proceed_with_cancellation","type":"radio","label":"Proceed with cancellation","required":true,"options":["Yes - all payments settled","No - payment required first"]},{"key":"progress_photos_taken","type":"radio","label":"Progress photos taken","required":true,"options":["Yes","No"]},{"key":"progress_photos_why","type":"textarea","label":"If progress photos not taken, why?","required":false},{"key":"feedback","type":"textarea","label":"Feedback on how we can add more value","required":false},{"key":"client_signature","type":"signature","label":"Client signature","required":false},{"key":"trainer_signature","type":"signature","label":"Trainer signature","required":false}]'::jsonb),
  ('dd_hold_form', 'DD hold form', 'Temporarily suspend direct debits and preserve paid sessions.', 'Finance', 'active', '[{"key":"client_id","type":"client_select","label":"Client","required":true},{"key":"hold_start","type":"date","label":"Hold start","required":true},{"key":"hold_end","type":"date","label":"Hold end","required":true},{"key":"reason","type":"select","label":"Reason","required":true,"options":["Injury","Illness","Holiday","Financial","Other"]},{"key":"weekly_freeze_fee","type":"number","label":"Weekly freeze fee ($)","required":true,"attrs":{"min":0,"step":"0.01"}},{"key":"sessions_preserved","type":"checkbox","label":"Paid sessions are preserved and remain available for use within the agreed timeframe","required":true},{"key":"trainer_name","type":"text","label":"Trainer name","required":true},{"key":"notes","type":"textarea","label":"Notes","required":false},{"key":"client_signature","type":"signature","label":"Client signature","required":false},{"key":"trainer_signature","type":"signature","label":"Trainer signature","required":false}]'::jsonb),
  ('consult_questionnaire', 'Consult questionnaire', 'Initial consult goals, health history, 5 Whys, identity/vision and commitment.', 'Questionnaires', 'active', '[{"key":"static_intro","type":"static","label":"The Deep Why & Goal Discovery Form","content":"Please complete this form honestly. Your answers help us build a program that fits your goals, history and lifestyle.","required":false},{"key":"lead_id","type":"lead_select","label":"Prospect","required":true},{"key":"form_date","type":"date","label":"Date","required":true},{"key":"dob","type":"date","label":"Date of birth","required":true},{"key":"email","type":"email","label":"Email","required":true},{"key":"mobile","type":"tel","label":"Mobile","required":true},{"key":"occupation","type":"text","label":"Occupation","required":false},{"key":"static_health","type":"static","label":"Health status","content":"Have you ever experienced any of the following? Tick all that apply.","required":false},{"key":"health_conditions","type":"checkbox_group","label":"Health conditions / history","required":false,"options":["Heart trouble","High blood pressure","Chest pains","Epilepsy","Back problems","Sports injury","Arthritis or joint pain","Asthma","Dizzy spells or fainting"]},{"key":"health_conditions_other","type":"text","label":"Other health condition","required":false},{"key":"postmenopausal","type":"radio","label":"Postmenopausal","required":false,"options":["Yes","No"]},{"key":"diabetic","type":"radio","label":"Diabetic","required":false,"options":["Yes","No"]},{"key":"joint_problems","type":"radio","label":"Do you have any joint problems, aches or pains we should be aware of?","required":false,"options":["Yes","No"]},{"key":"joint_problems_details","type":"textarea","label":"If yes, how does it affect your day-to-day life?","required":false},{"key":"smoker","type":"radio","label":"Do you smoke?","required":false,"options":["Yes","No"]},{"key":"want_quit_smoking","type":"radio","label":"If yes, do you want to quit?","required":false,"options":["Yes","No"]},{"key":"smoking_why","type":"textarea","label":"If yes, why?","required":false},{"key":"drink_alcohol","type":"radio","label":"Do you drink alcohol?","required":false,"options":["Yes","No"]},{"key":"alcohol_frequency","type":"text","label":"If yes, how frequently do you drink?","required":false},{"key":"pregnant","type":"radio","label":"Are you pregnant?","required":false,"options":["Yes","No"]},{"key":"due_date","type":"date","label":"If yes, when are you due?","required":false},{"key":"prescription_medication","type":"radio","label":"Do you take any prescription medication?","required":false,"options":["Yes","No"]},{"key":"medication_details","type":"textarea","label":"If yes, please specify","required":false},{"key":"static_goals","type":"static","label":"Goals","content":"What is the No.1 goal you are looking to achieve and accomplish?","required":false},{"key":"primary_goal","type":"textarea","label":"Primary goal","required":true},{"key":"static_5whys","type":"static","label":"The 5 Whys","content":"Peeling back the layers to find your real why. Use the client''s exact words.","required":false},{"key":"why_1","type":"textarea","label":"Why #1: Why is that goal important to you?","required":false},{"key":"why_2","type":"textarea","label":"Why #2: And why does that matter to you?","required":false},{"key":"why_3","type":"textarea","label":"Why #3: Why is that significant in your life right now?","required":false},{"key":"why_4","type":"textarea","label":"Why #4: What would that really give you, deep down?","required":false},{"key":"why_5","type":"textarea","label":"Why #5: And ultimately, why does THAT matter more than anything?","required":false},{"key":"core_why","type":"textarea","label":"Their Core Why (in their own words)","required":false},{"key":"static_identity","type":"static","label":"Identity & Vision","content":"Who do you want to become?","required":false},{"key":"best_version_12m","type":"textarea","label":"When you close your eyes and picture the best version of yourself 12 months from now — who is that person?","required":false},{"key":"daily_differences","type":"textarea","label":"What does that version of you do differently on a daily basis?","required":false},{"key":"future_self_message","type":"textarea","label":"If the best version of you could send a message back right now, what would they say?","required":false},{"key":"static_pain","type":"static","label":"Pain vs Vision","content":"What are you running from and toward? Be honest.","required":false},{"key":"current_frustration","type":"textarea","label":"What frustrates you MOST about where you are right now?","required":false},{"key":"impact_on_life","type":"textarea","label":"How does your current situation affect your confidence, energy, relationships or daily life?","required":false},{"key":"feeling_if_no_change","type":"textarea","label":"If absolutely NOTHING changes in the next 12 months, how does that honestly make you feel?","required":false},{"key":"goal_unlock","type":"textarea","label":"What would achieving this goal unlock for you in your life that you don''t currently have?","required":false},{"key":"impact_on_loved_ones","type":"textarea","label":"How would it change the way you show up for the people you love?","required":false},{"key":"achievement_feeling","type":"textarea","label":"Imagine you''ve achieved everything. What does it FEEL like?","required":false},{"key":"static_investment","type":"static","label":"Investment & Commitment","content":"This goal deserves your time, energy and resources.","required":false},{"key":"thinking_about_action","type":"textarea","label":"How long have you been thinking about taking action towards this goal?","required":false},{"key":"previous_barriers","type":"textarea","label":"What has stopped you from achieving this before now? Be brutally honest.","required":false},{"key":"two_hours_available","type":"radio","label":"If your goal could be achieved with only 2 hours per week, would you have the time?","required":false,"options":["Yes","No"]},{"key":"goal_priority","type":"radio","label":"You''ve said staying the same is not an option — this goal is a priority, correct?","required":false,"options":["Yes","No"]},{"key":"weekly_disposable_income","type":"number","label":"What amount per week are you prepared to allocate towards achieving your goals?","required":false,"attrs":{"min":0,"step":"0.01"}},{"key":"seeks_guidance","type":"radio","label":"99% of people with goals seek education and accountability. Are you the same?","required":false,"options":["Yes","No"]},{"key":"different_this_time","type":"textarea","label":"What will be different THIS time?","required":false},{"key":"deep_why_connection","type":"number","label":"How emotionally connected are you to your Deep Why? (1 = Not at all / 10 = It moves me)","required":false,"attrs":{"min":1,"max":10,"step":1}},{"key":"readiness","type":"number","label":"How ready are you to do what it takes, even on the hard days? (1 = Not ready / 10 = Absolutely)","required":false,"attrs":{"min":1,"max":10,"step":1}},{"key":"static_statement","type":"static","label":"Your Deep Why Statement","content":"I am committed to [goal/transformation] because [deep why / core emotion] and I refuse to stay [pain point] because I deserve to feel [vision / identity / emotion].","required":false},{"key":"deep_why_statement","type":"textarea","label":"Their Deep Why Statement","required":false},{"key":"confirm_accuracy","type":"checkbox","label":"I confirm the above information is true and accurate","required":true},{"key":"client_signature","type":"signature","label":"Client signature","required":false},{"key":"client_name_printed","type":"text","label":"Name (printed)","required":false},{"key":"trainer_signature","type":"signature","label":"Trainer signature","required":false}]'::jsonb),
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
