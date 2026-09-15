-- Optional smoke test in a development Supabase project; all fixtures roll back.
begin;
insert into auth.users(id,email) values ('00000000-0000-4000-8000-000000000011','locallead-test-a@example.com'),('00000000-0000-4000-8000-000000000012','locallead-test-b@example.com');
insert into public.leads(id,user_id,name,city,category,status) values ('00000000-0000-4000-8000-000000000013','00000000-0000-4000-8000-000000000011','RLS test','Test','Pizzeria','new');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000012',true);
do $$ begin
 if exists(select 1 from public.leads where id='00000000-0000-4000-8000-000000000013') then raise exception 'RLS FAILED: another user can read the lead'; end if;
 begin
  insert into public.lead_events(id,lead_id,event_type,notes) values(gen_random_uuid(),'00000000-0000-4000-8000-000000000013','contacted','forbidden');
  raise exception 'RLS FAILED: another user can insert an event';
 exception when insufficient_privilege then null; end;
end $$;
rollback;
