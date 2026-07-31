-- Phase 11 — Pricing packages table
-- Stores coaching/service packages with price, billing frequency and status.
-- Run in the Supabase SQL Editor after deploying the matching frontend code.

create table if not exists public.packages (
id uuid default gen_random_uuid() primary key,
name text not null,
description text,
price numeric not null default 0,
billing_frequency text not null default 'monthly' check (billing_frequency in ('weekly', 'fortnightly', 'monthly', 'quarterly', 'yearly')),
status text not null default 'active' check (status in ('active', 'archived')),
created_at timestamptz not null default now(),
updated_at timestamptz not null default now()
);

create index if not exists idx_packages_status on public.packages(status);

alter table public.packages enable row level security;

drop policy if exists "Admins can manage packages" on public.packages;

create policy "Admins can manage packages"
on public.packages
for all
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));
