-- Rocket — Programmes → The Venture Hour.
-- Weekly mentor office hours. Each week Rocket picks 4–5 mentors at random from the pool (skipping
-- anyone picked in the last few weeks), students claim the slots first-come-first-served through a
-- Google Form, both sides get a Google Calendar invite, and a short survey after the meeting is
-- required before the student can sign up again.
--
-- Students are not Rocket members (they never sign in), so they get their own table.
-- Every rule that decides who gets a slot lives in the functions below, so the Google Form webhook,
-- the app and the weekly job all follow the same rules. Run after the earlier migrations.

create type public.mentor_type   as enum ('vc', 'alumni', 'professor');
create type public.slot_status   as enum ('open', 'claimed', 'completed', 'cancelled');
create type public.signup_status as enum ('assigned', 'waitlisted', 'blocked', 'duplicate', 'cancelled');
create type public.venture_stage as enum ('idea', 'validating', 'building', 'launched', 'revenue');

-- ─────────────────────────────────────────────────────────────
-- Tables
-- ─────────────────────────────────────────────────────────────
create table public.mentors (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null check (length(trim(name)) > 0),
  type               public.mentor_type not null,
  email              text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  org_title          text not null default '',          -- e.g. "Partner, BECO Capital"
  focus_area         text not null default '',          -- bio / what they're good for
  active             boolean not null default true,     -- inactive mentors are never picked
  last_selected_week date,                              -- Monday of the latest week they were picked
  created_at         timestamptz not null default now()
);
create unique index mentors_email on public.mentors (lower(email));

create table public.weekly_slots (
  id              uuid primary key default gen_random_uuid(),
  mentor_id       uuid not null references public.mentors(id) on delete restrict,
  week_start_date date not null check (extract(isodow from week_start_date) = 1),   -- a Monday
  starts_at       timestamptz not null,
  ends_at         timestamptz not null,
  location        text not null default '',
  status          public.slot_status not null default 'open',
  created_at      timestamptz not null default now(),
  check (ends_at > starts_at)
);
-- a mentor holds at most one live slot per week
create unique index weekly_slots_mentor_week on public.weekly_slots (mentor_id, week_start_date) where status <> 'cancelled';
create index weekly_slots_week on public.weekly_slots (week_start_date);

create table public.students (
  id         uuid primary key default gen_random_uuid(),
  name       text not null default '',
  aus_email  text not null check (lower(aus_email) ~ '^[^@\s]+@aus\.edu$'),
  major      text not null default '',
  year       text not null default '',
  created_at timestamptz not null default now()
);
create unique index students_email on public.students (lower(aus_email));

create table public.signups (
  id                uuid primary key default gen_random_uuid(),
  slot_id           uuid references public.weekly_slots(id) on delete set null,   -- null unless assigned
  student_id        uuid not null references public.students(id) on delete cascade,
  submitted_at      timestamptz not null,               -- when the form was sent: the first-come-first-served order
  topic_note        text not null default '',
  status            public.signup_status not null,
  status_reason     text not null default '',
  source            text not null default 'form' check (source in ('form', 'manual')),
  form_response_id  text unique,                        -- Google Forms response id, so a retried webhook can't double-book
  calendar_event_id text,                               -- filled once the Google Calendar invite exists
  calendar_error    text not null default '',
  survey_token      uuid not null unique default gen_random_uuid(),   -- the student's private survey link
  survey_sent_at    timestamptz,                        -- when the survey email went out
  created_by        uuid references public.profiles(id) on delete set null,     -- manual sign-ups: who added it
  created_at        timestamptz not null default now()  -- when Rocket processed it
);
create unique index signups_one_per_slot on public.signups (slot_id) where status = 'assigned';
create index signups_student on public.signups (student_id, submitted_at desc);
create index signups_submitted on public.signups (submitted_at);

create table public.survey_responses (
  id              uuid primary key default gen_random_uuid(),
  signup_id       uuid not null unique references public.signups(id) on delete cascade,
  stage           public.venture_stage not null,
  progress_rating int not null check (progress_rating between 1 and 5),
  key_takeaway    text not null check (length(trim(key_takeaway)) between 1 and 2000),
  submitted_at    timestamptz not null default now()
);

