-- CRF Comps Phase 5: communications log
-- Copy this entire block into the Supabase SQL editor and run it.

create table if not exists public.communications (
  id uuid default gen_random_uuid() primary key,
  lead_id uuid references public.leads on delete cascade,
  client_id uuid references public.clients on delete cascade,
  type text not null default 'sms',
  direction text not null default 'outbound',
  status text not null default 'completed',
  body text,
  created_by uuid references auth.users on delete set null,
  created_at timestamptz not null default now()
);

alter table public.communications
  add constraint communications_type_check
  check (type in ('sms', 'call', 'email', 'whatsapp', 'in_person', 'note'));

alter table public.communications
  add constraint communications_direction_check
  check (direction in ('inbound', 'outbound'));

alter table public.communications
  add constraint communications_status_check
  check (status in ('completed', 'pending', 'failed', 'no_answer'));

create index if not exists idx_communications_lead_id on public.communications(lead_id);
create index if not exists idx_communications_client_id on public.communications(client_id);
create index if not exists idx_communications_type on public.communications(type);
create index if not exists idx_communications_created_at on public.communications(created_at);

alter table public.communications enable row level security;

drop policy if exists "Admins can manage communications" on public.communications;
create policy "Admins can manage communications"
  on public.communications for all to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));
