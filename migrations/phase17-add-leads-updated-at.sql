-- Migration: add updated_at column to leads.
-- The promote lead flow and other updates rely on this column.

alter table public.leads add column if not exists updated_at timestamptz not null default now();
