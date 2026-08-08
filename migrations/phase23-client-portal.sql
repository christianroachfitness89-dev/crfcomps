-- Phase 23: Client portal foundation
-- Gives clients a self-service dashboard for sessions, metrics, photos, forms and invoices.
-- Run in the Supabase SQL Editor after deploying the matching frontend code.

-- ---------- clients: link to Supabase auth user ----------

alter table public.clients
  add column if not exists auth_user_id uuid references auth.users on delete set null,
  add column if not exists portal_invited_at timestamptz,
  add column if not exists portal_last_login timestamptz;

create unique index if not exists idx_clients_auth_user_id on public.clients(auth_user_id);
create index if not exists idx_clients_email on public.clients(email);

-- ---------- client notes: selective client visibility ----------

alter table public.client_notes
  add column if not exists visible_to_client boolean not null default false;

-- ---------- client progress metrics ----------

create table if not exists public.client_metrics (
  id uuid default gen_random_uuid() primary key,
  client_id uuid references public.clients on delete cascade not null,
  measured_at date not null default current_date,
  weight_kg numeric,
  body_fat_pct numeric,
  muscle_mass_pct numeric,
  chest_cm numeric,
  waist_cm numeric,
  hips_cm numeric,
  arm_cm numeric,
  thigh_cm numeric,
  notes text,
  created_by uuid references auth.users on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_client_metrics_client_id on public.client_metrics(client_id);
create index if not exists idx_client_metrics_measured_at on public.client_metrics(measured_at desc);

-- ---------- client progress photos ----------

create table if not exists public.client_photos (
  id uuid default gen_random_uuid() primary key,
  client_id uuid references public.clients on delete cascade not null,
  metric_id uuid references public.client_metrics on delete set null,
  photo_url text not null,
  label text not null default 'front',
  taken_at date not null default current_date,
  created_at timestamptz not null default now()
);

create index if not exists idx_client_photos_client_id on public.client_photos(client_id);
create index if not exists idx_client_photos_metric_id on public.client_photos(metric_id);
create index if not exists idx_client_photos_taken_at on public.client_photos(taken_at desc);

-- ---------- per-client portal settings ----------

create table if not exists public.client_portal_settings (
  client_id uuid references public.clients on delete cascade primary key,
  can_book_sessions boolean not null default false,
  can_view_invoices boolean not null default true,
  can_view_metrics boolean not null default true,
  theme text not null default 'light',
  updated_at timestamptz not null default now()
);

-- ---------- helper: current client id from auth session ----------

create or replace function public.current_client_id()
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select id from public.clients where auth_user_id = auth.uid() limit 1;
$$;

-- ---------- enable RLS on new tables ----------

alter table public.client_metrics enable row level security;
alter table public.client_photos enable row level security;
alter table public.client_portal_settings enable row level security;

-- ---------- RLS: clients can manage their own metrics and photos ----------

drop policy if exists "Clients can manage own metrics" on public.client_metrics;
create policy "Clients can manage own metrics"
  on public.client_metrics for all to authenticated
  using (client_id = public.current_client_id())
  with check (client_id = public.current_client_id());

drop policy if exists "Admins can manage client metrics" on public.client_metrics;
create policy "Admins can manage client metrics"
  on public.client_metrics for all to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

drop policy if exists "Clients can manage own photos" on public.client_photos;
create policy "Clients can manage own photos"
  on public.client_photos for all to authenticated
  using (client_id = public.current_client_id())
  with check (client_id = public.current_client_id());

drop policy if exists "Admins can manage client photos" on public.client_photos;
create policy "Admins can manage client photos"
  on public.client_photos for all to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

drop policy if exists "Clients can read own portal settings" on public.client_portal_settings;
create policy "Clients can read own portal settings"
  on public.client_portal_settings for select to authenticated
  using (client_id = public.current_client_id());

drop policy if exists "Admins can manage portal settings" on public.client_portal_settings;
create policy "Admins can manage portal settings"
  on public.client_portal_settings for all to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

-- ---------- RLS: clients can read their own existing data ----------

drop policy if exists "Clients can read own sessions" on public.sessions;
create policy "Clients can read own sessions"
  on public.sessions for select to authenticated
  using (client_id = public.current_client_id());

drop policy if exists "Clients can read own attendance" on public.attendance;
create policy "Clients can read own attendance"
  on public.attendance for select to authenticated
  using (client_id = public.current_client_id());

drop policy if exists "Clients can read own payments" on public.payments;
create policy "Clients can read own payments"
  on public.payments for select to authenticated
  using (client_id = public.current_client_id());

drop policy if exists "Clients can read own invoices" on public.invoices;
create policy "Clients can read own invoices"
  on public.invoices for select to authenticated
  using (client_id = public.current_client_id());

drop policy if exists "Clients can read own form submissions" on public.form_submissions;
create policy "Clients can read own form submissions"
  on public.form_submissions for select to authenticated
  using (client_id = public.current_client_id());

drop policy if exists "Clients can read visible notes" on public.client_notes;
create policy "Clients can read visible notes"
  on public.client_notes for select to authenticated
  using (client_id = public.current_client_id() and visible_to_client = true);

-- ---------- packages: clients can read active packages ----------

drop policy if exists "Clients can read active packages" on public.packages;
create policy "Clients can read active packages"
  on public.packages for select to authenticated
  using (status = 'active');

-- ---------- client_packages: clients can read their own ----------

drop policy if exists "Clients can read own client_packages" on public.client_packages;
create policy "Clients can read own client_packages"
  on public.client_packages for select to authenticated
  using (client_id = public.current_client_id());

-- ---------- clients: clients can read/update own profile ----------

drop policy if exists "Clients can read own client row" on public.clients;
create policy "Clients can read own client row"
  on public.clients for select to authenticated
  using (id = public.current_client_id());

drop policy if exists "Clients can update own client profile" on public.clients;
create policy "Clients can update own client profile"
  on public.clients for update to authenticated
  using (id = public.current_client_id())
  with check (id = public.current_client_id());

-- ---------- note ----------
-- Create a Supabase Storage bucket named 'client-photos' via the Supabase UI.
-- Set it to private. The portal will request signed upload URLs through a server endpoint.
