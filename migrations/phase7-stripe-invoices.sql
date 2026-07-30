-- CRF Comps Phase 7: Stripe invoice matching columns
-- Adds stripe_invoice_id and stripe_payment_intent_id to invoices for Stripe invoice integration.
-- Run this in the Supabase SQL editor if your invoices table exists.

alter table public.invoices
  add column if not exists reference text,
  add column if not exists stripe_invoice_id text,
  add column if not exists stripe_payment_intent_id text;

create index if not exists idx_invoices_stripe_invoice_id on public.invoices(stripe_invoice_id);

-- Backfill: if an invoice has a Stripe-looking reference (in_...), copy it to stripe_invoice_id.
update public.invoices
set stripe_invoice_id = reference
where reference like 'in_%'
  and stripe_invoice_id is null;
