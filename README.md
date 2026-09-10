# Rocket

The ops workspace for AUS Launchpad: meetings, events, ideas, deadlines, the startup directory, budget, design requests and a knowledge base, with views tailored to 11 club roles. Admins manage members and logins.

It's a plain HTML/CSS/JavaScript site — no build step. It runs in two modes:

| | Demo | Live |
|---|---|---|
| When | `config.js` is empty (default) | `config.js` has your Supabase URL and anon key |
| Sign-in | None; a role switcher at the bottom of the sidebar | Email + password (first time: temporary password from an admin), invited `@aus.edu` accounts only |
| Data | Sample data in this browser (`localStorage`) | Shared Postgres database on Supabase |
| Permissions | Checked in the browser | Checked in the browser **and** enforced by row-level security in the database |
| Admin | Simulated (Tech is the admin) | Real invites, role changes, disabled logins and removals |

Open `index.html` in a browser to try the demo.

## Project layout

```
index.html                 page shell
styles.css                 all styles (desktop + phone layout)
config.js                  Supabase URL + anon key (empty = demo)
js/core.js                 roles, permissions, derived deadlines, budget maths, demo seed
js/views.js, views-more.js section views
js/admin.js                Admin section (members, roles, teams, logins)
js/live.js                 Supabase sign-in, loading, and saving changes
js/app.js                  dialogs, forms, deletion, event handling
js/demo-data.js            startups for the demo
supabase/migrations/…sql   database schema + row-level security
supabase/functions/admin-users/index.ts   server-side admin API
supabase/import_startups.sql              your 56 startups, for the live database
```

## Going live (about 30 minutes)

You need free accounts on **Supabase** and **Vercel** (and optionally GitHub). Rocket can't create these for you.

### 1. Create the database

1. In Supabase, create a new project. Pick the region closest to the UAE that's offered, and save the database password somewhere safe.
2. Open **SQL Editor → New query**, paste the whole of `supabase/migrations/20260910000000_init.sql`, and run it.
3. New query: paste `supabase/migrations/20260911000000_kb_settings_startup_approval.sql` and run it. Then do the same with `supabase/migrations/20260912000000_calendar_and_push.sql` (Google Calendar and phone notifications). Then `supabase/migrations/20260913000000_links.sql` (admin-managed links and WhatsApp numbers). This adds the editable knowledge base (with 12 starter articles), the Design Drive setting, image uploads for articles, and approval-gated startup deletion.
4. New query: paste `supabase/import_startups.sql` and run it. The Startup Directory now has your 56 startups.

### 2. Lock down sign-in

In **Authentication**:

