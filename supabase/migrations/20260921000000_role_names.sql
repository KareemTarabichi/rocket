-- Rocket — the club's own role names.
-- Renaming is an app-side change (role and team ids are internal and never shown), with two exceptions
-- that live here: the Innovation role is retired, and new accounts default to Team Member.
-- Teams keep their ids too, so every member, event, idea and meeting stays attached to the right team:
--   leadership → Leadership · creative → Design · innovation → Socials
--   startups → Startups · tech → Tech · finance → PR & Vendors
-- Run after the earlier migrations.

-- Anyone still on the retired Innovation role becomes a Team Member; an admin can give them a
-- lead role again in Admin → Members.
update public.profiles set role = 'member' where role = 'innovation';

alter table public.profiles alter column role set default 'member';

create or replace function public.handle_new_user() returns trigger
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
      coalesce((new.raw_user_meta_data->>'role')::club_role, 'member'),
      coalesce(nullif(new.raw_user_meta_data->>'team', ''), 'leadership'),
      coalesce((new.raw_user_meta_data->>'is_admin')::boolean, false)
    );
    return new;
  end $$;

-- Programmes was open to leadership and the Innovation role; with that role gone it's leadership only.
-- Admins can hand it to any role or team in Admin → Permissions.
create or replace function public.has_section(s text) returns boolean
  language sql stable security definer set search_path = public
  as $$
    select case
      when not is_member() then false
      when s = 'overview' then true
      else coalesce(
        (select my_role()::text in (select jsonb_array_elements_text(coalesce(a.section_access -> s -> 'roles', '[]')))
             or coalesce(my_team() in (select jsonb_array_elements_text(coalesce(a.section_access -> s -> 'teams', '[]'))), false)
           from app_settings a where a.id = 1 and a.section_access ? s),
        case
          when s in ('calendar', 'meetings', 'events', 'ideas', 'deadlines', 'notes', 'kb', 'schedules') then true
          when s = 'startups'   then is_oversight() or coalesce(my_role() = 'startup', false)
          when s = 'budget'     then is_oversight() or coalesce(my_role() = 'treasurer', false)
          when s = 'design'     then is_oversight() or coalesce(my_role() = 'pr', false)
          when s = 'members'    then is_oversight()
          when s = 'programmes' then is_oversight()
          else false
        end)
    end
  $$;
