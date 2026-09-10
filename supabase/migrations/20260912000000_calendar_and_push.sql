-- Rocket — real Google Calendar invites and phone (push) notifications.
-- Run after the first two migrations.

-- ─────────────────────────────────────────────────────────────
-- Google Calendar
-- The club's Google account is connected once by the Executive Assistant (OAuth).
-- Its tokens live in google_tokens, which no browser can read — only the
-- google-calendar Edge Function (service role) touches it.
-- ─────────────────────────────────────────────────────────────
alter table public.meetings add column google_event_id text;

alter table public.calendar_settings
  add column connected_at timestamptz,
  add column connected_by uuid references public.profiles(id) on delete set null;

-- the connection is now written only by the google-calendar function
drop policy calendar_update on public.calendar_settings;

create table public.google_tokens (
  id            int primary key default 1 check (id = 1),
  email         text not null default '',
  refresh_token text not null,
  access_token  text,
  expires_at    timestamptz
);
alter table public.google_tokens enable row level security;   -- no policies on purpose

create table public.oauth_states (
  state      text primary key,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  expires_at timestamptz not null
);
alter table public.oauth_states enable row level security;    -- no policies on purpose

revoke all on public.google_tokens, public.oauth_states from anon, authenticated;
grant all on public.google_tokens, public.oauth_states to service_role;

-- ─────────────────────────────────────────────────────────────
-- Push notifications: one row per device that turned notifications on
-- ─────────────────────────────────────────────────────────────
create table public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  user_agent text not null default '',
  created_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
create policy push_read   on public.push_subscriptions for select using (user_id = auth.uid());
create policy push_delete on public.push_subscriptions for delete using (user_id = auth.uid());
revoke all on public.push_subscriptions from anon;
grant select, delete on public.push_subscriptions to authenticated;
grant all on public.push_subscriptions to service_role;

-- Registers this device for the signed-in member. A shared device moves to whoever turned it on last.
create function public.register_push(p_endpoint text, p_p256dh text, p_auth text, p_user_agent text default '')
  returns void language plpgsql security definer set search_path = public
  as $$
  begin
    if not is_member() then raise exception 'Sign in to turn on notifications'; end if;
    if p_endpoint !~* '^https://' then raise exception 'Invalid push endpoint'; end if;
    delete from push_subscriptions where endpoint = p_endpoint;
    insert into push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
    values (auth.uid(), p_endpoint, p_p256dh, p_auth, left(coalesce(p_user_agent, ''), 200));
  end $$;

create function public.unregister_push(p_endpoint text) returns void
  language sql security definer set search_path = public
  as $$ delete from push_subscriptions where endpoint = p_endpoint and user_id = auth.uid() $$;

revoke all on function public.register_push(text, text, text, text), public.unregister_push(text) from public, anon;
grant execute on function public.register_push(text, text, text, text), public.unregister_push(text) to authenticated;
