-- Rocket — assigning follow-ups, and a website for each startup.
--
-- 1. Follow-ups: anyone can now give a task to someone else, not just leadership, and the assignee can
--    be changed afterwards. A task is editable by the person who created it, the person it's assigned to,
--    and leadership. Everyone involved can see it.
-- 2. Notifications: any member can notify the person they just assigned work to (it was Executive
--    Assistant only, because notifications used to mean meeting invitations).
-- 3. Startups: a website address.
-- Run after the earlier migrations.

alter table public.tasks add column if not exists created_by uuid references public.profiles(id) on delete set null;
update public.tasks set created_by = owner where created_by is null;   -- existing follow-ups: the owner added them

drop policy if exists tasks_read   on public.tasks;
drop policy if exists tasks_insert on public.tasks;
drop policy if exists tasks_update on public.tasks;

-- the owner, whoever assigned it, and leadership
create policy tasks_read   on public.tasks for select
  using (is_oversight() or (is_member() and (owner = auth.uid() or created_by = auth.uid())));
create policy tasks_insert on public.tasks for insert
  with check (is_member() and (created_by is null or created_by = auth.uid()));
create policy tasks_update on public.tasks for update
  using (is_oversight() or (is_member() and (owner = auth.uid() or created_by = auth.uid())))
  with check (is_oversight() or (is_member() and (owner = auth.uid() or created_by = auth.uid())));

-- Members may only add a follow-up in their own name, and can't rewrite who created one.
create function public.tasks_guard() returns trigger
  language plpgsql security invoker set search_path = public
  as $$
  begin
    if auth.uid() is null or current_user in ('postgres', 'service_role', 'supabase_admin') then return new; end if;
    if tg_op = 'INSERT' then
      new.created_by := coalesce(new.created_by, auth.uid());
      if new.created_by is distinct from auth.uid() then raise exception 'A follow-up is recorded against the person who adds it'; end if;
    elsif new.created_by is distinct from old.created_by then
      raise exception 'The person who created a follow-up doesn’t change';
    end if;
    return new;
  end $$;
create trigger tasks_guard before insert or update on public.tasks for each row execute function public.tasks_guard();

-- Telling someone they've been given work is no longer an Executive-Assistant-only action, and the log
-- now carries follow-ups as well as meeting invitations.
drop policy if exists notifications_insert on public.notifications;
create policy notifications_insert on public.notifications for insert with check (is_member());

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in ('invite', 'update', 'cancel', 'task'));

alter table public.startups add column if not exists website text not null default '';
