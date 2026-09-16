-- Rocket — class schedules, and deleting an event.
--
-- 1. Schedules: every member's weekly class timetable, so the club can see when people are free.
--    Everyone reads everyone's; you edit your own. The Executive Assistant can also fill one in for
--    someone who hasn't, and fix it afterwards. Times are plain club times (Gulf Standard Time) — the
--    same way meetings are already stored — so a 2:00 PM class and a 2:00 PM meeting mean the same thing.
-- 2. Deleting an event takes its checklist, design requests, expenses, reimbursements and budget
--    allocation with it. Only the Executive Assistant or an admin can do it, and the app lists exactly
--    what will go (with the money) before asking to confirm.
-- Run after the earlier migrations.

create table public.class_schedules (
  id          uuid primary key default gen_random_uuid(),
  member      uuid not null references public.profiles(id) on delete cascade,
  title       text not null check (length(trim(title)) > 0),   -- e.g. "MKT 301 Marketing"
  day_of_week int  not null check (day_of_week between 1 and 7),   -- ISO: 1 = Monday
  start_time  time not null,
  end_time    time not null,
  location    text not null default '',
  term_start  date,           -- null = no start limit
  term_end    date,           -- null = runs until removed; past terms never count as busy
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (end_time > start_time),
  check (term_start is null or term_end is null or term_end >= term_start)
);
create index class_schedules_member on public.class_schedules (member, day_of_week, start_time);

create function public.class_schedules_touch() returns trigger
  language plpgsql as $$ begin new.updated_at := now(); return new; end $$;
create trigger class_schedules_touch before update on public.class_schedules for each row execute function public.class_schedules_touch();

alter table public.class_schedules enable row level security;
-- Everyone with the section reads every timetable; only the owner (or the Executive Assistant) writes one.
create policy schedules_read   on public.class_schedules for select using (has_section('schedules'));
create policy schedules_insert on public.class_schedules for insert
  with check (has_section('schedules') and (member = auth.uid() or is_ea()));
create policy schedules_update on public.class_schedules for update
  using (has_section('schedules') and (member = auth.uid() or is_ea()))
  with check (has_section('schedules') and (member = auth.uid() or is_ea()));
create policy schedules_delete on public.class_schedules for delete
  using (has_section('schedules') and (member = auth.uid() or is_ea()));

revoke all on public.class_schedules from anon;
grant select, insert, update, delete on public.class_schedules to authenticated;
grant all on public.class_schedules to service_role;

-- Schedules is on for everyone by default (admins can still change that in Admin → Permissions).
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
          when s in ('calendar', 'meetings', 'events', 'ideas', 'deadlines', 'notes', 'kb', 'schedules') then true
          when s = 'startups'   then is_oversight() or coalesce(my_role() = 'startup', false)
          when s = 'budget'     then is_oversight() or coalesce(my_role() = 'treasurer', false)
          when s = 'design'     then is_oversight() or coalesce(my_role() = 'pr', false)
          when s = 'members'    then is_oversight()
          when s = 'programmes' then is_oversight() or coalesce(my_role() = 'innovation', false)
          else false
        end)
    end
  $$;

-- ─────────────────────────────────────────────────────────────
-- Deleting an event
-- ─────────────────────────────────────────────────────────────
-- What an event would take with it — the app shows this (with the money) before asking to confirm.
create function public.event_deletion_preview(p_event text) returns jsonb
  language sql stable security definer set search_path = public
  as $$
    select jsonb_build_object(
      'name', e.name,
      'requirements', (select count(*) from event_requirements r where r.event_id = e.id),
      'designs', (select coalesce(jsonb_agg(jsonb_build_object('title', d.title, 'status', d.status) order by d.title), '[]') from designs d where d.event_id = e.id),
      'expenses', (select coalesce(jsonb_agg(jsonb_build_object('name', x.name, 'planned', x.planned, 'actual', x.actual) order by x.name), '[]') from expenses x where x.event_id = e.id),
      'reimbursements', (select coalesce(jsonb_agg(jsonb_build_object('name', b.name, 'amount', b.amount, 'status', b.status, 'member', b.member) order by b.name), '[]') from reimbursements b where b.event_id = e.id),
      'allocation', (select coalesce((allocations ->> e.id)::numeric, 0) from budget_settings where id = 1))
      from events e where e.id = p_event
  $$;

-- Deletes the event and everything filed against it. Executive Assistant or admin only.
create function public.delete_event(p_event text) returns jsonb
  language plpgsql security definer set search_path = public
  as $$
  declare ev events; summary jsonb;
  begin
    if not (is_ea() or is_admin()) then raise exception 'Only the Executive Assistant or an admin can delete an event'; end if;
    select * into ev from events where id = p_event;
    if not found then raise exception 'That event no longer exists'; end if;
    summary := event_deletion_preview(p_event);
    delete from designs        where event_id = p_event;
    delete from expenses       where event_id = p_event;
    delete from reimbursements where event_id = p_event;
    update budget_settings set allocations = allocations - p_event where id = 1;
    delete from events where id = p_event;   -- the checklist goes with it (on delete cascade)
    return summary;
  end $$;

revoke all on function public.event_deletion_preview(text), public.delete_event(text) from public, anon;
grant execute on function public.event_deletion_preview(text), public.delete_event(text) to authenticated;
grant execute on function public.event_deletion_preview(text), public.delete_event(text) to service_role;
