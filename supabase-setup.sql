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
  created_at timestamptz not null default now()
);

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
  paid_at timestamptz not null default now(),
  notes text,
  created_at timestamptz not null default now()
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
create index if not exists idx_invoices_client_id on public.invoices(client_id);
create index if not exists idx_invoices_status on public.invoices(status);
create index if not exists idx_invoices_due_at on public.invoices(due_at);
create index if not exists idx_sessions_client_id on public.sessions(client_id);
create index if not exists idx_sessions_scheduled_at on public.sessions(scheduled_at);
create index if not exists idx_sessions_status on public.sessions(status);
create index if not exists idx_attendance_session_id on public.attendance(session_id);
create index if not exists idx_attendance_client_id on public.attendance(client_id);

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
alter table public.invoices enable row level security;

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

-- ---------- invoice policies ----------

drop policy if exists "Admins can manage invoices" on public.invoices;

create policy "Admins can manage invoices"
  on public.invoices
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

-- ---------- initial admin setup ----------
-- After deploying, create your admin account via login.html, then run:
-- update public.profiles set is_admin = true where id = 'YOUR_USER_ID';
