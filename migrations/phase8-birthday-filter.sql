-- CRF Comps Phase 8: Birthday today filter
-- Adds a dedicated birthday date column to leads so the Birthday Leads pool
-- can be filtered by today's date and display each prospect's birthday.

alter table public.leads
  add column if not exists birthday date;

create index if not exists idx_leads_birthday on public.leads(birthday);

-- Backfill birthday from existing tags (birthday:YYYY-MM-DD or dob:YYYY-MM-DD).
update public.leads
set birthday = to_date(
  regexp_replace(
    coalesce(
      (select tag from unnest(tags) as tag where tag ilike 'birthday:%'),
      (select tag from unnest(tags) as tag where tag ilike 'dob:%')
    ),
    '^.*:', ''
  ),
  'YYYY-MM-DD'
)
where birthday is null
  and tags is not null
  and exists (
    select 1 from unnest(tags) as tag
    where tag ~* '^(birthday|dob):[0-9]{4}-[0-9]{2}-[0-9]{2}$'
  );
