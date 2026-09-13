-- Rocket — ideas: the owner is locked, only the owner or an admin deletes, and the owner and
-- collaborators can add contributions (a thread of mini sub-ideas). Run after the earlier migrations.

-- ─────────────────────────────────────────────────────────────
-- Owner is locked. New ideas are owned by whoever submits them.
-- If the owner's account is removed (owner becomes null), an admin may assign a new owner.
-- ─────────────────────────────────────────────────────────────
drop policy ideas_insert on public.ideas;
create policy ideas_insert on public.ideas for insert with check (is_member() and owner = auth.uid());

drop policy ideas_update on public.ideas;
create policy ideas_update on public.ideas for update
  using (is_admin() or is_oversight() or (is_member() and (owner = auth.uid() or auth.uid() = any(assigned))))
  with check (is_member());

create function public.ideas_guard() returns trigger
  language plpgsql security invoker set search_path = public
  as $$
  begin
    if auth.uid() is null or current_user in ('postgres', 'service_role', 'supabase_admin') then return new; end if;
    if new.owner is distinct from old.owner and not (old.owner is null and is_admin()) then
      raise exception 'An idea’s owner can’t be changed';
    end if;
    return new;
  end $$;
create trigger ideas_guard before update on public.ideas
  for each row execute function public.ideas_guard();

-- Only the owner or an admin deletes an idea.
drop policy ideas_delete on public.ideas;
create policy ideas_delete on public.ideas for delete
  using (is_admin() or (is_member() and owner = auth.uid()));

-- ─────────────────────────────────────────────────────────────
-- Contributions: owner + collaborators post; every member reads;
-- the author, the idea owner or an admin deletes.
-- ─────────────────────────────────────────────────────────────
create table public.idea_comments (
  id         text primary key default gen_random_uuid()::text,
  idea_id    text not null references public.ideas(id) on delete cascade,
  author     uuid references public.profiles(id) on delete set null,
  title      text not null default '' check (length(title) <= 120),
  body       text not null check (length(trim(body)) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index idea_comments_idea on public.idea_comments (idea_id, created_at);

create function public.is_idea_member(iid text) returns boolean
  language sql stable security definer set search_path = public
  as $$ select exists (select 1 from ideas i where i.id = iid and is_member() and (i.owner = auth.uid() or auth.uid() = any(i.assigned))) $$;
create function public.is_idea_owner(iid text) returns boolean
  language sql stable security definer set search_path = public
  as $$ select exists (select 1 from ideas i where i.id = iid and is_member() and i.owner = auth.uid()) $$;

alter table public.idea_comments enable row level security;
create policy idea_comments_read   on public.idea_comments for select using (is_member());
create policy idea_comments_insert on public.idea_comments for insert with check (author = auth.uid() and is_idea_member(idea_id));
create policy idea_comments_delete on public.idea_comments for delete
  using (is_member() and (author = auth.uid() or is_idea_owner(idea_id) or is_admin()));

revoke all on public.idea_comments from anon;
grant select, insert, delete on public.idea_comments to authenticated;
grant all on public.idea_comments to service_role;
