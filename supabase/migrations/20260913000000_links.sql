-- Rocket — admin-managed links: WhatsApp groups per team, members' WhatsApp numbers,
-- a club calendar link, and any other club links. Run after the earlier migrations.

-- links = {"whatsapp": {"all": url, "<team id>": url, ...}, "calendarUrl": url, "custom": [{"id", "label", "url"}]}
alter table public.app_settings add column links jsonb not null default '{}';

-- Members' WhatsApp numbers (for "Message on WhatsApp"). Visible to signed-in members, like names and emails.
alter table public.profiles
  add column whatsapp text not null default '' check (whatsapp = '' or whatsapp ~ '^\+?[0-9 ()-]{7,24}$');

-- WhatsApp numbers are admin-managed, like names, roles and teams.
create or replace function public.profiles_guard() returns trigger
  language plpgsql security invoker set search_path = public
  as $$
  begin
    if auth.uid() is null or current_user in ('postgres', 'service_role', 'supabase_admin') or is_admin() then
      return new;  -- server-side admin API, dashboard, or an admin
    end if;
    if new.name     is distinct from old.name  or new.email  is distinct from old.email
    or new.role     is distinct from old.role  or new.team   is distinct from old.team
    or new.is_admin is distinct from old.is_admin or new.active is distinct from old.active
    or new.whatsapp is distinct from old.whatsapp then
      raise exception 'Only an admin can change names, roles, teams, WhatsApp numbers or access';
    end if;
    return new;
  end $$;
