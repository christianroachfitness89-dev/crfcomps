-- CRF Comps Phase 6: Stripe integration columns
-- Adds stripe_charge_id to payments so we can match Stripe charges against local records.
-- Run this in the Supabase SQL editor if your payments table exists.

alter table public.payments
  add column if not exists stripe_charge_id text;

create index if not exists idx_payments_stripe_charge_id on public.payments(stripe_charge_id);

-- Backfill: if a payment was made with method 'stripe' and the reference looks like a Stripe charge ID (ch_...),
-- copy it into stripe_charge_id so matching works immediately.
update public.payments
set stripe_charge_id = reference
where method = 'stripe'
  and reference like 'ch_%'
  and stripe_charge_id is null;
