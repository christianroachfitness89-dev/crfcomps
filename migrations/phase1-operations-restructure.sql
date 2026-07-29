-- CRF Comps Phase 1: operations platform foundation
-- Ensures the leads pool constraint supports birthday leads for the new operations dashboard.

alter table public.leads drop constraint if exists leads_pool_check;
alter table public.leads add constraint leads_pool_check
  check (pool in ('giveaway', 'new_member', 'non_attendance', 'birthday'));
