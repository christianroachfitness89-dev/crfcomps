-- CRF Comps Phase 4: sessions + attendance tables
-- Copy this entire block into the Supabase SQL editor and run it.

create table if not exists public.sessions (
  id uuid default gen_random_uuid() primary key,
  client_id uuid references public.clients on delete set null,
  title text not null default '1-on-1 coaching',
  scheduled_at timestamptz not null,
  duration_minutes integer not null default 60,
  status text not null default 'scheduled',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.sessions
  add constraint sessions_status_check
  check (status in ('scheduled', 'completed', 'cancelled', 'no_show'));

create table if not exists public.attendance (
  id uuid default gen_random_uuid() primary key,
  session_id uuid references public.sessions on delete cascade not null,
  client_id uuid references public.clients on delete cascade not null,
  status text not null default 'attended',
  notes text,
  created_at timestamptz not null default now()
);

alter table public.attendance
  add constraint attendance_status_check
  check (status in ('attended', 'late', 'excused', 'absent'));

create index if not exists idx_sessions_client_id on public.sessions(client_id);
create index if not exists idx_sessions_scheduled_at on public.sessions(scheduled_at);
create index if not exists idx_sessions_status on public.sessions(status);
create index if not exists idx_attendance_session_id on public.attendance(session_id);
create index if not exists idx_attendance_client_id on public.attendance(client_id);

alter table public.sessions enable row level security;
alter table public.attendance enable row level security;

drop policy if exists "Admins can manage sessions" on public.sessions;
create policy "Admins can manage sessions"
  on public.sessions for all to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

drop policy if exists "Admins can manage attendance" on public.attendance;
create policy "Admins can manage attendance"
  on public.attendance for all to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));
