-- Rocket — the Overview headlines, editable in Admin → Headlines.
-- [{"t": "the line", "by": "who said it (optional)"}, …]   null = the built-in list in the app.
-- Only admins can change app_settings (existing policy), and every member reads it.
alter table public.app_settings add column if not exists taglines jsonb;
