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
js/venture.js              Programmes → The Venture Hour (mentors, slots, sign-ups, surveys)
js/schedules.js            Schedules (class timetables, team compare, common free time)
js/demo-data.js            startups for the demo
survey.html                public post-meeting survey page (opened from each student's private link)
integrations/venture-hour-form.gs         Apps Script for the Venture Hour Google Form
supabase/functions/venture-hour/index.ts  Google Form webhook + Venture Hour calendar invites
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

- **Permissions** (Admin → Permissions): a grid of which club roles and teams can open each section — a member gets a section if their role **or** their team is ticked. Programmes, Startups, Budget, Design and Members & teams are enforced by the database (`20260917000000_section_permissions.sql`, `20260918000000_venture_hour.sql`); the other sections are hidden in the app. Overview is always on; Admin always follows the per-person admin switch. The same tab lists the fixed rules (who schedules meetings, who deletes ideas, etc.).

Admin is a platform permission on top of a club role. It does **not** grant club powers: only the Executive Assistant can schedule, edit or cancel meetings, admin or not.

## Finding things

- **Search** — press **⌘K** (Mac) or **Ctrl K** (Windows), or **/**, anywhere; on phones tap the search icon. It searches ideas (including contributions), events and their checklists, meetings you can see, follow-ups, people, guides, and — if your role has them — startups, design requests and budget items. Arrow keys + Enter to open.
- **Calendar** — everything with a date: meetings, events, checklist items, follow-ups, idea next steps and design deadlines. Filter by type or "Only mine". It's the second tab on phones.
- **History** — ideas, events and startups have **Show history**: who created it, changed which field from what to what, ticked checklist items, added contributions, asked to delete it. The database records this itself (`20260915000000_change_history.sql`), so it can't be skipped or edited. Startup history is only visible to people who can see the directory.

## Notes

- **Notes** (sidebar, or More on phones) — rich text with bold/italic/underline/strikethrough, headings, bulleted and numbered lists, **tickable checklists**, quotes, code, links and dividers. Autosaves as you type (⌘S saves immediately). Search, pin to top, and filter by All / Mine / Shared / Club.
- **Private by default.** The owner shares with specific people (**can edit** / **can view**) or with the whole club (view or edit). Only the owner changes sharing; only the owner or an admin deletes. People get a notification when a note is shared with them.
- **Together:** other people's saves appear live, and you can see who else has the note open. Saves are versioned — if two people save over each other, Rocket asks which version to keep instead of silently losing one.
- Setup: run `20260916000000_notes.sql` (it also turns on live updates for notes) and redeploy the `push` function.

## Ideas

- The person who submits an idea is its **owner** — locked for good. (If an owner is removed from Rocket, an admin can assign a new one.)
- The owner invites **collaborators**. Owner and collaborators can edit the idea and post **contributions** — a thread of mini sub-ideas with an optional headline. Everyone can read them.
- Only the **owner or an admin** can delete an idea. Contributions can be deleted by their author, the idea owner, or an admin.

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

## Club roles

**Roles:** President, Vice President, Advisor, Executive Assistant, Treasurer, Startups Lead, PR Lead, Tech Lead, Media Lead, Graphics Lead, and **Team Member** — a general member of any team, and the default for new accounts. A Team Member gets the shared sections (Overview, Calendar, Meetings, Events, Ideas, Deadlines, Notes, Schedules, Knowledge Base) and none of the role-specific ones until an admin ticks more in Admin → Permissions.

**Teams**, one per WhatsApp group: Leadership, Design, Socials, Startups, Tech, PR & Vendors.

Role and team **ids are internal and never shown**, so renaming either is a label change in `js/core.js` and every existing record stays attached to the right thing. The ids predate the names: `creative` = Design, `innovation` = Socials, `finance` = PR & Vendors.

Two migrations go with this: `20260920000000_team_member_role.sql` adds the Team Member role (run it on its own — Postgres won't add and use an enum value in one transaction), and `20260921000000_role_names.sql` retires the old Innovation role, makes Team Member the default for new accounts, and leaves Programmes to leadership. Redeploy the admin-users function too, so invites accept the role list.

## Schedules

Everyone's class timetable, so the club can see when people are actually free. On for every role by default.

- **My schedule**: add your classes — name, day(s), start and end time, optional room, and the semester dates. They repeat weekly and stop counting once the semester end passes. Rocket warns you if a new class overlaps one of your own.
- **Same class on several days**: tick every day it runs when adding it, and Rocket creates one entry per day. To copy an existing one, open it and tick the days under **Copy to other days** — same time, room and semester. Each copy is its own entry, so you can change one day later without touching the rest, and copying a day that already has that class changes nothing.
- **Team schedules**: filter by team or tick several people to compare timetables side by side, each in their own colour. You can only edit your own entries; the database enforces that. The **Executive Assistant** can also add and fix a timetable for someone who hasn't entered one.
- **Common free time**: pick people and see the windows each weekday when none of them has class (8 AM–8 PM, minimum gap of your choice). Back-to-back classes don't create a gap. Anyone with no timetable is listed as "schedule not provided — availability unknown" and is never counted as free.
- All times are plain **Gulf Standard Time**, the same way meetings are stored.

**Class clashes when scheduling a meeting.** As the Executive Assistant fills in a meeting, Rocket checks the date and times against every attendee's timetable — people invited individually, through a team, or through "all members", each counted once. It warns, and nothing else: it never moves, blocks or cancels anything, and it doesn't change who can schedule meetings.

- Each clash is named: "Dana has MGT 210 Management from 2:00 PM–3:15 PM on Tuesday", and those attendees turn amber in the invite list.
- Any real overlap counts; back-to-back doesn't — a class ending at 10:45 and a meeting starting at 10:45 are fine.
- Attendees with no timetable covering that date are listed as "schedule not provided — availability unknown", never as free.
- Saving is blocked until the time changes or the EA ticks **Schedule anyway**. A new clash appearing clears that tick, so it always reflects what's on screen.
- Upcoming meetings with clashes show a marker in the meetings list (Executive Assistant only). It's recalculated every time the page draws, so editing a timetable updates the markers by itself — no meeting is ever changed automatically.

Run `supabase/migrations/20260919000000_schedules_and_event_deletion.sql` once to switch this on.

## Deleting an event

The Executive Assistant or an admin can delete an event from its dialog. It takes everything filed against it: the checklist, design requests, expenses, reimbursements and the budget allocation. The confirmation lists each design request, expense and reimbursement by name and amount first, so nothing disappears unseen. The change history keeps a record of the deletion.

## Programmes → The Venture Hour

Weekly one-to-one mentor office hours. Open to leadership and the Innovation role by default (change it in Admin → Permissions → Programmes; the database enforces it).

- **Mentors**: a pool of VCs, alumni founders and professors. Inactive mentors are never picked.
- **Slots**: every Monday at 6:00 AM (Dubai) Rocket picks 4–5 active mentors at random, skipping anyone picked in the last 2 weeks (both numbers are in Setup). If the pool is too small it fills up with the least recently picked. You can also pick by hand, swap a mentor, change a slot's time, or cancel it.
- **Sign-ups**: students fill a Google Form. Each response goes to Rocket, which books them into the earliest open slot, first come first served by the form's own timestamp. It also waitlists them when every slot is taken, blocks them while they owe a survey, and refuses a second booking while one is upcoming. Everything is logged on the Sign-ups tab. Cancelling a booking hands the slot to the first person on that week's waitlist.
- **Invites**: when a slot is booked, the club Google account (the one connected for meetings) invites both the mentor and the student, with the student's topic and survey link in the invite.
- **Surveys**: an hour after the meeting the student is emailed a private link to `survey.html` (stage of venture, progress 1–5, key takeaway). The Surveys tab shows who still owes one.

Set up once:
1. Run `supabase/migrations/20260918000000_venture_hour.sql` in the SQL Editor. It also schedules the Monday pick and the hourly tidy-up with pg_cron.
2. In Terminal: `supabase secrets set VENTURE_SECRET=<a long random string>` then `supabase functions deploy venture-hour --use-api --no-verify-jwt`.
3. Create the Google Form, signed in as the club account, with questions titled with *name*, *AUS email*, *major*, *year* and *what to discuss*. Then go to **⋮ → Apps Script**, paste `integrations/venture-hour-form.gs`, and add `VENTURE_SECRET` under Project Settings → Script properties. Run `setup` once. The script sends the students' emails from the club account.
4. Paste the form's link into Programmes → The Venture Hour → Setup.

## Phone notifications

Members turn notifications on from the bell (or the welcome screen). On iPhone they must first add Rocket to the home screen (iOS 16.4+). Notifications go out for meeting invitations, changes and cancellations; design requests and follow-ups assigned to you; being added to an idea (owner or collaborator), an event, or an event checklist item; new contributions on an idea you own or collaborate on; startup deletion requests (admins and the President); and a 9 AM summary of what's overdue or due today.

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
