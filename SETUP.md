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
- Row Level Security policies (public can submit leads into active giveaways; only admins can manage everything)
- Triggers that keep the admin profile row in sync with auth.users

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

## Dashboard insights

The **Dashboard** shows:
- **Open leads** — not yet converted or closed.
- **Converted** — total plus how many today.
- **Cold leads** — entered 7+ days ago and still untouched.
- **Hot leads** — entered today and still active.
- Pool split and status breakdown.
- Newest leads and leads needing attention.

---

## Custom domains (optional)

1. In Vercel, go to your project **Settings > Domains**.
2. Add your custom domain and follow the DNS instructions.
3. Update your Supabase Auth **Site URL** under **Authentication > URL Configuration** to match your custom domain.

---

## Next steps / future ideas

- Referral links: each lead gets a unique `referral_code`; extra entries for successful referrals.
- Winner portal: let winners confirm their details via a private link.
- Email integration: connect an email provider to notify all entrants when a new round opens.
- Paid upgrades: add optional paid tiers while keeping a free entry path.
