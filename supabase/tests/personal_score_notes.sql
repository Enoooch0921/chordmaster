begin;
insert into auth.users (id, email) values
 ('fba99000-0000-4000-8000-000000000001', 'notes-test-a@example.invalid'),
 ('fba99000-0000-4000-8000-000000000002', 'notes-test-b@example.invalid');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'fba99000-0000-4000-8000-000000000001', true);
insert into public.personal_score_notes(owner_id,song_id,id,operation) values
 ('fba99000-0000-4000-8000-000000000001','private-notes-rls-test','fba99000-0000-4000-8000-000000000011',
 '{"id":"fba99000-0000-4000-8000-000000000011","strokes":[],"removed":[]}');
do $$ begin
 if (select count(*) from public.personal_score_notes where song_id='private-notes-rls-test') <> 1 then raise exception 'Own notes are unreadable'; end if;
end $$;
select set_config('request.jwt.claim.sub', 'fba99000-0000-4000-8000-000000000002', true);
do $$ begin
 if exists(select 1 from public.personal_score_notes where song_id='private-notes-rls-test') then raise exception 'Other-account notes leaked'; end if;
 begin
   insert into public.personal_score_notes(owner_id,song_id,id,operation) values
    ('fba99000-0000-4000-8000-000000000001','private-notes-rls-test','fba99000-0000-4000-8000-000000000012',
    '{"id":"fba99000-0000-4000-8000-000000000012","strokes":[],"removed":[]}');
   raise exception 'Could write another account';
 exception when insufficient_privilege then null; end;
 begin
   update public.personal_score_notes set owner_id='fba99000-0000-4000-8000-000000000002';
   raise exception 'Could mutate immutable operations';
 exception when insufficient_privilege then null; end;
end $$;
set local role anon;
do $$ begin
 begin
   perform 1 from public.personal_score_notes;
   raise exception 'Anonymous access was permitted';
 exception when insufficient_privilege then null; end;
end $$;
rollback;
