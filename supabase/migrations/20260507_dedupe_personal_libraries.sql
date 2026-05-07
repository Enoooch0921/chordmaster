-- Ensure each account has one canonical personal library.
-- Duplicate personal libraries can happen when first-time account setup races
-- across tabs or sessions before a database uniqueness guard exists.

with ranked_personal_libraries as (
  select
    id,
    owner_user_id,
    row_number() over (
      partition by owner_user_id
      order by created_at asc, id asc
    ) as library_rank,
    first_value(id) over (
      partition by owner_user_id
      order by created_at asc, id asc
    ) as canonical_library_id
  from public.libraries
  where kind = 'personal'
),
duplicate_personal_libraries as (
  select id, canonical_library_id
  from ranked_personal_libraries
  where library_rank > 1
)
update public.songs s
set library_id = d.canonical_library_id
from duplicate_personal_libraries d
where s.library_id = d.id;

with ranked_personal_libraries as (
  select
    id,
    owner_user_id,
    row_number() over (
      partition by owner_user_id
      order by created_at asc, id asc
    ) as library_rank,
    first_value(id) over (
      partition by owner_user_id
      order by created_at asc, id asc
    ) as canonical_library_id
  from public.libraries
  where kind = 'personal'
),
duplicate_personal_libraries as (
  select id, canonical_library_id
  from ranked_personal_libraries
  where library_rank > 1
)
update public.setlists sl
set library_id = d.canonical_library_id
from duplicate_personal_libraries d
where sl.library_id = d.id;

with ranked_personal_libraries as (
  select
    id,
    owner_user_id,
    row_number() over (
      partition by owner_user_id
      order by created_at asc, id asc
    ) as library_rank
  from public.libraries
  where kind = 'personal'
),
duplicate_personal_libraries as (
  select id
  from ranked_personal_libraries
  where library_rank > 1
)
delete from public.library_members lm
using duplicate_personal_libraries d
where lm.library_id = d.id;

with ranked_personal_libraries as (
  select
    id,
    owner_user_id,
    row_number() over (
      partition by owner_user_id
      order by created_at asc, id asc
    ) as library_rank
  from public.libraries
  where kind = 'personal'
),
duplicate_personal_libraries as (
  select id
  from ranked_personal_libraries
  where library_rank > 1
)
delete from public.libraries l
using duplicate_personal_libraries d
where l.id = d.id;

create unique index if not exists libraries_one_personal_per_owner_idx
  on public.libraries(owner_user_id)
  where kind = 'personal';
