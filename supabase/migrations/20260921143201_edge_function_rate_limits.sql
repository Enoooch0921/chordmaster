create schema if not exists private;

revoke all on schema private from public;
revoke all on schema private from anon;
revoke all on schema private from authenticated;

create table if not exists private.edge_rate_limits (
  bucket text not null,
  subject_hash text not null,
  window_started_at timestamptz not null,
  request_count bigint not null check (request_count > 0),
  primary key (bucket, subject_hash)
);

comment on table private.edge_rate_limits is
  'Fixed-window counters used only by service-role Edge Functions.';

create or replace function public.consume_edge_rate_limit(
  p_bucket text,
  p_subject_hash text,
  p_max_requests integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_allowed boolean;
  v_now timestamptz := statement_timestamp();
begin
  if p_bucket is null
    or length(p_bucket) < 1
    or length(p_bucket) > 64
    or p_bucket !~ '^[a-z0-9:_-]+$'
    or p_subject_hash !~ '^[0-9a-f]{64}$'
    or p_max_requests < 1
    or p_max_requests > 10000
    or p_window_seconds < 1
    or p_window_seconds > 86400
  then
    raise exception 'Invalid rate limit parameters';
  end if;

  insert into private.edge_rate_limits (
    bucket,
    subject_hash,
    window_started_at,
    request_count
  )
  values (p_bucket, p_subject_hash, v_now, 1)
  on conflict (bucket, subject_hash) do update
  set
    window_started_at = case
      when private.edge_rate_limits.window_started_at
        <= v_now - make_interval(secs => p_window_seconds)
      then v_now
      else private.edge_rate_limits.window_started_at
    end,
    request_count = case
      when private.edge_rate_limits.window_started_at
        <= v_now - make_interval(secs => p_window_seconds)
      then 1
      else private.edge_rate_limits.request_count + 1
    end
  returning request_count <= p_max_requests into v_allowed;

  return v_allowed;
end;
$$;

revoke all on function public.consume_edge_rate_limit(text, text, integer, integer) from public;
revoke all on function public.consume_edge_rate_limit(text, text, integer, integer) from anon;
revoke all on function public.consume_edge_rate_limit(text, text, integer, integer) from authenticated;
grant execute on function public.consume_edge_rate_limit(text, text, integer, integer) to service_role;

comment on function public.consume_edge_rate_limit(text, text, integer, integer) is
  'Atomically consumes one request from a fixed-window Edge Function limit.';

notify pgrst, 'reload schema';
