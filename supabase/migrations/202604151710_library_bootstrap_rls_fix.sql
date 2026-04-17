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

drop policy if exists "libraries_member_select" on public.libraries;
create policy "libraries_member_select" on public.libraries
for select using (owner_user_id = auth.uid() or public.can_read_library(id));

drop policy if exists "library_members_owner_write" on public.library_members;
create policy "library_members_owner_write" on public.library_members
for all using (public.is_library_owner(library_id)) with check (public.is_library_owner(library_id));