1. **Sign In / Providers → Email**: keep Email enabled. Turn **off** "Allow new users to sign up". Rocket is invite-only; the database also rejects any address that isn't `@aus.edu`.
2. **URL Configuration**: set **Site URL** to your live address (you'll get it in step 5 — come back and update it), and add the same address under **Redirect URLs**.
3. **Emails → SMTP settings**: Supabase's built-in email only sends a handful of emails per hour. Before inviting the whole club, connect a sender such as Resend, Postmark or a club Google Workspace account.

### 3. Deploy the admin API

The admin API runs on Supabase, where it can use the service role key without exposing it. On your Mac:

```bash
brew install supabase/tap/supabase
```

```bash
supabase login
```

```bash
cd "/Users/kareemtarabichi/Downloads/Claude Engine /Rocket" && supabase link --project-ref YOUR_PROJECT_REF
```

```bash
supabase functions deploy admin-users
```

`YOUR_PROJECT_REF` is the random ID in your project URL (`https://YOUR_PROJECT_REF.supabase.co`). Once the site is live, restrict which site may call the API:

```bash
supabase secrets set SITE_URL=https://your-rocket-address.vercel.app
```

### 4. Make yourself the first admin

1. **Authentication → Users → Invite user**, enter your own `@aus.edu` address.
2. In the SQL editor, give yourself your club role and admin rights (edit the values first):

```sql
update public.profiles
set name = 'Kareem Tarabichi', role = 'advisor', team = 'leadership', is_admin = true
where email = 'your.id@aus.edu';
```

Roles: `president`, `vp`, `advisor`, `ea`, `treasurer`, `startup`, `pr`, `tech`, `media`, `design`, `innovation`.
Teams: `leadership`, `finance`, `startups`, `creative`, `tech`, `innovation`.

Everyone else is invited from Rocket's **Admin** section. Make a second admin early so the club can't get locked out.

### 5. Put the site online

1. In `config.js`, fill in `supabaseUrl` and `supabaseAnonKey` (**Project Settings → API**). Use the **anon / public** key — never the `service_role` key.
2. Deploy the folder to Vercel, either:
   - push it to a GitHub repo (e.g. `KareemTarabichi/launchpad-ops`) and import it in Vercel with **Framework: Other**, no build command, output directory `.`; or
   - run `npx vercel` in this folder.
3. Put the Vercel address into Supabase's Site URL and Redirect URLs (step 2) and `SITE_URL` (step 3).
4. Open the site, sign in with your email link, and open **Admin**.

## Signing in

Rocket doesn't email sign-in links: AUS's Microsoft 365 email opens links to scan them, which uses up one-time links before members tap them.

- **New member:** an admin invites them in **Admin → Invite member**. Rocket creates the account and shows a **temporary password** once, with Copy and "Send on WhatsApp" buttons.
- **First sign-in:** email + temporary password (browser or home-screen app). Rocket then makes them choose their own password.
- **Forgot it:** an admin opens them in Admin → **Reset password** and sends the new temporary one.
- **Change it:** sidebar or More menu → **Change password**.

In Supabase, **Authentication → Sign In / Providers → Email**: set **Minimum password length** to 8, and leave **Secure password change** off.

Later, if you connect your own email sender (Authentication → Emails → SMTP), you can put the code into the Magic Link template (`supabase/email-templates/magic-link.html`) and set `emailCodes: true` in `config.js` to let members get sign-in codes themselves.

## What the admin can do

- **Invite** a member: name, `@aus.edu` email, club role, team, and optionally admin rights. Rocket shows a temporary password to send them; they choose their own at first sign-in.
- **Edit** name, club role, team and admin rights. Rocket always keeps at least one admin.
- **Disable / enable** a login. Disabled members can't sign in and the database refuses all their reads and writes; their records stay.
- **Reset a password**: gives the member a new temporary password to send them; they choose their own at next sign-in.
- **Remove** a member (with confirmation). Their account is deleted; anything they owned becomes unassigned.
- See every admin action in the **Admin activity** log.
- **Write the knowledge base**: add, edit and delete articles with headings, lists, links and images (Knowledge Base → New article).
- **Manage every link in Admin → Links**:
  - **Google Calendar**: connection status, setup steps if it isn't configured yet, Connect / Disconnect, and "Add upcoming meetings". Admins and the Executive Assistant can manage the connection; only the Executive Assistant's meetings send invites.
  - **WhatsApp groups**: an invite link for the all-members group and each team. Team buttons in Members & teams and the Overview open them.
  - **Members' WhatsApp numbers**: power "Message on WhatsApp" (also editable on each member in Admin).
  - **Design Drive** (shown to PR, Media, Graphic Design and leadership) and an optional **club calendar view link**.
  - **Other links** (Instagram, forms, anything): shown to everyone under "Club links" on the Overview.
- **Approve startup deletions**. Anyone with the directory can ask to delete a startup; only an admin or the President can approve (it then disappears for everyone) or keep it.

Admin is a platform permission on top of a club role. It does **not** grant club powers: only the Executive Assistant can schedule, edit or cancel meetings, admin or not.

## Notifications

The bell (top right of every page, or the top bar on phones) lists what needs *you*: your deadlines that are overdue or due within a day, meetings today or tomorrow, new design work, reviews waiting for PR, ideas to review (leadership), reimbursements to approve (budget roles) and startup deletions to decide (admins and the President). Meeting invitations, changes and cancellations addressed to you appear underneath. The unread marker is kept per browser.

## Google Calendar (real invites)

Once connected, every meeting the Executive Assistant schedules becomes an event on the club Google account's calendar, and Google emails each attendee an invite at their AUS address. Edits and cancellations update the event. Set up once:

1. **Google Cloud Console** (console.cloud.google.com), signed in with the club's Google account → create a project called `Rocket`.
2. **APIs & Services → Library** → enable **Google Calendar API**.
3. **APIs & Services → OAuth consent screen** → User type **External** → app name `Rocket`, your support email → add the scope `.../auth/calendar.events` → then **Publish app** (to "In production"). You don't need Google's verification; the one person who connects will see an "unverified app" warning and can continue. Leaving it in "Testing" makes the connection expire every 7 days.
4. **APIs & Services → Credentials → Create credentials → OAuth client ID** → type **Web application** → Authorised redirect URI: `https://ptcsxotsucwaxqfrdlkd.supabase.co/functions/v1/google-calendar` → create, and keep the client ID and secret.
5. In Terminal (in this folder):
   `supabase secrets set GOOGLE_CLIENT_ID=… GOOGLE_CLIENT_SECRET=…`
   `supabase functions deploy google-calendar --use-api --no-verify-jwt`
6. Sign in to Rocket as the Executive Assistant → **Meetings → Connect Google Calendar** → pick the club Google account.

## Phone notifications

Members turn notifications on from the bell (or the welcome screen). On iPhone they must first add Rocket to the home screen (iOS 16.4+). Notifications go out for meeting invitations, changes and cancellations; design requests and follow-ups assigned to you; startup deletion requests (admins and the President); and a 9 AM summary of what's overdue or due today.

Set up once, in Terminal (in this folder):

1. `node scripts/make-push-keys.mjs` — creates `.env.push` (private) and `push-cron.local.sql`, and prints the public key for `config.js`. (Already done for this project.)
2. `supabase secrets set --env-file .env.push`
3. `supabase functions deploy push --use-api --no-verify-jwt`
4. Paste `push-cron.local.sql` into the Supabase SQL editor and run it — this schedules the 9 AM summary.

Keep `.env.push` safe (for example in your password manager) and never commit it.

## Still simulated in live mode

- Without Google Calendar connected, meeting invitations are only in-app and push notifications — nothing is emailed.
- Receipts store the filename only.
- Knowledge-base images are stored in a public bucket: anyone with an image's link can open it. Don't upload anything confidential.
- Other people's changes appear when you reload or come back to the tab (no live push yet).

## Security notes

- The browser only ever holds the anon key. Every read and write is checked by Postgres row-level security using the signed-in member's role, team and ownership — the same rules the UI shows.
- Member management goes through the `admin-users` Edge Function, which verifies the caller is an active admin before using the service role key.
- Before a wider rollout: add automated end-to-end tests for each role, turn on Supabase's database backups, and review the policies in the migration with someone on Tech.
