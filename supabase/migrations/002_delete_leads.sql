-- LocalLead V2: bulk delete. Run once in the Supabase SQL editor after 001.
-- Keys of removed leads, so a new search never proposes the same place again.
create table if not exists public.dismissed_keys (user_id uuid not null references auth.users(id) on delete cascade, key text not null, created_at timestamptz not null default now(), primary key(user_id,key));
alter table public.dismissed_keys enable row level security;
drop policy if exists dismissed_owner on public.dismissed_keys;
create policy dismissed_owner on public.dismissed_keys for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant select,insert,delete on public.dismissed_keys to authenticated;

-- Opt-outs and leads with contact history are never deleted: their records must survive.
create or replace function public.delete_leads(p_ids uuid[], p_remember boolean default true)
returns uuid[] language plpgsql security invoker set search_path = '' as $$
declare doomed uuid[];
begin
 if auth.uid() is null then raise exception 'Unauthorized'; end if;
 select coalesce(array_agg(l.id), '{}') into doomed from public.leads l
 where l.user_id = auth.uid() and l.id = any(p_ids) and not l.do_not_contact
  and l.status not in ('contacted','seen','replied_positive','replied_negative','no_reply','not_interested')
  and not exists(select 1 from public.lead_events e where e.lead_id = l.id and e.event_type in ('contacted','do_not_contact'));
 if p_remember then
  insert into public.dismissed_keys(user_id,key)
  select auth.uid(), k.key from public.lead_keys k where k.user_id = auth.uid() and k.lead_id = any(doomed)
  on conflict do nothing;
 end if;
 delete from public.leads where user_id = auth.uid() and id = any(doomed);
 return doomed;
end; $$;
revoke all on function public.delete_leads(uuid[],boolean) from public,anon;
grant execute on function public.delete_leads(uuid[],boolean) to authenticated;
