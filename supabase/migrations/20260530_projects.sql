-- Projects: a grouping layer above setlists. Each setlist can belong to at
-- most one project; setlists with no project show up under "Ungrouped".
-- Projects can themselves be archived to hide them (and their setlists) from
-- the default project list.

create table if not exists public.projects (
  id text primary key,
  library_id text not null references public.libraries(id) on delete cascade,
  name text not null,
  archived boolean not null default false,
  created_by uuid not null references auth.users(id) on delete restrict,
  updated_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists projects_library_id_idx on public.projects(library_id);

drop trigger if exists projects_set_updated_at on public.projects;
create trigger projects_set_updated_at
before update on public.projects
for each row execute function public.set_updated_at();

alter table public.projects enable row level security;

drop policy if exists "projects_member_select" on public.projects;
create policy "projects_member_select" on public.projects
for select using (public.can_read_library(library_id));

drop policy if exists "projects_editor_write" on public.projects;
create policy "projects_editor_write" on public.projects
for all using (public.can_write_library(library_id)) with check (public.can_write_library(library_id));

-- Attach setlists to projects via a nullable FK. On project deletion we set
-- the column to null so the setlist falls back to "Ungrouped" rather than
-- being deleted alongside the project.
alter table public.setlists
  add column if not exists project_id text references public.projects(id) on delete set null;

create index if not exists setlists_project_id_idx on public.setlists(project_id);
