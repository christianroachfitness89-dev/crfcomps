-- CRF Comps Phase 3: payments + invoices tables
-- Copy this entire block into the Supabase SQL editor and run it.

create table if not exists public.payments (
  id uuid default gen_random_uuid() primary key,
  client_id uuid references public.clients on delete set null,
  amount numeric not null default 0,
  method text not null default 'other',
  reference text,
  stripe_charge_id text,
  paid_at timestamptz not null default now(),
  notes text,
  created_at timestamptz not null default now()
);

alter table public.payments
  add constraint payments_method_check
  check (method in ('cash', 'card', 'transfer', 'stripe', 'paypal', 'other'));

create table if not exists public.invoices (
  id uuid default gen_random_uuid() primary key,
  client_id uuid references public.clients on delete set null,
  amount numeric not null default 0,
  status text not null default 'draft',
  issued_at timestamptz,
  due_at timestamptz,
  paid_at timestamptz,
  description text,
  reference text,
  stripe_invoice_id text,
  stripe_payment_intent_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.invoices
  add constraint invoices_status_check
  check (status in ('draft', 'sent', 'paid', 'overdue', 'cancelled'));

create index if not exists idx_payments_client_id on public.payments(client_id);
create index if not exists idx_payments_paid_at on public.payments(paid_at);
create index if not exists idx_payments_stripe_charge_id on public.payments(stripe_charge_id);
create index if not exists idx_invoices_client_id on public.invoices(client_id);
create index if not exists idx_invoices_status on public.invoices(status);
create index if not exists idx_invoices_due_at on public.invoices(due_at);
create index if not exists idx_invoices_stripe_invoice_id on public.invoices(stripe_invoice_id);

alter table public.payments enable row level security;
alter table public.invoices enable row level security;

drop policy if exists "Admins can manage payments" on public.payments;
create policy "Admins can manage payments"
  on public.payments for all to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

drop policy if exists "Admins can manage invoices" on public.invoices;
create policy "Admins can manage invoices"
  on public.invoices for all to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));
