-- Phase 10 — Weflex payments table
-- Adds manual Weflex remittance tracking so the Finance page can show Stripe + Weflex combined revenue.
-- Run in the Supabase SQL Editor after deploying the matching frontend code.

create table if not exists public.weflex_payments (
  id uuid default gen_random_uuid() primary key,
  paid_at timestamptz not null default now(),
  amount numeric not null default 0,
  remittance_reference text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_weflex_payments_paid_at on public.weflex_payments(paid_at);

alter table public.weflex_payments enable row level security;

drop policy if exists "Admins can manage weflex payments" on public.weflex_payments;

create policy "Admins can manage weflex payments"
  on public.weflex_payments
  for all
  to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));
