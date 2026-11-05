-- Personal handwriting is separate from every shared song/setlist payload.
-- Append-only operations preserve offline changes from multiple devices.
create table public.personal_score_notes (
  owner_id uuid not null references auth.users(id) on delete cascade,
  song_id text not null check (length(song_id) between 1 and 200),
  id uuid not null,
  operation jsonb not null check (coalesce((
    jsonb_typeof(operation) = 'object'
    and operation->>'id' = id::text
    and jsonb_typeof(operation->'strokes') = 'array'
    and jsonb_typeof(operation->'removed') = 'array'
    and octet_length(operation::text) <= 1000000
  ), false)),
  created_at timestamptz not null default now(),
  primary key (owner_id, song_id, id)
);
alter table public.personal_score_notes enable row level security;
revoke all on public.personal_score_notes from public, anon, authenticated;
grant select, insert on public.personal_score_notes to authenticated;
create policy "read own personal score notes" on public.personal_score_notes for select to authenticated
  using ((select auth.uid()) = owner_id);
create policy "write own personal score notes" on public.personal_score_notes for insert to authenticated
  with check ((select auth.uid()) = owner_id);
comment on table public.personal_score_notes is 'Private per-account handwriting; shared library roles never confer access.';
notify pgrst, 'reload schema';
