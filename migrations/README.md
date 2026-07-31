# CRF Comps database migrations

Run these in order in the Supabase SQL Editor after deploying the matching frontend code.

| Phase | File | Purpose |
|-------|------|---------|
| 1 | `phase1-operations-restructure.sql` | Allow `birthday` lead pool for operations dashboard |
| 2 | `phase2-clients.sql` | Clients and client notes tables |
| 3 | `phase3-payments-invoices.sql` | Payments and invoices tables (updated with `stripe_charge_id`) |
| 4 | `phase4-sessions-attendance.sql` | Sessions and attendance tables |
| 5 | `phase5-communications.sql` | Communications log table |
| 6 | `phase6-stripe-integration.sql` | Add `stripe_charge_id` to payments for Stripe matching |
| 7 | `phase7-stripe-invoices.sql` | Add `stripe_invoice_id` and `stripe_payment_intent_id` to invoices for Stripe invoice matching |
| 8 | `phase8-birthday-filter.sql` | Add `birthday` date column to leads and backfill from tags for birthday-today filtering |
| 9 | `phase9-competition-sms-templates.sql` | Add `sms_templates` jsonb column to competitions for multiple per-giveaway SMS templates |
| 10 | `phase10-weflex-payments.sql` | Add `weflex_payments` table for manual remittance entries and combined revenue reporting |
| 11 | `phase11-packages.sql` | Add `packages` table for pricing tiers and package-based sales targets |
| 12 | `phase12-package-sessions.sql` | Add `session_amount` / `session_length_minutes` to packages and `client_packages` linking table for CRM session-load tracking |

> `supabase-setup.sql` at the repo root already contains the complete schema. These migration files are for applying changes incrementally to an existing live database.
