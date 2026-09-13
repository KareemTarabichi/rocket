-- Rocket — change history: who changed what, and when, on ideas, events and startups.
-- Written by database triggers, so every change is recorded no matter which app version made it.
-- Run after the earlier migrations.

create table public.change_log (
  id          bigserial primary key,
  entity_type text not null check (entity_type in ('idea', 'event', 'startup')),
  entity_id   text not null,
  actor       uuid references public.profiles(id) on delete set null,
  action      text not null,               -- created | updated | deleted | requirement … | contribution …
  subject     text not null default '',    -- title/name at the time, so deleted things still read well
  changes     jsonb not null default '{}', -- {"field": [old, new], …} for updates
  created_at  timestamptz not null default now()
);
create index change_log_entity on public.change_log (entity_type, entity_id, created_at desc);

-- tg_argv[0]: idea | event | startup | requirement (logged on its event) | contribution (logged on its idea)
create function public.log_change() returns trigger
  language plpgsql security definer set search_path = public
  as $$
  declare
    kind text := tg_argv[0];
    o jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else '{}'::jsonb end;
    n jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else '{}'::jsonb end;
    diff jsonb := '{}'::jsonb;
    k text;
    verb text := case tg_op when 'INSERT' then 'created' when 'UPDATE' then 'updated' else 'deleted' end;
  begin
    if tg_op = 'UPDATE' then
      for k in select jsonb_object_keys(n) loop
        if k not in ('created_at', 'updated_at', 'position') and (n -> k) is distinct from (o -> k) then
          diff := diff || jsonb_build_object(k, jsonb_build_array(o -> k, n -> k));
        end if;
      end loop;
      if diff = '{}'::jsonb then return new; end if;   -- nothing meaningful changed
    end if;
    insert into change_log (entity_type, entity_id, actor, action, subject, changes)
    values (
      case kind when 'requirement' then 'event' when 'contribution' then 'idea' else kind end,
      case kind when 'requirement' then coalesce(n ->> 'event_id', o ->> 'event_id')
                when 'contribution' then coalesce(n ->> 'idea_id', o ->> 'idea_id')
                else coalesce(n ->> 'id', o ->> 'id') end,
      auth.uid(),
      case kind when 'requirement' then 'requirement ' || verb when 'contribution' then 'contribution ' || verb else verb end,
      coalesce(n ->> 'title', o ->> 'title', n ->> 'name', o ->> 'name', ''),
      diff);
    return coalesce(new, old);
  end $$;

create trigger ideas_history        after insert or update or delete on public.ideas              for each row execute function public.log_change('idea');
create trigger events_history       after insert or update or delete on public.events             for each row execute function public.log_change('event');
create trigger requirements_history after insert or update or delete on public.event_requirements for each row execute function public.log_change('requirement');
create trigger startups_history     after insert or update or delete on public.startups           for each row execute function public.log_change('startup');
create trigger contributions_history after insert or delete         on public.idea_comments      for each row execute function public.log_change('contribution');

-- Members read the history of what they can see; startups' history only with the directory. Nobody edits it.
alter table public.change_log enable row level security;
create policy change_log_read on public.change_log for select
  using (is_member() and (entity_type <> 'startup' or has_section('startups') or is_admin()));
revoke all on public.change_log from anon;
grant select on public.change_log to authenticated;
grant all on public.change_log to service_role;
grant usage, select on sequence public.change_log_id_seq to service_role;
