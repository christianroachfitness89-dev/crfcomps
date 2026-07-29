# CRF Comps database migrations

Run these in order in the Supabase SQL Editor after deploying the matching frontend code.

| Phase | File | Purpose |
|-------|------|---------|
| 1 | `phase1-operations-restructure.sql` | Allow `birthday` lead pool for operations dashboard |
| 2 | `phase2-clients.sql` | Clients and client notes tables |
| 3 | `phase3-payments-invoices.sql` | Payments and invoices tables |
| 4 | `phase4-sessions-attendance.sql` | Sessions and attendance tables |
| 5 | `phase5-communications.sql` | Communications log table |

> `supabase-setup.sql` at the repo root already contains the complete schema. These migration files are for applying changes incrementally to an existing live database.
