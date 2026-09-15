-- Rocket — admin-editable section access. Admin → Permissions saves a grid of which club roles and
-- teams can open each section. The database enforces it for the sections that guard data
-- (startups, budget, design, members); the app hides the other sections to match.
-- Run after the earlier migrations.

-- {"<section>": {"roles": ["president", …], "teams": ["finance", …]}, …}   null = built-in defaults
alter table public.app_settings add column section_access jsonb;

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
          when s = 'startups' then is_oversight() or coalesce(my_role() = 'startup', false)
          when s = 'budget'   then is_oversight() or coalesce(my_role() = 'treasurer', false)
          when s = 'design'   then is_oversight() or coalesce(my_role() = 'pr', false)
          when s = 'members'  then is_oversight()
          else false
        end)
    end
  $$;