create table public.venture_settings (
  id               int primary key default 1 check (id = 1),
  slots_per_week   int not null default 5 check (slots_per_week between 1 and 12),
  cooldown_weeks   int not null default 2 check (cooldown_weeks between 0 and 12),  -- skip mentors picked this recently
  meeting_day      int not null default 3 check (meeting_day between 1 and 7),       -- ISO weekday, 1 = Monday
  meeting_time     time not null default '12:00',                                     -- Dubai time
  meeting_minutes  int not null default 60 check (meeting_minutes between 15 and 240),
  location         text not null default '',
  min_notice_hours int not null default 2 check (min_notice_hours between 0 and 72), -- don't book a slot that starts sooner
  form_url         text not null default '',
  auto_generate    boolean not null default true,                                     -- pick mentors every Monday morning
  updated_at       timestamptz not null default now()
);
insert into public.venture_settings (id) values (1);

-- ─────────────────────────────────────────────────────────────
-- Access: a new "programmes" section in Admin → Permissions.
-- Default: leadership and the Innovation role (which runs new programmes).
-- ─────────────────────────────────────────────────────────────
create or replace function public.has_section(s text) returns boolean
  language sql stable security definer set search_path = public
  as $$
    select case
      when not is_member() then false
      when s = 'overview' then true
      else coalesce(
        -- the admin's grid, when it has an entry for this section
        (select my_role()::text in (select jsonb_array_elements_text(coalesce(a.section_access -> s -> 'roles', '[]')))
             or coalesce(my_team() in (select jsonb_array_elements_text(coalesce(a.section_access -> s -> 'teams', '[]'))), false)
           from app_settings a where a.id = 1 and a.section_access ? s),
        -- built-in defaults
        case
          when s in ('calendar', 'meetings', 'events', 'ideas', 'deadlines', 'notes', 'kb') then true
          when s = 'startups'   then is_oversight() or coalesce(my_role() = 'startup', false)
          when s = 'budget'     then is_oversight() or coalesce(my_role() = 'treasurer', false)
          when s = 'design'     then is_oversight() or coalesce(my_role() = 'pr', false)
          when s = 'members'    then is_oversight()
          when s = 'programmes' then is_oversight() or coalesce(my_role() = 'innovation', false)
          else false
        end)
    end
  $$;

