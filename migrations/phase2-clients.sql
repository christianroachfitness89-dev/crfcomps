-- CRF Comps Phase 2: clients + client_notes tables
-- Copy this entire block into the Supabase SQL editor and run it.

create table if not exists public.clients (
  id uuid default gen_random_uuid() primary key,
  lead_id uuid references public.leads on delete set null,
  full_name text not null,
  email text,
  phone text,
  status text not null default 'prospect',
  source text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.clients
  add constraint clients_status_check
  check (status in ('prospect', 'active_member', 'paused', 'inactive_member', 'churned', 'former_client'));

create table if not exists public.client_notes (
  id uuid default gen_random_uuid() primary key,
  client_id uuid references public.clients on delete cascade not null,
  note text not null,
  created_by uuid references auth.users on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_clients_lead_id on public.clients(lead_id);
create index if not exists idx_clients_status on public.clients(status);
create index if not exists idx_clients_email on public.clients(email);
create index if not exists idx_client_notes_client_id on public.client_notes(client_id);

alter table public.clients enable row level security;
alter table public.client_notes enable row level security;

drop policy if exists "Admins can manage clients" on public.clients;
create policy "Admins can manage clients"
  on public.clients for all to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

drop policy if exists "Admins can manage client notes" on public.client_notes;
create policy "Admins can manage client notes"
  on public.client_notes for all to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));
