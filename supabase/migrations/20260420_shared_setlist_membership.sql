-- user_setlist_memberships: tracks which users have joined a shared setlist
create table if not exists public.user_setlist_memberships (
  user_id uuid not null references auth.users(id) on delete cascade,
  setlist_id text not null references public.setlists(id) on delete cascade,
  token_used text,
  joined_at timestamptz not null default now(),
  primary key (user_id, setlist_id)
);

create index if not exists user_setlist_memberships_user_idx
  on public.user_setlist_memberships(user_id);

-- user_setlist_capo_overrides: per-user capo overrides for individual setlist songs
create table if not exists public.user_setlist_capo_overrides (
  user_id uuid not null references auth.users(id) on delete cascade,
  setlist_song_id text not null references public.setlist_songs(id) on delete cascade,
  capo integer not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, setlist_song_id)
);

create index if not exists user_setlist_capo_overrides_user_idx
  on public.user_setlist_capo_overrides(user_id, setlist_song_id);

-- Helper: check whether the current user has a membership for a given setlist
create or replace function public.has_setlist_membership(target_setlist_id text)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.user_setlist_memberships
    where setlist_id = target_setlist_id
      and user_id = auth.uid()
  )
$$;

-- RPC (SECURITY DEFINER): join a shared setlist via its share token
-- Verifies the token is valid, then upserts the membership row.
create or replace function public.join_shared_setlist(p_token text)
returns text
language plpgsql
security definer
as $$
declare
  v_setlist_id text;
begin
  select resource_id into v_setlist_id
  from public.share_links
  where token = p_token
    and resource_type = 'setlist'
    and revoked_at is null
    and (expires_at is null or expires_at > now());

  if v_setlist_id is null then
    raise exception 'Invalid or expired share link';
  end if;

  insert into public.user_setlist_memberships (user_id, setlist_id, token_used)
  values (auth.uid(), v_setlist_id, p_token)
  on conflict (user_id, setlist_id) do nothing;

  return v_setlist_id;
end;
$$;

-- RLS for new tables
alter table public.user_setlist_memberships enable row level security;
alter table public.user_setlist_capo_overrides enable row level security;

drop policy if exists "usm_self_select" on public.user_setlist_memberships;
create policy "usm_self_select" on public.user_setlist_memberships
  for select using (user_id = auth.uid());

drop policy if exists "usm_self_delete" on public.user_setlist_memberships;
create policy "usm_self_delete" on public.user_setlist_memberships
  for delete using (user_id = auth.uid());

drop policy if exists "ucco_self_all" on public.user_setlist_capo_overrides;
create policy "ucco_self_all" on public.user_setlist_capo_overrides
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Allow joined members to read setlists they have joined
drop policy if exists "setlists_joined_member_select" on public.setlists;
create policy "setlists_joined_member_select" on public.setlists
  for select using (public.has_setlist_membership(id));

-- Allow joined members to read setlist_songs of their joined setlists
drop policy if exists "setlist_songs_joined_member_select" on public.setlist_songs;
create policy "setlist_songs_joined_member_select" on public.setlist_songs
  for select using (public.has_setlist_membership(setlist_id));

-- Allow joined members to read songs that appear in their joined setlists
drop policy if exists "songs_via_joined_setlist" on public.songs;
create policy "songs_via_joined_setlist" on public.songs
  for select using (
    exists (
      select 1
      from public.setlist_songs ss
      join public.user_setlist_memberships usm on usm.setlist_id = ss.setlist_id
      where ss.song_id = id
        and usm.user_id = auth.uid()
    )
  );
