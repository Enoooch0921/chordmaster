create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text not null,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.libraries (
  id text primary key,
  name text not null,
  kind text not null check (kind in ('personal', 'team')),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.library_members (
  library_id text not null references public.libraries(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'editor', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (library_id, user_id)
);

create table if not exists public.songs (
  id text primary key,
  library_id text not null references public.libraries(id) on delete cascade,
  title text not null,
  content_json jsonb not null,
  client_legacy_id text,
  created_by uuid not null references auth.users(id) on delete restrict,
  updated_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists songs_library_id_idx on public.songs(library_id);
create index if not exists songs_client_legacy_id_idx on public.songs(client_legacy_id);

create table if not exists public.setlists (
  id text primary key,
  library_id text not null references public.libraries(id) on delete cascade,
  name text not null,
  display_mode text not null,
  show_lyrics boolean not null default false,
  client_legacy_id text,
  created_by uuid not null references auth.users(id) on delete restrict,
  updated_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists setlists_library_id_idx on public.setlists(library_id);
create index if not exists setlists_client_legacy_id_idx on public.setlists(client_legacy_id);

create table if not exists public.setlist_songs (
  id text primary key,
  setlist_id text not null references public.setlists(id) on delete cascade,
  song_id text not null references public.songs(id) on delete cascade,
  order_index integer not null default 0,
  override_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists setlist_songs_setlist_id_idx on public.setlist_songs(setlist_id);

create table if not exists public.share_links (
  id uuid primary key default gen_random_uuid(),
  resource_type text not null check (resource_type in ('song', 'setlist')),
  resource_id text not null,
  token text not null unique,
  created_by uuid not null references auth.users(id) on delete cascade,
  revoked_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists share_links_lookup_idx on public.share_links(resource_type, resource_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists libraries_set_updated_at on public.libraries;
create trigger libraries_set_updated_at
before update on public.libraries
for each row execute function public.set_updated_at();

drop trigger if exists songs_set_updated_at on public.songs;
create trigger songs_set_updated_at
before update on public.songs
for each row execute function public.set_updated_at();

drop trigger if exists setlists_set_updated_at on public.setlists;
create trigger setlists_set_updated_at
before update on public.setlists
for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.libraries enable row level security;
alter table public.library_members enable row level security;
alter table public.songs enable row level security;
alter table public.setlists enable row level security;
alter table public.setlist_songs enable row level security;
alter table public.share_links enable row level security;

create or replace function public.user_library_role(target_library_id text)
returns text
language sql
stable
as $$
  select lm.role
  from public.library_members lm
  where lm.library_id = target_library_id
    and lm.user_id = auth.uid()
  limit 1
$$;

create or replace function public.can_read_library(target_library_id text)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.library_members lm
    where lm.library_id = target_library_id
      and lm.user_id = auth.uid()
  )
$$;

create or replace function public.can_write_library(target_library_id text)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.library_members lm
    where lm.library_id = target_library_id
      and lm.user_id = auth.uid()
      and lm.role in ('owner', 'editor')
  )
$$;

create or replace function public.is_library_owner(target_library_id text)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.libraries l
    where l.id = target_library_id
      and l.owner_user_id = auth.uid()
  )
$$;

drop policy if exists "profiles_self_select" on public.profiles;
create policy "profiles_self_select" on public.profiles
for select using (auth.uid() = id);

drop policy if exists "profiles_self_write" on public.profiles;
create policy "profiles_self_write" on public.profiles
for all using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "libraries_member_select" on public.libraries;
create policy "libraries_member_select" on public.libraries
for select using (owner_user_id = auth.uid() or public.can_read_library(id));

drop policy if exists "libraries_owner_write" on public.libraries;
create policy "libraries_owner_write" on public.libraries
for all using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());

drop policy if exists "library_members_member_select" on public.library_members;
create policy "library_members_member_select" on public.library_members
for select using (public.can_read_library(library_id));

drop policy if exists "library_members_owner_write" on public.library_members;
create policy "library_members_owner_write" on public.library_members
for all using (public.is_library_owner(library_id)) with check (public.is_library_owner(library_id));

drop policy if exists "songs_member_select" on public.songs;
create policy "songs_member_select" on public.songs
for select using (public.can_read_library(library_id));

drop policy if exists "songs_editor_write" on public.songs;
create policy "songs_editor_write" on public.songs
for all using (public.can_write_library(library_id)) with check (public.can_write_library(library_id));

drop policy if exists "setlists_member_select" on public.setlists;
create policy "setlists_member_select" on public.setlists
for select using (public.can_read_library(library_id));

drop policy if exists "setlists_editor_write" on public.setlists;
create policy "setlists_editor_write" on public.setlists
for all using (public.can_write_library(library_id)) with check (public.can_write_library(library_id));

drop policy if exists "setlist_songs_member_select" on public.setlist_songs;
create policy "setlist_songs_member_select" on public.setlist_songs
for select using (
  exists (
    select 1
    from public.setlists s
    where s.id = setlist_id
      and public.can_read_library(s.library_id)
  )
);

drop policy if exists "setlist_songs_editor_write" on public.setlist_songs;
create policy "setlist_songs_editor_write" on public.setlist_songs
for all using (
  exists (
    select 1
    from public.setlists s
    where s.id = setlist_id
      and public.can_write_library(s.library_id)
  )
) with check (
  exists (
    select 1
    from public.setlists s
    where s.id = setlist_id
      and public.can_write_library(s.library_id)
  )
);

drop policy if exists "share_links_owner_select" on public.share_links;
create policy "share_links_owner_select" on public.share_links
for select using (created_by = auth.uid());

drop policy if exists "share_links_owner_write" on public.share_links;
create policy "share_links_owner_write" on public.share_links
for all using (created_by = auth.uid()) with check (created_by = auth.uid());
