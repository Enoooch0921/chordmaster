-- Add an archived flag to setlists so owners/editors can hide setlists from the
-- default list without deleting them. Archive state syncs across devices.

alter table public.setlists
  add column if not exists archived boolean not null default false;
