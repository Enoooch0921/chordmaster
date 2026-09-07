\set ON_ERROR_STOP on

-- Run against a disposable local Supabase database after all migrations.
begin;

create or replace function pg_temp.assert_true(p_condition boolean, p_message text)
returns void
language plpgsql
as $$
begin
  if coalesce(p_condition, false) is not true then
    raise exception 'ASSERTION FAILED: %', p_message;
  end if;
end;
$$;

select pg_temp.assert_true(
  not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
    where n.nspname = 'public'
      and p.prosecdef
      and acl.grantee = 0
      and acl.privilege_type = 'EXECUTE'
  ),
  'SECURITY DEFINER routines must not grant EXECUTE to PUBLIC'
);

select pg_temp.assert_true(
  not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and has_function_privilege('anon', p.oid, 'EXECUTE')
  ),
  'SECURITY DEFINER routines must not be executable by anon'
);

select pg_temp.assert_true(
  not exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
      and not c.relrowsecurity
      and not exists (
        select 1
        from pg_depend d
        where d.classid = 'pg_class'::regclass
          and d.objid = c.oid
          and d.deptype = 'e'
      )
  ),
  'all application tables exposed through the public Data API schema must enable RLS'
);

select pg_temp.assert_true(
  has_function_privilege('authenticated', 'public.get_user_libraries()', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.get_notifications()', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.get_my_team_invites()', 'EXECUTE'),
  'authenticated must retain explicit access to application RPCs'
);

create function public.__security_definer_acl_probe()
returns boolean
language sql
security definer
set search_path = ''
as $$ select true $$;

select pg_temp.assert_true(
  not has_function_privilege('anon', 'public.__security_definer_acl_probe()', 'EXECUTE'),
  'default privileges must keep newly created SECURITY DEFINER routines private'
);

rollback;

\echo 'security_definer_acl.sql: all assertions passed'
