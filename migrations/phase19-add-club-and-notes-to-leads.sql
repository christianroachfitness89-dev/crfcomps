-- Migration: add club and notes columns to leads.
-- Safe to re-run.

alter table public.leads add column if not exists club text;
alter table public.leads add column if not exists notes text;
