-- Phase 21: Presentation events for the Mind & Body Transformation page

-- Audit trail: every view and package-interest click against a lead.
create table if not exists public.presentation_events (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.leads(id) on delete cascade,
  event text not null check (event in ('viewed', 'interested')),
  package text check (package in ('gold', 'silver')),
  created_at timestamp with time zone default now()
);

create index if not exists idx_presentation_events_lead_id on public.presentation_events(lead_id);
create index if not exists idx_presentation_events_created_at on public.presentation_events(created_at);

-- Derived columns on leads so the admin panel can show presentation status at a glance.
do $$
begin
  if not exists (select 1 from information_schema.columns where table_name = 'leads' and column_name = 'presentation_event') then
    alter table public.leads add column presentation_event text;
  end if;
  if not exists (select 1 from information_schema.columns where table_name = 'leads' and column_name = 'presentation_package') then
    alter table public.leads add column presentation_package text;
  end if;
  if not exists (select 1 from information_schema.columns where table_name = 'leads' and column_name = 'presentation_at') then
    alter table public.leads add column presentation_at timestamp with time zone;
  end if;
end
$$;
