-- Rocket — a general "Team Member" club role.
-- It sits alongside the existing roles and keeps every team exactly as it is. A Team Member gets the
-- shared sections (Overview, Calendar, Meetings, Events, Ideas, Deadlines, Notes, Schedules, Knowledge
-- Base) and none of the role-specific ones, unless an admin ticks more in Admin → Permissions.
--
-- Run this on its own: Postgres won't let a new enum value be added and used in the same transaction,
-- so if the SQL Editor complains, run just this statement in an empty query.
alter type public.club_role add value if not exists 'member';