-- Members with the Programmes section, or the server itself (the form webhook and the weekly job run
-- with no signed-in user; anonymous visitors can't call these functions at all — see the grants below).
create function public.vh_can_manage() returns boolean
  language sql stable security definer set search_path = public
  as $$ select auth.uid() is null or has_section('programmes') $$;

alter table public.mentors          enable row level security;
alter table public.weekly_slots     enable row level security;
alter table public.students         enable row level security;
alter table public.signups          enable row level security;
alter table public.survey_responses enable row level security;
alter table public.venture_settings enable row level security;

-- Mentors, slot times/locations, student details and settings are edited directly.
-- Sign-ups and survey answers only change through the functions below, so the rules can't be skipped.
create policy mentors_all        on public.mentors          for all    using (has_section('programmes')) with check (has_section('programmes'));
create policy slots_read         on public.weekly_slots     for select using (has_section('programmes'));
create policy slots_update       on public.weekly_slots     for update using (has_section('programmes')) with check (has_section('programmes'));
create policy students_read      on public.students         for select using (has_section('programmes'));
create policy students_update    on public.students         for update using (has_section('programmes')) with check (has_section('programmes'));
create policy signups_read       on public.signups          for select using (has_section('programmes'));
create policy surveys_read       on public.survey_responses for select using (has_section('programmes'));
create policy vsettings_read     on public.venture_settings for select using (has_section('programmes'));
create policy vsettings_update   on public.venture_settings for update using (has_section('programmes')) with check (has_section('programmes'));

-- Slot edits: only the time, place and status-neutral fields; mentor swaps and cancellations go through functions.
create function public.weekly_slots_guard() returns trigger
  language plpgsql security invoker set search_path = public
  as $$
  begin
    if auth.uid() is null or current_user in ('postgres', 'service_role', 'supabase_admin') then return new; end if;
    if new.mentor_id is distinct from old.mentor_id or new.status is distinct from old.status or new.week_start_date is distinct from old.week_start_date then
      raise exception 'Use Swap mentor or Cancel to change a slot’s mentor or status';
    end if;
    return new;
  end $$;
create trigger weekly_slots_guard before update on public.weekly_slots for each row execute function public.weekly_slots_guard();

create function public.venture_settings_touch() returns trigger
  language plpgsql as $$ begin new.updated_at := now(); return new; end $$;
create trigger venture_settings_touch before update on public.venture_settings for each row execute function public.venture_settings_touch();

revoke all on public.mentors, public.weekly_slots, public.students, public.signups, public.survey_responses, public.venture_settings from anon;
grant select, insert, update, delete on public.mentors to authenticated;
grant select, update on public.weekly_slots, public.students, public.venture_settings to authenticated;
grant select on public.signups, public.survey_responses to authenticated;
grant all on public.mentors, public.weekly_slots, public.students, public.signups, public.survey_responses, public.venture_settings to service_role;

-- ─────────────────────────────────────────────────────────────
-- Helpers
-- ─────────────────────────────────────────────────────────────
-- The Monday of the week that contains t, in Dubai time.
create function public.vh_week_of(t timestamptz default now()) returns date
  language sql stable as $$ select date_trunc('week', t at time zone 'Asia/Dubai')::date $$;

-- Keep mentors.last_selected_week in step with the slots (after picks, swaps and cancellations).
create function public.vh_touch_mentors() returns void
  language sql security definer set search_path = public
  as $$
    update mentors m set last_selected_week = x.wk
      from (select mt.id, (select max(w.week_start_date) from weekly_slots w where w.mentor_id = mt.id and w.status <> 'cancelled') as wk from mentors mt) x
     where x.id = m.id and m.last_selected_week is distinct from x.wk;
  $$;

-- Meetings that have ended become "completed" (that's when the survey is due).
create function public.vh_refresh() returns void
  language sql security definer set search_path = public
  as $$ update weekly_slots set status = 'completed' where status = 'claimed' and ends_at < now(); $$;

-- The survey this student still owes from an earlier meeting, if any.
create function public.vh_owed_signup(p_student uuid) returns uuid
  language sql stable security definer set search_path = public
  as $$
    select s.id from signups s join weekly_slots w on w.id = s.slot_id
     where s.student_id = p_student and s.status = 'assigned' and w.status in ('claimed', 'completed') and w.ends_at < now()
       and not exists (select 1 from survey_responses r where r.signup_id = s.id)
     order by w.starts_at desc limit 1
  $$;

-- A mentor for this week: someone active, not already in the week, preferring people not picked in the
-- last `cooldown_weeks` weeks (at random); if the pool runs short, the least recently picked.
create function public.vh_pick_mentor(p_week date, p_cooldown int) returns table (id uuid, repeat boolean)
  language sql volatile security definer set search_path = public
  as $$
    select m.id, recent as repeat from (
      select mt.id, mt.last_selected_week,
             exists (select 1 from weekly_slots w where w.mentor_id = mt.id and w.status <> 'cancelled' and w.week_start_date <> p_week
                        and w.week_start_date between p_week - 7 * p_cooldown and p_week + 7 * p_cooldown) as recent
        from mentors mt
       where mt.active
         and not exists (select 1 from weekly_slots w where w.mentor_id = mt.id and w.week_start_date = p_week and w.status <> 'cancelled')
    ) m
    order by recent, case when recent then m.last_selected_week end asc nulls first, random()
    limit 1
  $$;

-- ─────────────────────────────────────────────────────────────
-- A. Weekly slot generation (the Monday job, or "Pick this week's mentors" in the app)
-- ─────────────────────────────────────────────────────────────
create function public.vh_generate_week(p_week date default null) returns jsonb
  language plpgsql security definer set search_path = public
  as $$
  declare
    s venture_settings;
    wk date := date_trunc('week', coalesce(p_week, vh_week_of()))::date;
    want int; made int := 0; repeats int := 0; pick record; st timestamptz;
  begin
    if not vh_can_manage() then raise exception 'You need the Programmes section to do that'; end if;
    perform pg_advisory_xact_lock(hashtext('venture-hour'));
    select * into s from venture_settings where id = 1;
    want := s.slots_per_week - (select count(*) from weekly_slots where week_start_date = wk and status <> 'cancelled');
    st := ((wk + (s.meeting_day - 1)) + s.meeting_time) at time zone 'Asia/Dubai';
    while made < want loop
      select * into pick from vh_pick_mentor(wk, s.cooldown_weeks);
      exit when not found;
      insert into weekly_slots (mentor_id, week_start_date, starts_at, ends_at, location)
      values (pick.id, wk, st, st + make_interval(mins => s.meeting_minutes), s.location);
      made := made + 1;
      if pick.repeat then repeats := repeats + 1; end if;
    end loop;
    perform vh_touch_mentors();
    return jsonb_build_object('week', wk, 'created', made, 'repeats', repeats, 'short', greatest(want - made, 0));
  end $$;

-- Add one slot with a chosen mentor (manual override).
create function public.vh_add_slot(p_week date, p_mentor uuid) returns uuid
  language plpgsql security definer set search_path = public
  as $$
  declare s venture_settings; wk date := date_trunc('week', p_week)::date; st timestamptz; new_id uuid;
  begin
    if not vh_can_manage() then raise exception 'You need the Programmes section to do that'; end if;
    if not exists (select 1 from mentors where id = p_mentor and active) then raise exception 'Pick an active mentor'; end if;
    if exists (select 1 from weekly_slots where mentor_id = p_mentor and week_start_date = wk and status <> 'cancelled') then
      raise exception 'That mentor already has a slot that week'; end if;
    select * into s from venture_settings where id = 1;
    st := ((wk + (s.meeting_day - 1)) + s.meeting_time) at time zone 'Asia/Dubai';
    insert into weekly_slots (mentor_id, week_start_date, starts_at, ends_at, location)
    values (p_mentor, wk, st, st + make_interval(mins => s.meeting_minutes), s.location) returning id into new_id;
    perform vh_touch_mentors();
    return new_id;
  end $$;

-- Swap the mentor on a slot (someone's unavailable). p_mentor null = pick one at random by the usual rules.
-- If a student already has the slot, they keep it; the caller then updates the calendar invite.
create function public.vh_swap_mentor(p_slot uuid, p_mentor uuid default null) returns jsonb
  language plpgsql security definer set search_path = public
  as $$
  declare w weekly_slots; s venture_settings; target uuid := p_mentor; old_name text; new_name text;
  begin
    if not vh_can_manage() then raise exception 'You need the Programmes section to do that'; end if;
    perform pg_advisory_xact_lock(hashtext('venture-hour'));
    select * into w from weekly_slots where id = p_slot for update;
    if not found then raise exception 'That slot no longer exists'; end if;
    if w.status in ('completed', 'cancelled') then raise exception 'That slot is already %', w.status; end if;
    select * into s from venture_settings where id = 1;
    if target is null then select id into target from vh_pick_mentor(w.week_start_date, s.cooldown_weeks); end if;
    if target is null then raise exception 'No other active mentor is free that week'; end if;
    if not exists (select 1 from mentors where id = target and active) then raise exception 'Pick an active mentor'; end if;
    if exists (select 1 from weekly_slots where mentor_id = target and week_start_date = w.week_start_date and status <> 'cancelled' and id <> w.id) then
      raise exception 'That mentor already has a slot that week'; end if;
    select name into old_name from mentors where id = w.mentor_id;
    select name into new_name from mentors where id = target;
    update weekly_slots set mentor_id = target where id = w.id;
    perform vh_touch_mentors();
    return jsonb_build_object('slot_id', w.id, 'from', old_name, 'to', new_name,
      'signup_id', (select id from signups where slot_id = w.id and status = 'assigned'));
  end $$;

-- ─────────────────────────────────────────────────────────────
-- B. A student signs up (Google Form webhook, or "Add a sign-up" in the app)
-- ─────────────────────────────────────────────────────────────
create function public.vh_intake(
  p_name text, p_email text, p_major text, p_year text, p_topic text,
  p_submitted_at timestamptz default null, p_response_id text default null, p_source text default 'form'
) returns jsonb
  language plpgsql security definer set search_path = public
  as $$
  declare
    email text := lower(trim(coalesce(p_email, '')));
    s venture_settings; st students; w weekly_slots; owed uuid; upcoming record; sid uuid; prev signups;
    at timestamptz := coalesce(p_submitted_at, now());
  begin
    if not vh_can_manage() then raise exception 'You need the Programmes section to do that'; end if;
    if email !~ '^[^@\s]+@aus\.edu$' then
      return jsonb_build_object('status', 'invalid', 'reason', 'Use an @aus.edu email address.');
    end if;
    -- the same form response twice (a retried webhook) gets the same answer, never a second booking
    if p_response_id is not null then
      select * into prev from signups where form_response_id = p_response_id;
      if found then return vh_signup_result(prev.id); end if;
    end if;

    perform pg_advisory_xact_lock(hashtext('venture-hour'));   -- one sign-up at a time: first come, first served
    perform vh_refresh();
    select * into s from venture_settings where id = 1;

    insert into students (name, aus_email, major, year)
    values (coalesce(trim(p_name), ''), email, coalesce(trim(p_major), ''), coalesce(trim(p_year), ''))
    on conflict (lower(aus_email)) do update set
      name  = coalesce(nullif(excluded.name, ''), students.name),
      major = coalesce(nullif(excluded.major, ''), students.major),
      year  = coalesce(nullif(excluded.year, ''), students.year)
    returning * into st;

    -- the survey gate: no new slot until the survey from the last meeting is in
    owed := vh_owed_signup(st.id);
    if owed is not null then
      insert into signups (student_id, submitted_at, topic_note, status, status_reason, source, form_response_id, created_by)
      values (st.id, at, coalesce(trim(p_topic), ''), 'blocked', 'survey_owed', p_source, p_response_id, auth.uid()) returning id into sid;
      return vh_signup_result(sid);
    end if;

    -- one upcoming meeting at a time
    select s2.id into upcoming from signups s2 join weekly_slots w2 on w2.id = s2.slot_id
     where s2.student_id = st.id and s2.status = 'assigned' and w2.ends_at >= now() limit 1;
    if found then
      insert into signups (student_id, submitted_at, topic_note, status, status_reason, source, form_response_id, created_by)
      values (st.id, at, coalesce(trim(p_topic), ''), 'duplicate', 'already_booked', p_source, p_response_id, auth.uid()) returning id into sid;
      return vh_signup_result(sid);
    end if;

    -- the earliest open slot that isn't about to start
    select * into w from weekly_slots
     where status = 'open' and starts_at > now() + make_interval(hours => s.min_notice_hours)
     order by starts_at, created_at limit 1 for update;
    if found then
      insert into signups (slot_id, student_id, submitted_at, topic_note, status, source, form_response_id, created_by)
      values (w.id, st.id, at, coalesce(trim(p_topic), ''), 'assigned', p_source, p_response_id, auth.uid()) returning id into sid;
      update weekly_slots set status = 'claimed' where id = w.id;
    else
      insert into signups (student_id, submitted_at, topic_note, status, status_reason, source, form_response_id, created_by)
      values (st.id, at, coalesce(trim(p_topic), ''), 'waitlisted', 'no_open_slots', p_source, p_response_id, auth.uid()) returning id into sid;
    end if;
    return vh_signup_result(sid);
  end $$;

-- Everything the webhook / app needs to report back about one sign-up.
create function public.vh_signup_result(p_signup uuid) returns jsonb
  language sql stable security definer set search_path = public
  as $$
    select jsonb_build_object(
      'status', s.status, 'reason', s.status_reason, 'signup_id', s.id, 'slot_id', s.slot_id,
      'student', jsonb_build_object('name', st.name, 'email', st.aus_email),
      'mentor', case when m.id is null then null else jsonb_build_object('name', m.name, 'org_title', m.org_title, 'type', m.type) end,
      'starts_at', w.starts_at, 'ends_at', w.ends_at, 'location', w.location,
      'survey_token', case when s.status = 'blocked' then (select o.survey_token from signups o where o.id = vh_owed_signup(s.student_id)) else s.survey_token end,
      'owed_mentor', case when s.status = 'blocked' then (select m2.name from signups o join weekly_slots w3 on w3.id = o.slot_id join mentors m2 on m2.id = w3.mentor_id where o.id = vh_owed_signup(s.student_id)) end,
      'upcoming', case when s.status = 'duplicate' then (select jsonb_build_object('mentor', m3.name, 'starts_at', w4.starts_at) from signups o join weekly_slots w4 on w4.id = o.slot_id join mentors m3 on m3.id = w4.mentor_id
                        where o.student_id = s.student_id and o.status = 'assigned' and w4.ends_at >= now() order by w4.starts_at limit 1) end)
      from signups s join students st on st.id = s.student_id
      left join weekly_slots w on w.id = s.slot_id left join mentors m on m.id = w.mentor_id
     where s.id = p_signup
  $$;

-- Cancel a booking (the student can't make it, or the meeting didn't happen). The slot reopens and, if it
-- hasn't started, goes to the earliest-submitted person on that week's waitlist.
create function public.vh_cancel_signup(p_signup uuid, p_reason text default '') returns jsonb
  language plpgsql security definer set search_path = public
  as $$
  declare s signups; w weekly_slots; nxt signups; promoted uuid; wk_start timestamptz; s0 venture_settings;
  begin
    if not vh_can_manage() then raise exception 'You need the Programmes section to do that'; end if;
    perform pg_advisory_xact_lock(hashtext('venture-hour'));
    select * into s from signups where id = p_signup for update;
    if not found then raise exception 'That sign-up no longer exists'; end if;
    if s.status <> 'assigned' then raise exception 'Only a booked sign-up can be cancelled'; end if;
    update signups set status = 'cancelled', status_reason = coalesce(nullif(trim(p_reason), ''), 'cancelled') where id = s.id;
    select * into w from weekly_slots where id = s.slot_id for update;
    select * into s0 from venture_settings where id = 1;
    if w.id is null or w.status = 'cancelled' then
      null;
    elsif w.status = 'completed' or w.ends_at < now() then
      update weekly_slots set status = 'cancelled' where id = w.id;   -- the meeting didn't happen: no survey owed
      perform vh_touch_mentors();
    else
      update weekly_slots set status = 'open' where id = w.id;
      if w.starts_at > now() + make_interval(hours => s0.min_notice_hours) then   -- still time to hand it on
        wk_start := w.week_start_date::timestamp at time zone 'Asia/Dubai';
        for nxt in select * from signups where status = 'waitlisted' and submitted_at >= wk_start order by submitted_at for update loop
          continue when vh_owed_signup(nxt.student_id) is not null
            or exists (select 1 from signups x join weekly_slots y on y.id = x.slot_id where x.student_id = nxt.student_id and x.status = 'assigned' and y.ends_at >= now());
          update signups set status = 'assigned', status_reason = 'from_waitlist', slot_id = w.id where id = nxt.id;
          update weekly_slots set status = 'claimed' where id = w.id;
          promoted := nxt.id;
          exit;
        end loop;
      end if;
    end if;
    return jsonb_build_object('cancelled', s.id, 'calendar_event_id', s.calendar_event_id, 'promoted', promoted);
  end $$;

-- Cancel a slot altogether (mentor unavailable, no replacement). A student on it goes back to the front of
-- the waitlist with their original sign-up time.
create function public.vh_cancel_slot(p_slot uuid) returns jsonb
  language plpgsql security definer set search_path = public
  as $$
  declare w weekly_slots; s signups;
  begin
    if not vh_can_manage() then raise exception 'You need the Programmes section to do that'; end if;
    perform pg_advisory_xact_lock(hashtext('venture-hour'));
    select * into w from weekly_slots where id = p_slot for update;
    if not found then raise exception 'That slot no longer exists'; end if;
    if w.status in ('completed', 'cancelled') then raise exception 'That slot is already %', w.status; end if;
    select * into s from signups where slot_id = w.id and status = 'assigned';
    if found then update signups set status = 'waitlisted', status_reason = 'slot_cancelled', slot_id = null where id = s.id; end if;
    update weekly_slots set status = 'cancelled' where id = w.id;
    perform vh_touch_mentors();
    return jsonb_build_object('slot_id', w.id, 'signup_id', s.id, 'calendar_event_id', s.calendar_event_id);
  end $$;

-- ─────────────────────────────────────────────────────────────
-- D. The post-meeting survey (a public page with a private link per sign-up)
-- ─────────────────────────────────────────────────────────────
create function public.vh_survey_info(p_token uuid) returns jsonb
  language sql stable security definer set search_path = public
  as $$
    select jsonb_build_object(
      'student', split_part(st.name, ' ', 1), 'mentor', m.name, 'mentor_org', m.org_title,
      'starts_at', w.starts_at, 'started', w.starts_at <= now(),
      'cancelled', s.status <> 'assigned' or w.status = 'cancelled',
      'done', exists (select 1 from survey_responses r where r.signup_id = s.id))
      from signups s join students st on st.id = s.student_id
      join weekly_slots w on w.id = s.slot_id join mentors m on m.id = w.mentor_id
     where s.survey_token = p_token
  $$;

create function public.vh_submit_survey(p_token uuid, p_stage text, p_rating int, p_takeaway text) returns jsonb
  language plpgsql security definer set search_path = public
  as $$
  declare s signups; w weekly_slots;
  begin
    select * into s from signups where survey_token = p_token;
    if not found then raise exception 'This survey link isn’t valid'; end if;
    select * into w from weekly_slots where id = s.slot_id;
    if s.status <> 'assigned' or w.status = 'cancelled' then raise exception 'This meeting was cancelled, so there’s no survey to fill'; end if;
    if w.starts_at > now() then raise exception 'The survey opens once your meeting has started'; end if;
    if exists (select 1 from survey_responses where signup_id = s.id) then raise exception 'You’ve already sent this survey — thank you!'; end if;
    if p_stage not in ('idea', 'validating', 'building', 'launched', 'revenue') then raise exception 'Pick the stage of your venture'; end if;
    if p_rating is null or p_rating not between 1 and 5 then raise exception 'Rate your progress from 1 to 5'; end if;
    if length(trim(coalesce(p_takeaway, ''))) = 0 then raise exception 'Add your key takeaway'; end if;
    insert into survey_responses (signup_id, stage, progress_rating, key_takeaway)
    values (s.id, p_stage::venture_stage, p_rating, left(trim(p_takeaway), 2000));
    perform vh_refresh();
    return jsonb_build_object('ok', true);
  end $$;

-- Surveys to email now: meetings that ended in the last two weeks with no survey and no email yet.
-- Marks them as sent, so each goes out once. Called by the Google Apps Script through the Edge Function.
create function public.vh_due_surveys() returns table (signup_id uuid, student_name text, student_email text, mentor_name text, starts_at timestamptz, survey_token uuid)
  language plpgsql security definer set search_path = public
  as $$
  begin
    perform vh_refresh();
    return query
      update signups s set survey_sent_at = now()
        from weekly_slots w, students st, mentors m
       where w.id = s.slot_id and st.id = s.student_id and m.id = w.mentor_id
         and s.status = 'assigned' and w.status = 'completed' and s.survey_sent_at is null
         and w.ends_at > now() - interval '14 days'
         and not exists (select 1 from survey_responses r where r.signup_id = s.id)
      returning s.id, st.name, st.aus_email, m.name, w.starts_at, s.survey_token;
  end $$;

-- Who may call what: members (their Programmes access is checked inside), the server, and — for the two
-- survey functions only — anyone holding a survey link.
revoke all on function public.vh_can_manage(), public.vh_week_of(timestamptz), public.vh_touch_mentors(), public.vh_refresh(), public.vh_owed_signup(uuid),
  public.vh_pick_mentor(date, int), public.vh_generate_week(date), public.vh_add_slot(date, uuid), public.vh_swap_mentor(uuid, uuid),
  public.vh_intake(text, text, text, text, text, timestamptz, text, text), public.vh_signup_result(uuid), public.vh_cancel_signup(uuid, text),
  public.vh_cancel_slot(uuid), public.vh_survey_info(uuid), public.vh_submit_survey(uuid, text, int, text), public.vh_due_surveys() from public, anon, authenticated;
grant execute on function public.vh_generate_week(date), public.vh_add_slot(date, uuid), public.vh_swap_mentor(uuid, uuid),
  public.vh_intake(text, text, text, text, text, timestamptz, text, text), public.vh_cancel_signup(uuid, text), public.vh_cancel_slot(uuid),
  public.vh_refresh(), public.vh_week_of(timestamptz) to authenticated;
grant execute on function public.vh_survey_info(uuid), public.vh_submit_survey(uuid, text, int, text) to anon, authenticated;
grant execute on all functions in schema public to service_role;

-- ─────────────────────────────────────────────────────────────
-- Scheduled jobs (pg_cron is already on for the daily reminders; skipped if it isn't)
--   Mondays 6:00 AM Dubai: pick the week's mentors (if auto_generate is on)
--   Hourly: mark finished meetings completed, so their surveys come due
-- ─────────────────────────────────────────────────────────────
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobname) from cron.job where jobname in ('venture-hour-weekly', 'venture-hour-hourly');
    perform cron.schedule('venture-hour-weekly', '0 2 * * 1',
      $job$ select public.vh_generate_week() where (select auto_generate from public.venture_settings where id = 1) $job$);
    perform cron.schedule('venture-hour-hourly', '5 * * * *', $job$ select public.vh_refresh() $job$);
  end if;
end $$;
