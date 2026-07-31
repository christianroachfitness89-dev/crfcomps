-- Phase 12 — Package session fields and client package links
-- Adds session amount/length to packages and a client_packages linking table
-- so CRM can reflect each client's weekly session load.
-- Run in the Supabase SQL Editor after deploying the matching frontend code.

-- Add session details to packages.
alter table public.packages
  add column if not exists session_amount integer not null default 1 check (session_amount >= 0),
  add column if not exists session_length_minutes integer not null default 30 check (session_length_minutes > 0);

-- Link clients to the packages they are on.
create table if not exists public.client_packages (
  id uuid default gen_random_uuid() primary key,
  client_id uuid references public.clients on delete cascade not null,
  package_id uuid references public.packages on delete set null,
  status text not null default 'active' check (status in ('active', 'paused', 'cancelled')),
  started_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_client_packages_client_id on public.client_packages(client_id);
create index if not exists idx_client_packages_package_id on public.client_packages(package_id);
create index if not exists idx_client_packages_status on public.client_packages(status);

alter table public.client_packages enable row level security;

drop policy if exists "Admins can manage client packages" on public.client_packages;

create policy "Admins can manage client packages"
  on public.client_packages
  for all
  to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));
