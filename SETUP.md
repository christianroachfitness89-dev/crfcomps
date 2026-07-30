# CRF Comps — Deployment Setup Guide

This guide walks you through getting the lead-generation giveaway site live with Supabase (database + auth) and Vercel (hosting).

## What you need

- A free [Supabase](https://supabase.com) account
- A free [Vercel](https://vercel.com) account
- About 20 minutes

---

## Step 1: Create a Supabase project

1. Go to [supabase.com](https://supabase.com) and sign in.
2. Click **New Project**.
3. Give it a name like `crf-comps` and choose a region close to your audience.
4. Save the generated **Project URL** and **anon public API key** — you will paste them into the code in Step 3.

---

## Step 2: Set up the database

1. In Supabase, open the **SQL Editor**.
2. Create a **New query**.
3. Copy the entire contents of `supabase-setup.sql` from this folder and paste it in.
4. Click **Run**.

This creates:
- `competitions` table — each giveaway round with status, dates, coaching prizes and hero copy
- `leads` table — free entries linked to a giveaway
- `profiles` table — admin users only
- `site_settings` table — single-row fallback content and brand name
- `clients` table — members and prospects promoted from leads or added manually
- `client_notes` table — notes attached to each client
- `payments` table — payments received from clients
- `invoices` table — invoices / billing records
- `sessions` table — scheduled 1-on-1 coaching appointments
- `attendance` table — attendance records per session
- `communications` table — log of calls, SMS, email, WhatsApp, in-person and notes for leads and clients
- Row Level Security policies (public can submit leads into active giveaways; only admins can manage everything)
- Triggers that keep the admin profile row in sync with auth.users

> For existing databases, run the phase migration files in `migrations/` in order instead of re-running the full setup script.

---

## Step 3: Paste your Supabase credentials into the code

1. Open `js/supabase-client.js`.
2. Replace:
   - `https://YOUR_PROJECT_ID.supabase.co` with your Supabase **Project URL**
   - `YOUR_SUPABASE_ANON_KEY` with your Supabase **anon public API key**
3. Save the file.

> Never paste your service-role key into the frontend. Only the anon key belongs in `supabase-client.js`.

---

## Step 4: Configure Supabase Auth

1. In Supabase, go to **Authentication > Providers**.
2. Make sure **Email** is enabled.
3. For faster testing, go to **Authentication > Providers > Email** and turn **Confirm email** OFF.
4. For production, turn it back on and configure SMTP under **Authentication > SMTP**.

---

## Step 5: Deploy to Vercel

1. Log in to [Vercel](https://vercel.com).
2. Click **Add New... > Project**.
3. Import this project folder (or drag and drop it).
4. Vercel will detect a static site. Click **Deploy**.
5. Once deployed, note your site URL (e.g. `https://crf-comps-abc123.vercel.app`).

> If you do not connect a Git repo, future updates require a manual redeploy by dragging the folder again.

---

## Step 6: Make yourself an admin

1. Visit your live site at `https://YOUR_SITE.vercel.app/login.html`.
2. Sign up with your admin email and password. (This is the only way to create the auth user.)
3. In Supabase, open **Table Editor > profiles**.
4. Find your row and change `is_admin` to `true`.
5. Now when you log in and visit `admin.html`, the admin panel will load.

---

## Step 7: Create and activate your first giveaway

1. Log in to the admin panel at `admin.html`.
2. Go to the **Giveaways** tab.
3. Fill in the form:
   - Name, type, start/end dates
   - Main giveaway prize (e.g. "8 weeks of 1:1 coaching")
   - Optional runner-up prize and second runner-up prize
   - Optional total prize value
   - Optional hero headline, subheadline and rules text
4. Click **Create Giveaway**.
5. In the list, click **Activate**. This closes any other active giveaway automatically.
6. Visit the homepage — the active giveaway details and entry form will appear.

---

## Step 8: Test the entry flow

1. Visit your live homepage.
2. Fill in the free entry form with a test name, email and phone.
3. Submit. You should see the "You're in" confirmation.
4. In the admin panel, go to the **Leads** tab.
5. Confirm the test entry appears. Use **Export CSV** to download the list.

---

## Running giveaways

| Action | How |
|--------|-----|
| Open a new round | Create a giveaway and click **Activate**. |
| Close entries | Click **Close** on the active giveaway. |
| Archive | Click **Archive** once a giveaway is fully finished. |
| Pick a winner | Go to **Giveaway Leads**, filter, then click **Pick Winner**. |
| Export leads | Use **Export CSV** on any lead pool page. |
| Update brand/copy | Use the **Settings** page. |
| Manage prospects | Use **New Member Leads**, **Non-Attendance Leads** or **Birthday Leads**. |
| Bulk SMS with delay | Use **Bulk SMS** on any lead pool page to queue messages with a delay. |

---

## Common issues

### "Supabase credentials are still placeholders"

You forgot to update `js/supabase-client.js`. The site will not connect until you do.

### Admin page redirects to the homepage

Your profile row has `is_admin = false`. Update it in Supabase.

### Duplicate entry error

The same email can only enter once per active giveaway round. This is enforced by the database.

### No active giveaway on the homepage

Create a giveaway and set its status to **active**. Only one giveaway can be active at a time.

---

## Lead pools

The admin panel now separates leads into four pools so you can move fast on different types of prospects:

| Pool | Use case | How to add leads |
|------|----------|------------------|
| **Giveaway Leads** | Free entries from the public giveaway form. | Public homepage form. |
| **New Member Leads** | Prospects who have not yet joined. | Bulk upload CSV/Excel. |
| **Non-Attendance Leads** | Members who have not attended for ~30 days. | Bulk upload CSV/Excel. |
| **Birthday Leads** | Members with birthdays in a given month. | Bulk upload CSV/Excel and pick the month from the dropdown. |

Each pool has its own page, filters, call/SMS actions and status pipeline. Uploading on a pool page sends the leads to that pool automatically.

---

## Operations platform

`admin.html` is the Operations Overview dashboard. Each department now has its own page:

| Page | What it covers |
|------|----------------|
| `admin.html` | Operations dashboard with KPIs across all departments |
| `marketing.html` | Lead pools, strategies, giveaways, settings |
| `crm.html` | Clients, prospects, pipeline, notes |
| `finance.html` | Payments, invoices, revenue, outstanding balances |
| `sessions.html` | 1-on-1 schedule and attendance |
| `integrations.html` | Connected platforms (Stripe, Calendly, etc.) |

All department pages share the same grouped sidebar and auth via `js/operations.js`.

---

## Dashboard insights

The **Dashboard** shows:
- **Total leads** and new leads this week
- **Converted leads**
- **Active clients**
- **Revenue this month**
- **Outstanding** invoices
- **Upcoming sessions** and sessions this week
- **Attendance this week**
- **Communications this week**
- **Live integrations** — Stripe revenue and recent payments

---

## External integrations

Connect platforms you already use so live data appears on the Operations dashboard and Finance page.

### 1. Add environment variables in Vercel

Go to your project **Settings > Environment Variables** and add:

| Variable | Where to get it | Required for |
|---|---|---|
| `SUPABASE_URL` | Same value used in `js/supabase-client.js` | Verifying admin sessions in API functions |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase dashboard **Project Settings > API > service_role key** | Server-side admin auth |
| `STRIPE_SECRET_KEY` | Stripe dashboard **Developers > API keys > Secret key** | Live payments and revenue |
| `CALENDLY_PERSONAL_TOKEN` | Calendly **Integrations > API & Webhooks > Personal Access Token** | Upcoming bookings (future) |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Google Cloud service account key JSON (see below) | Google Calendar upcoming events |
| `GOOGLE_CALENDAR_ID` | Calendar ID to read (defaults to `primary`) | Google Calendar target calendar |

**Security:** These keys live only in Vercel. They are never sent to the browser or committed to the repo.

### Google Calendar setup

1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new project (or select an existing one).
3. Enable the **Google Calendar API**:
   - **APIs & Services > Library > Google Calendar API > Enable**.
4. Create a service account:
   - **IAM & Admin & Service Accounts > Create**
   - Give it any name, e.g. `crf-comps-calendar`.
   - Create a key for it and download the JSON file.
5. Open the downloaded JSON file and copy the entire contents.
6. In Vercel, add an environment variable:
   - Name: `GOOGLE_SERVICE_ACCOUNT_JSON`
   - Value: the full JSON contents from the downloaded file.
7. Share your Google Calendar with the service account email:
   - Find `client_email` inside the JSON (it looks like `crf-comps-calendar@your-project.iam.gserviceaccount.com`).
   - In Google Calendar, click the **three dots** next to your calendar → **Settings and sharing**.
   - Under **Share with specific people**, add the service account email.
   - Give it **Make changes to events** permission (or at least **See all event details**).
8. (Optional) Add `GOOGLE_CALENDAR_ID` if you want to read a specific calendar instead of your primary one.
   - Use the calendar ID shown in Google Calendar settings (e.g. `your.email@gmail.com` or a long string for shared calendars).

### 2. Install server dependencies

Run once after pulling the repo:

```bash
npm install
```

This installs the small set of Node packages used by the Vercel functions in `api/`.

### 3. Redeploy

```bash
vercel --prod
```

### 4. Check the dashboard

- Open `admin.html` — a **Live integrations** section shows Stripe revenue/outstanding totals and recent invoices, plus an **Upcoming schedule** section from Google Calendar.
- Open `finance.html` — a **Stripe invoices** card appears above the payments table. Use the month/year filters to pull the period you want, and switch between **All invoices** and **Outstanding only**.
- Open `integrations.html` — see status, totals and controls for every connected app.

### 5. Match Stripe invoices to local records

Stripe invoices now link to your Supabase `invoices` and `payments` tables automatically:

- If a Stripe invoice ID (starts with `in_`) is stored in a local invoice's `stripe_invoice_id` or `reference` field, it is shown as **Matched in Supabase**.
- If a Stripe payment intent is stored in a local payment's `stripe_payment_intent_id` field, it is shown as matched against that payment.
- Everything else appears as **Outstanding**.

To manually match an outstanding Stripe invoice, go to `finance.html` → **Invoices** → **Add invoice**, set the amount and issued date to match the Stripe invoice, and paste the Stripe invoice ID (starts with `in_`) into the **Reference** field. The next refresh will mark it as matched.

Likewise, when manually recording a Stripe payment, paste the Stripe charge ID (starts with `ch_`) into the **Reference** field to mark the associated charge as matched.

---

## Custom domains (optional)

1. In Vercel, go to your project **Settings > Domains**.
2. Add your custom domain and follow the DNS instructions.
3. Update your Supabase Auth **Site URL** under **Authentication > URL Configuration** to match your custom domain.

---

## Migrations for live databases

If you already have a live database and want to apply the new operations tables incrementally, run the files in `migrations/` in order:

1. `phase1-operations-restructure.sql`
2. `phase2-clients.sql`
3. `phase3-payments-invoices.sql`
4. `phase4-sessions-attendance.sql`
5. `phase5-communications.sql`

Each file is idempotent and safe to re-run.

---

## Next steps / future ideas

- Referral links: each lead gets a unique `referral_code`; extra entries for successful referrals.
- Winner portal: let winners confirm their details via a private link.
- Email integration: connect an email provider to notify all entrants when a new round opens.
- Paid upgrades: add optional paid tiers while keeping a free entry path.
