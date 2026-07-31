-- Phase 9 — Per-giveaway SMS templates
-- Adds a jsonb array column to public.competitions for storing multiple SMS
-- templates per giveaway. Each entry is { name: text, body: text }.

alter table public.competitions
  add column if not exists sms_templates jsonb not null default '[]'::jsonb;

-- Backfill: leave existing rows as an empty array.
update public.competitions
  set sms_templates = '[]'::jsonb
  where sms_templates is null;
