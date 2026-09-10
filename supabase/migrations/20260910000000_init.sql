-- Rocket — initial schema, row-level security and admin helpers.
-- Every permission the app shows in the browser is enforced again here.

create extension if not exists pgcrypto;

-- ─────────────────────────────────────────────────────────────
-- Members
-- ─────────────────────────────────────────────────────────────
create type public.club_role as enum
  ('president','vp','advisor','ea','treasurer','startup','pr','tech','media','design','innovation');

create table public.profiles (
  id             uuid primary key references auth.users(id) on delete cascade,
  name           text not null default '',
  email          text not null unique check (lower(email) like '%@aus.edu'),
  role           public.club_role not null default 'innovation',
  team           text not null default 'innovation'
                   check (team in ('leadership','finance','startups','creative','tech','innovation')),
  responsibility text not null default '',
  is_admin       boolean not null default false,   -- platform admin: manages members and logins
  active         boolean not null default true,    -- false = login disabled, all data access denied
  created_at     timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────
-- Permission helpers (security definer so policies can call them)
-- ─────────────────────────────────────────────────────────────
create function public.my_role() returns public.club_role
  language sql stable security definer set search_path = public
  as $$ select role from profiles where id = auth.uid() and active $$;

create function public.my_team() returns text
  language sql stable security definer set search_path = public
  as $$ select team from profiles where id = auth.uid() and active $$;

create function public.is_member() returns boolean
  language sql stable security definer set search_path = public
  as $$ select exists (select 1 from profiles where id = auth.uid() and active) $$;

create function public.is_oversight() returns boolean
  language sql stable security definer set search_path = public
  as $$ select coalesce(my_role() in ('president','vp','advisor','ea'), false) $$;

create function public.is_ea() returns boolean
  language sql stable security definer set search_path = public
  as $$ select coalesce(my_role() = 'ea', false) $$;

create function public.is_admin() returns boolean
  language sql stable security definer set search_path = public
  as $$ select exists (select 1 from profiles where id = auth.uid() and active and is_admin) $$;

-- Section access matrix (mirrors access() in the app)
create function public.has_section(s text) returns boolean
  language sql stable security definer set search_path = public
  as $$
    select case
      when s in ('overview','meetings','events','ideas','deadlines','kb') then is_member()
      when s = 'startups' then is_oversight() or coalesce(my_role() = 'startup', false)
      when s = 'budget'   then is_oversight() or coalesce(my_role() = 'treasurer', false)
      when s = 'design'   then is_oversight() or coalesce(my_role() = 'pr', false)
      when s = 'members'  then is_oversight()
      else false
    end
  $$;

-- New auth users get a profile. Only @aus.edu addresses are accepted.
create function public.handle_new_user() returns trigger
  language plpgsql security definer set search_path = public
  as $$
  begin
    if lower(new.email) not like '%@aus.edu' then
      raise exception 'Rocket only accepts @aus.edu accounts';
    end if;
    insert into profiles (id, email, name, role, team, is_admin)
    values (
      new.id,
      lower(new.email),
      coalesce(nullif(new.raw_user_meta_data->>'name', ''), split_part(new.email, '@', 1)),
      coalesce((new.raw_user_meta_data->>'role')::club_role, 'innovation'),
      coalesce(nullif(new.raw_user_meta_data->>'team', ''), 'innovation'),
      coalesce((new.raw_user_meta_data->>'is_admin')::boolean, false)
    );
    return new;
  end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Non-admins may only edit the responsibility description (and only oversight roles, per policy).
-- security invoker on purpose: current_user must be the caller's role, not the function owner.
create function public.profiles_guard() returns trigger
  language plpgsql security invoker set search_path = public
  as $$
  begin
    if auth.uid() is null or current_user in ('postgres', 'service_role', 'supabase_admin') or is_admin() then
      return new;  -- server-side admin API, dashboard, or an admin
    end if;
    if new.name     is distinct from old.name  or new.email  is distinct from old.email
    or new.role     is distinct from old.role  or new.team   is distinct from old.team
    or new.is_admin is distinct from old.is_admin or new.active is distinct from old.active then
      raise exception 'Only an admin can change names, roles, teams or access';
    end if;
    return new;
  end $$;

create trigger profiles_guard before update on public.profiles
  for each row execute function public.profiles_guard();

-- ─────────────────────────────────────────────────────────────
-- Meetings (Executive Assistant only) and notifications
-- ─────────────────────────────────────────────────────────────
create table public.meetings (
  id           text primary key default gen_random_uuid()::text,
  title        text not null check (length(trim(title)) > 0),
  date         date not null,
  start_time   time not null,
  end_time     time not null,
  location     text not null,
  agenda       text not null,
  mode         text not null default 'custom' check (mode in ('all','custom')),
  team_ids     text[] not null default '{}',
  attendee_ids uuid[] not null default '{}',
  created_at   timestamptz not null default now(),
  check (end_time > start_time)
);

create table public.notifications (
  id            text primary key default gen_random_uuid()::text,
  kind          text not null check (kind in ('invite','update','cancel')),
  title         text not null,
  details       text not null default '',
  recipient_ids uuid[] not null default '{}',
  calendar      boolean not null default false,
  created_at    timestamptz not null default now()
);

-- Keep the latest 100 notifications
create function public.prune_notifications() returns trigger
  language plpgsql security definer set search_path = public
  as $$
  begin
    delete from notifications where id in (select id from notifications order by created_at desc offset 100);
    return null;
  end $$;
create trigger notifications_prune after insert on public.notifications
  for each statement execute function public.prune_notifications();

create table public.calendar_settings (
  id        int primary key default 1 check (id = 1),
  connected boolean not null default false,
  email     text not null default ''
);
insert into public.calendar_settings (id) values (1);

-- ─────────────────────────────────────────────────────────────
-- Events and checklist requirements
-- ─────────────────────────────────────────────────────────────
create table public.events (
  id          text primary key default gen_random_uuid()::text,
  name        text not null check (length(trim(name)) > 0),
  description text not null default '',
  date        date not null,
  location    text not null default '',
  team        text not null check (team in ('leadership','finance','startups','creative','tech','innovation')),
  assigned    uuid[] not null default '{}',
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);

create function public.can_manage_event(eid text) returns boolean
  language sql stable security definer set search_path = public
  as $$
    select is_oversight() or exists (
      select 1 from events e where e.id = eid and is_member()
        and (e.created_by = auth.uid() or e.team = my_team()))
  $$;

create table public.event_requirements (
  id       text primary key default gen_random_uuid()::text,
  event_id text not null references public.events(id) on delete cascade,
  title    text not null,
  owner    uuid references public.profiles(id) on delete set null,
  due      date not null,
  done     boolean not null default false,
  position int not null default 0
);

-- Requirement owners who don't manage the event may only tick it off or move its date.
create function public.requirements_guard() returns trigger
  language plpgsql security definer set search_path = public
  as $$
  begin
    if auth.uid() is null or can_manage_event(old.event_id) then return new; end if;
    if new.title is distinct from old.title or new.owner is distinct from old.owner
    or new.event_id is distinct from old.event_id or new.position is distinct from old.position then
      raise exception 'Only the event team can change this requirement';
    end if;
    return new;
  end $$;
create trigger requirements_guard before update on public.event_requirements
  for each row execute function public.requirements_guard();

-- ─────────────────────────────────────────────────────────────
-- Follow-up tasks, ideas, design requests
-- ─────────────────────────────────────────────────────────────
create table public.tasks (
  id         text primary key default gen_random_uuid()::text,
  title      text not null,
  owner      uuid references public.profiles(id) on delete set null,
  due        date not null,
  done       boolean not null default false,
  related    text not null default '',
  created_at timestamptz not null default now()
);

create table public.ideas (
  id             text primary key default gen_random_uuid()::text,
  title          text not null check (length(trim(title)) > 0),
  description    text not null default '',
  team           text not null check (team in ('leadership','finance','startups','creative','tech','innovation')),
  owner          uuid references public.profiles(id) on delete set null,
  assigned       uuid[] not null default '{}',
  stage          text not null default 'submitted' check (stage in ('submitted','review','approved','progress','completed')),
  notes          text not null default '',
  next_step      text not null default '',
  due            date,
  previous_stage text,
  created_at     timestamptz not null default now()
);

create table public.designs (
  id              text primary key default gen_random_uuid()::text,
  title           text not null,
  event_id        text references public.events(id) on delete set null,
  campaign        text not null default '',
  brief           text not null,
  deliverables    text not null default '',
  owner           uuid references public.profiles(id) on delete set null,
  due             date not null,
  status          text not null default 'requested' check (status in ('requested','in_progress','in_review','completed')),
  previous_status text
);

-- Assignees without the Design section may only change status.
create function public.designs_guard() returns trigger
  language plpgsql security definer set search_path = public
  as $$
  begin
    if auth.uid() is null or has_section('design') then return new; end if;
    if new.title is distinct from old.title or new.event_id is distinct from old.event_id
    or new.campaign is distinct from old.campaign or new.brief is distinct from old.brief
    or new.deliverables is distinct from old.deliverables or new.owner is distinct from old.owner
    or new.due is distinct from old.due then
      raise exception 'Only PR and leadership can edit the request itself';
    end if;
    return new;
  end $$;
create trigger designs_guard before update on public.designs
  for each row execute function public.designs_guard();

-- ─────────────────────────────────────────────────────────────
-- Startup directory and budget
-- ─────────────────────────────────────────────────────────────
create table public.startups (
  id         text primary key default gen_random_uuid()::text,
  name       text not null,
  sector     text not null default '',
  notes      text not null default '',
  attendance text[] not null default '{}',
  contacts   jsonb not null default '[]',   -- [{id, name, email, phone, primary}]
  rating     numeric,
  created_at timestamptz not null default now()
);

create table public.budget_settings (
  id          int primary key default 1 check (id = 1),
  overall     numeric not null default 0 check (overall >= 0),
  allocations jsonb not null default '{}'   -- {event_id: amount}
);
insert into public.budget_settings (id) values (1);

create table public.expenses (
  id       text primary key default gen_random_uuid()::text,
  name     text not null,
  event_id text references public.events(id) on delete set null,
  planned  numeric not null default 0 check (planned >= 0),
  actual   numeric not null default 0 check (actual >= 0),
  receipt  text not null default ''          -- filename only; no file is stored
);

create table public.reimbursements (
  id       text primary key default gen_random_uuid()::text,
  name     text not null,
  member   uuid references public.profiles(id) on delete set null,
  event_id text references public.events(id) on delete set null,
  amount   numeric not null check (amount >= 0),
  status   text not null default 'Requested' check (status in ('Requested','Approved','Paid','Rejected')),
  receipt  text not null default ''
);

-- ─────────────────────────────────────────────────────────────
-- Admin audit log and member removal helper
-- ─────────────────────────────────────────────────────────────
create table public.admin_log (
  id           bigserial primary key,
  actor        uuid references public.profiles(id) on delete set null,
  action       text not null,
  target_email text not null default '',
  details      text not null default '',
  created_at   timestamptz not null default now()
);

-- Clears a member out of array columns before their account is deleted.
-- (Single-owner columns are handled by "on delete set null".)
create function public.admin_scrub_member(p uuid) returns void
  language sql security definer set search_path = public
  as $$
    update meetings      set attendee_ids  = array_remove(attendee_ids, p)  where p = any(attendee_ids);
    update events        set assigned      = array_remove(assigned, p)      where p = any(assigned);
    update ideas         set assigned      = array_remove(assigned, p)      where p = any(assigned);
    update notifications set recipient_ids = array_remove(recipient_ids, p) where p = any(recipient_ids);
  $$;
revoke all on function public.admin_scrub_member(uuid) from public, anon, authenticated;
grant execute on function public.admin_scrub_member(uuid) to service_role;

-- ─────────────────────────────────────────────────────────────
-- Row-level security
-- ─────────────────────────────────────────────────────────────
alter table public.profiles           enable row level security;
alter table public.meetings           enable row level security;
alter table public.notifications      enable row level security;
alter table public.calendar_settings  enable row level security;
alter table public.events             enable row level security;
alter table public.event_requirements enable row level security;
alter table public.tasks              enable row level security;
alter table public.ideas              enable row level security;
alter table public.designs            enable row level security;
alter table public.startups           enable row level security;
alter table public.budget_settings    enable row level security;
alter table public.expenses           enable row level security;
alter table public.reimbursements     enable row level security;
alter table public.admin_log          enable row level security;

-- profiles: everyone signed in can see the directory; oversight edits responsibility (guarded); admins edit via the admin API
create policy profiles_read   on public.profiles for select using (is_member());
create policy profiles_update on public.profiles for update using (is_oversight() or is_admin()) with check (is_member());

-- meetings: leadership sees all; others see meetings that resolve to them. Only the EA writes.
create policy meetings_read on public.meetings for select using (
  is_oversight() or (is_member() and (mode = 'all' or auth.uid() = any(attendee_ids) or my_team() = any(team_ids))));
create policy meetings_insert on public.meetings for insert with check (is_ea());
create policy meetings_update on public.meetings for update using (is_ea()) with check (is_ea());
create policy meetings_delete on public.meetings for delete using (is_ea());

create policy notifications_read   on public.notifications for select using (is_oversight() or auth.uid() = any(recipient_ids));
create policy notifications_insert on public.notifications for insert with check (is_ea());

create policy calendar_read   on public.calendar_settings for select using (is_member());
create policy calendar_update on public.calendar_settings for update using (is_ea()) with check (is_ea());

-- events: everyone reads and can create; the responsible team, creator and leadership edit. No deletion.
create policy events_read   on public.events for select using (is_member());
create policy events_insert on public.events for insert with check (is_member() and created_by = auth.uid());
create policy events_update on public.events for update
  using (is_oversight() or (is_member() and (created_by = auth.uid() or team = my_team())))
  with check (is_member());

create policy req_read   on public.event_requirements for select using (is_member());
create policy req_insert on public.event_requirements for insert with check (can_manage_event(event_id));
create policy req_update on public.event_requirements for update
  using (can_manage_event(event_id) or (is_member() and owner = auth.uid())) with check (is_member());
create policy req_delete on public.event_requirements for delete using (can_manage_event(event_id));

-- tasks: leadership sees and completes everything; members only their own. Members can only create tasks for themselves.
create policy tasks_read   on public.tasks for select using (is_oversight() or (is_member() and owner = auth.uid()));
create policy tasks_insert on public.tasks for insert with check (is_oversight() or (is_member() and owner = auth.uid()));
create policy tasks_update on public.tasks for update
  using (is_oversight() or (is_member() and owner = auth.uid()))
  with check (is_oversight() or (is_member() and owner = auth.uid()));

-- ideas: club-wide board; owner, collaborators and leadership edit and delete
create policy ideas_read   on public.ideas for select using (is_member());
create policy ideas_insert on public.ideas for insert with check (is_member());
create policy ideas_update on public.ideas for update
  using (is_oversight() or (is_member() and (owner = auth.uid() or auth.uid() = any(assigned))))
  with check (is_member());
create policy ideas_delete on public.ideas for delete
  using (is_oversight() or (is_member() and (owner = auth.uid() or auth.uid() = any(assigned))));

-- designs: readable so assignees see their work in Events; PR + leadership manage; assignees change status (guarded)
create policy designs_read   on public.designs for select using (is_member());
create policy designs_insert on public.designs for insert with check (has_section('design'));
create policy designs_update on public.designs for update
  using (has_section('design') or (is_member() and owner = auth.uid())) with check (is_member());
create policy designs_delete on public.designs for delete using (has_section('design'));

-- startup directory
create policy startups_all on public.startups for all using (has_section('startups')) with check (has_section('startups'));

-- budget
create policy budget_read   on public.budget_settings for select using (has_section('budget'));
create policy budget_update on public.budget_settings for update using (has_section('budget')) with check (has_section('budget'));
create policy expenses_all  on public.expenses       for all using (has_section('budget')) with check (has_section('budget'));
create policy reimb_all     on public.reimbursements for all using (has_section('budget')) with check (has_section('budget'));

-- admin log: admins read; only the admin API (service role) writes
create policy admin_log_read on public.admin_log for select using (is_admin());

-- ─────────────────────────────────────────────────────────────
-- Data API access. "Automatically expose new tables" is off, so grant explicitly:
-- signed-in members get table access (row-level security still decides which rows);
-- anonymous visitors get none; the admin API's service role gets full access.
-- ─────────────────────────────────────────────────────────────
grant usage on schema public to authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
revoke all on all tables in schema public from anon;
