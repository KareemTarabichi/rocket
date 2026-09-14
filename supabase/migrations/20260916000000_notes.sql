-- Rocket — collaborative notes. Private by default; the owner shares with people (edit or view)
-- or with the whole club. Saves are versioned so two people can't silently overwrite each other.
-- Run after the earlier migrations.

create table public.notes (
  id          text primary key default gen_random_uuid()::text,
  title       text not null default '' check (length(title) <= 200),
  body        text not null default '' check (length(body) <= 200000),   -- sanitised HTML
  owner       uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  editors     uuid[] not null default '{}',
  viewers     uuid[] not null default '{}',
  club_access text not null default 'none' check (club_access in ('none', 'view', 'edit')),
  version     int not null default 1,
  updated_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index notes_updated on public.notes (updated_at desc);

-- Every save bumps the version and records who/when. Only the owner changes who has access,
-- and nobody changes the owner.
create function public.notes_touch() returns trigger
  language plpgsql security invoker set search_path = public
  as $$
  begin
    new.version := old.version + 1;
    new.updated_at := now();
    new.updated_by := coalesce(auth.uid(), old.updated_by);
    if auth.uid() is null or current_user in ('postgres', 'service_role', 'supabase_admin') then return new; end if;
    if new.owner is distinct from old.owner then raise exception 'A note’s owner can’t be changed'; end if;
    if old.owner <> auth.uid() and (new.editors is distinct from old.editors or new.viewers is distinct from old.viewers
       or new.club_access is distinct from old.club_access) then
      raise exception 'Only the note’s owner can change who has access';
    end if;
    return new;
  end $$;
create trigger notes_touch before update on public.notes for each row execute function public.notes_touch();

alter table public.notes enable row level security;
create policy notes_read on public.notes for select using (
  is_member() and (owner = auth.uid() or auth.uid() = any(editors) or auth.uid() = any(viewers) or club_access in ('view', 'edit')));
create policy notes_insert on public.notes for insert with check (is_member() and owner = auth.uid());
create policy notes_update on public.notes for update
  using (is_member() and (owner = auth.uid() or auth.uid() = any(editors) or club_access = 'edit'))
  with check (is_member());
create policy notes_delete on public.notes for delete using (is_member() and (owner = auth.uid() or is_admin()));

revoke all on public.notes from anon;
grant select, insert, update, delete on public.notes to authenticated;
grant all on public.notes to service_role;

-- Live updates: changes to notes stream to the people who can read them.
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.notes;
  end if;
end $$;
