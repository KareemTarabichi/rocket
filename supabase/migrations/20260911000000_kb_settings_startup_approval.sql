-- Rocket — knowledge base editing, app settings (Design Drive link) and
-- approval-gated startup deletion. Run after 20260910000000_init.sql.

-- ─────────────────────────────────────────────────────────────
-- App-wide settings (admins only)
-- ─────────────────────────────────────────────────────────────
create table public.app_settings (
  id               int primary key default 1 check (id = 1),
  design_drive_url text not null default '' check (design_drive_url = '' or design_drive_url ~* '^https://')
);
insert into public.app_settings (id) values (1);
alter table public.app_settings enable row level security;
create policy settings_read   on public.app_settings for select using (is_member());
create policy settings_update on public.app_settings for update using (is_admin()) with check (is_admin());

-- ─────────────────────────────────────────────────────────────
-- Knowledge base: everyone reads, admins write
-- ─────────────────────────────────────────────────────────────
create table public.kb_articles (
  id         text primary key default gen_random_uuid()::text,
  title      text not null check (length(trim(title)) > 0),
  category   text not null default 'General',
  roles      text[] not null default '{}',     -- shown first for these club roles
  summary    text not null default '',
  body       text not null default '',         -- Markdown; rendered safely in the app
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.kb_articles enable row level security;
create policy kb_read   on public.kb_articles for select using (is_member());
create policy kb_insert on public.kb_articles for insert with check (is_admin());
create policy kb_update on public.kb_articles for update using (is_admin()) with check (is_admin());
create policy kb_delete on public.kb_articles for delete using (is_admin());

insert into public.kb_articles (id, title, category, roles, summary, body) values
  ('k1', 'Your first two weeks at Launchpad', 'Onboarding', '{}', 'What every new member does first.', '1. Pick your role in Rocket and read its guidance article.
2. Join your team’s WhatsApp group from Members & teams (ask leadership for the link if you can’t see that section).
3. Check Deadlines daily — it shows only what you own.
4. Submit at least one idea in your first month.'),
  ('k2', 'Scheduling a club meeting', 'Meeting coordination', '{ea}', 'Only the Executive Assistant schedules, edits and cancels meetings.', '1. Open Meetings and choose Schedule meeting.
2. Invite all members, whole teams, individuals, or a mix. The unique attendee count updates as you pick.
3. Add an agenda people can prepare for, and a room or call link.
4. Editing a meeting notifies everyone who was on it before or after the change.
5. Deleting a meeting sends a cancellation to its current attendees.'),
  ('k3', 'How meeting invitations reach you', 'Meeting coordination', '{treasurer,startup,pr,tech,media,design,innovation}', 'You see a meeting when you’re invited directly or through your team.', '1. Invitations appear in Meetings and in your notification log.
2. If your team is invited, you are too.
3. Ask the Executive Assistant for changes — other roles can’t edit meetings.'),
  ('k4', 'Budget, expenses and reimbursements', 'Finance', '{treasurer}', 'Keeping allocations, plans and actuals honest.', '1. Set the overall budget, then allocate per event. Allocations can’t exceed the overall budget.
2. Log each expense with a planned and an actual amount.
3. Record reimbursements separately so a cost isn’t counted twice.
4. Move reimbursements through Requested, Approved, Paid or Rejected.
5. Attach the receipt filename; check event cards for overspending.'),
  ('k5', 'Claiming a reimbursement', 'Finance', '{}', 'Getting paid back for something you bought for the club.', '1. Get the Treasurer’s go-ahead before you spend.
2. Keep an itemised receipt.
3. Send it to the Treasurer, who records the claim in Budget.'),
  ('k6', 'Planning an event checklist', 'Event planning', '{president,vp}', 'Turning an event into owned, dated requirements.', '1. Create the event and pick the responsible team.
2. Add every requirement with one owner and a deadline.
3. Owners tick requirements off in Deadlines; progress updates on the event.
4. Assign design requests to the event so creative work shows up alongside it.'),
  ('k7', 'Keeping startup contacts current', 'Startup contacts', '{startup}', 'A directory is only useful if you can reach people.', '1. Filter by Missing contact details weekly.
2. Each startup needs exactly one primary contact.
3. Record every event a startup attended, including Rise and Ignite.
4. Save incomplete details rather than losing them — follow up later.'),
  ('k8', 'Creative requests and approvals', 'Creative approvals', '{pr,media,design}', 'From brief to approved asset.', '1. PR or leadership writes the brief and deliverables in Design.
2. The assignee moves the request to In Progress, then In Review.
3. PR reviews and marks it Completed.
4. Assignees without the Design section update status from Events.'),
  ('k9', 'Leading the board', 'Leadership', '{president,vp,advisor}', 'What oversight roles can and can’t do.', '1. You can see every meeting, deadline and idea.
2. You can’t create or change meetings — that stays with the Executive Assistant.
3. Use Members & teams to keep responsibilities accurate.'),
  ('k10', 'Technical setup: forms, livestream and tools', 'Technical setup', '{tech}', 'The club’s technical checklist.', '1. Test sign-up forms a week before each event.
2. Run a livestream rehearsal on the actual network.
3. Keep credentials in the club password manager, never in chats.'),
  ('k12', 'Admin: managing members and logins', 'Admin', '{}', 'For whoever holds admin rights — usually someone on Tech.', '1. Invite members from Admin with their @aus.edu email, club role and team. They get a one-tap sign-in link.
2. Change someone’s role or team from Admin; their sections and permissions update the next time the page loads.
3. Disable a login to lock someone out but keep their history. Remove a member only when their records should become unassigned.
4. There are no passwords. If someone can’t get in, send them a new sign-in link.
5. Keep at least two admins so the club never gets locked out.'),
  ('k11', 'Moving an idea through the pipeline', 'Innovation', '{innovation}', 'Submitted → Under Review → Approved → In Progress → Completed.', '1. Give every idea an owner, a team and one clear next step.
2. The next step appears in Deadlines for the owner and collaborators.
3. Completing that step marks the idea Completed; reopening restores its earlier stage.');

-- Images in articles: a public bucket (anyone with the link can view an image); only admins upload or delete.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('kb-images', 'kb-images', true, 5242880, array['image/png','image/jpeg','image/gif','image/webp'])
on conflict (id) do nothing;
create policy "kb images: admins upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'kb-images' and public.is_admin());
create policy "kb images: admins delete" on storage.objects for delete to authenticated
  using (bucket_id = 'kb-images' and public.is_admin());

-- ─────────────────────────────────────────────────────────────
-- Startups: deleting one needs an admin or the President.
-- Anyone with the directory can ask; approvers approve (delete) or decline (clear the request).
-- ─────────────────────────────────────────────────────────────
alter table public.startups
  add column deletion_requested_by uuid references public.profiles(id) on delete set null,
  add column deletion_requested_at timestamptz,
  add column deletion_reason       text not null default '';

create function public.can_approve_startup_deletion() returns boolean
  language sql stable security definer set search_path = public
  as $$ select is_admin() or coalesce(my_role() = 'president', false) $$;

drop policy startups_all on public.startups;
create policy startups_read on public.startups for select
  using (has_section('startups') or (can_approve_startup_deletion() and deletion_requested_at is not null));
create policy startups_insert on public.startups for insert with check (has_section('startups'));
create policy startups_update on public.startups for update
  using (has_section('startups') or (can_approve_startup_deletion() and deletion_requested_at is not null))
  with check (is_member());
create policy startups_delete on public.startups for delete using (can_approve_startup_deletion());

create function public.startups_guard() returns trigger
  language plpgsql security invoker set search_path = public
  as $$
  declare
    req_changed boolean := new.deletion_requested_at is distinct from old.deletion_requested_at
                        or new.deletion_requested_by is distinct from old.deletion_requested_by
                        or new.deletion_reason is distinct from old.deletion_reason;
  begin
    if auth.uid() is null or current_user in ('postgres', 'service_role', 'supabase_admin') then return new; end if;
    -- approvers without the directory (e.g. a Tech admin) may only decide on the request
    if not has_section('startups') and (new.name, new.sector, new.notes, new.attendance, new.contacts, new.rating)
         is distinct from (old.name, old.sector, old.notes, old.attendance, old.contacts, old.rating) then
      raise exception 'Only the Startup Coordinator and leadership can edit startups';
    end if;
    if req_changed and not can_approve_startup_deletion() then
      if old.deletion_requested_at is null and new.deletion_requested_by = auth.uid() then return new; end if;  -- asking
      if old.deletion_requested_by = auth.uid() and new.deletion_requested_at is null then return new; end if;  -- withdrawing your own request
      raise exception 'Only an admin or the President can decide on a deletion request';
    end if;
    return new;
  end $$;
create trigger startups_guard before update on public.startups
  for each row execute function public.startups_guard();
