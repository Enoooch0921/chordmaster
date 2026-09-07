-- SECURITY DEFINER routines run with their owner's privileges, so PostgreSQL's
-- default EXECUTE grant to PUBLIC is unsafe even when the routine checks auth.uid().
-- Preserve every explicit role grant while removing implicit anonymous access.
do $$
declare
  v_routine record;
begin
  for v_routine in
    select
      case when p.prokind = 'p' then 'procedure' else 'function' end as routine_kind,
      format(
        '%I.%I(%s)',
        n.nspname,
        p.proname,
        pg_get_function_identity_arguments(p.oid)
      ) as routine_signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
  loop
    execute format('revoke all privileges on %s %s from public', v_routine.routine_kind, v_routine.routine_signature);
    execute format('revoke all privileges on %s %s from anon', v_routine.routine_kind, v_routine.routine_signature);
  end loop;
end;
$$;

-- Functions created by later migrations should start private. A migration that
-- intentionally exposes an RPC must grant EXECUTE to authenticated explicitly.
alter default privileges in schema public revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from anon;
