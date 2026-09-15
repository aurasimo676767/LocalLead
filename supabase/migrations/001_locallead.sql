-- LocalLead V1: run once in the Supabase SQL editor.
create table public.profiles (id uuid primary key references auth.users(id) on delete cascade, email text not null default '', preferences jsonb not null default '{}', created_at timestamptz not null default now());
create table public.leads (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default '',
  slug text not null default '',
  category text not null default '',
  city text not null default '',
  address text not null default '',
  postal_code text not null default '',
  phone text not null default '',
  website_url text not null default '',
  facebook_url text not null default '',
  instagram_url text not null default '',
  menu_url text not null default '',
  maps_url text not null default '',
  place_id text not null default '',
  rating numeric,
  reviews_count integer not null default 0,
  latitude double precision,
  longitude double precision,
  opening_hours jsonb not null default '[]',
  website_status text not null default '',
  website_quality text not null default '',
  menu_status text not null default '',
  whatsapp_confidence text not null default '',
  main_problem text not null default '',
  opportunity text not null default '',
  ai_summary text not null default '',
  status text not null default '',
  notes text not null default '',
  lead_score integer not null default 0 check (lead_score between 0 and 100),
  confidence_score integer not null default 0 check (confidence_score between 0 and 100),
  do_not_contact boolean not null default false,
  analysis jsonb not null default '{}',
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.leads add constraint valid_status check (status in ('new','analyzing','shortlisted','ready_to_contact','contacted','seen','replied_positive','replied_negative','no_reply','not_interested','bad_lead','archived'));
create index leads_owner_score on public.leads(user_id, lead_score desc);
create table public.lead_sources (id uuid primary key, lead_id uuid not null references public.leads(id) on delete cascade, source_type text not null, url text not null, confidence numeric not null check(confidence between 0 and 1), metadata_json jsonb not null default '{}', created_at timestamptz not null default now());
create table public.messages (id uuid primary key, lead_id uuid not null references public.leads(id) on delete cascade, message_type text not null, text text not null, model text not null, created_at timestamptz not null default now());
create table public.lead_events (id uuid primary key, lead_id uuid not null references public.leads(id) on delete cascade, event_type text not null, notes text not null default '', channel text, created_at timestamptz not null default now());
create table public.lead_keys (user_id uuid not null references auth.users(id) on delete cascade, key text not null, lead_id uuid not null references public.leads(id) on delete cascade, primary key(user_id,key));
create table public.rate_limits (user_id uuid not null references auth.users(id) on delete cascade, bucket text not null, window_start timestamptz not null, hits integer not null, primary key(user_id,bucket));
alter table public.profiles enable row level security;
alter table public.leads enable row level security;
alter table public.lead_sources enable row level security;
alter table public.messages enable row level security;
alter table public.lead_events enable row level security;
alter table public.lead_keys enable row level security;
alter table public.rate_limits enable row level security;
create policy profiles_owner on public.profiles for all to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy leads_owner on public.leads for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy keys_owner on public.lead_keys for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy lead_sources_owner on public.lead_sources for all to authenticated using (exists(select 1 from public.leads l where l.id = lead_id and l.user_id = (select auth.uid()))) with check (exists(select 1 from public.leads l where l.id = lead_id and l.user_id = (select auth.uid())));
create index lead_sources_lead on public.lead_sources(lead_id);
create policy messages_owner on public.messages for all to authenticated using (exists(select 1 from public.leads l where l.id = lead_id and l.user_id = (select auth.uid()))) with check (exists(select 1 from public.leads l where l.id = lead_id and l.user_id = (select auth.uid())));
create index messages_lead on public.messages(lead_id);
create policy lead_events_owner on public.lead_events for all to authenticated using (exists(select 1 from public.leads l where l.id = lead_id and l.user_id = (select auth.uid()))) with check (exists(select 1 from public.leads l where l.id = lead_id and l.user_id = (select auth.uid())));
create index lead_events_lead on public.lead_events(lead_id);
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = '' as $$
begin insert into public.profiles(id,email) values(new.id,coalesce(new.email,'')) on conflict(id) do nothing; return new; end; $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();
insert into public.profiles(id,email) select id,coalesce(email,'') from auth.users on conflict(id) do nothing;

-- Fixed server-side budgets, shared by all Vercel instances. No direct client write access.
create or replace function public.consume_rate(p_bucket text) returns boolean language plpgsql security definer set search_path = '' as $$
declare n integer; lim integer;
begin
 if auth.uid() is null then return false; end if;
 if p_bucket not in ('read','write','expensive') then return false; end if;
 lim := case p_bucket when 'read' then 120 when 'write' then 90 else 60 end;
 insert into public.rate_limits as r(user_id,bucket,window_start,hits) values(auth.uid(),p_bucket,now(),1)
 on conflict(user_id,bucket) do update set hits = case when r.window_start < now()-interval '1 minute' then 1 else r.hits+1 end,
 window_start = case when r.window_start < now()-interval '1 minute' then now() else r.window_start end returning hits into n;
 return n <= lim;
end; $$;
revoke all on function public.consume_rate(text) from public, anon;
grant execute on function public.consume_rate(text) to authenticated;

-- Atomic lead + provenance + history save. Persistent aliases also suppress rediscovery after edits.
create or replace function public.save_lead(p_lead jsonb, p_keys text[], p_expected timestamptz default null)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare r public.leads; existing public.leads; hit uuid; k text; item jsonb;
begin
 if auth.uid() is null or (p_lead->>'user_id')::uuid <> auth.uid() then raise exception 'Unauthorized'; end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 select * into r from jsonb_populate_record(null::public.leads,p_lead);
 select * into existing from public.leads where id=r.id;
 if found and p_expected is distinct from existing.updated_at then raise exception 'Conflict: reload the lead'; end if;
 foreach k in array p_keys loop
  select lead_id into hit from public.lead_keys where user_id=auth.uid() and key=k and lead_id<>r.id;
  if hit is not null then return jsonb_build_object('id',hit,'duplicate',true); end if;
 end loop;
 insert into public.leads select (r).* on conflict(id) do update set
 name=excluded.name,
 slug=excluded.slug,
 category=excluded.category,
 city=excluded.city,
 address=excluded.address,
 postal_code=excluded.postal_code,
 phone=excluded.phone,
 website_url=excluded.website_url,
 facebook_url=excluded.facebook_url,
 instagram_url=excluded.instagram_url,
 menu_url=excluded.menu_url,
 maps_url=excluded.maps_url,
 place_id=excluded.place_id,
 rating=excluded.rating,
 reviews_count=excluded.reviews_count,
 latitude=excluded.latitude,
 longitude=excluded.longitude,
 opening_hours=excluded.opening_hours,
 website_status=excluded.website_status,
 website_quality=excluded.website_quality,
 menu_status=excluded.menu_status,
 whatsapp_confidence=excluded.whatsapp_confidence,
 main_problem=excluded.main_problem,
 opportunity=excluded.opportunity,
 ai_summary=excluded.ai_summary,
 status=excluded.status,
 notes=excluded.notes,
 lead_score=excluded.lead_score,
 confidence_score=excluded.confidence_score,
 do_not_contact=excluded.do_not_contact,
 analysis=excluded.analysis,
 is_demo=excluded.is_demo,
 updated_at=excluded.updated_at;
 foreach k in array p_keys loop
  insert into public.lead_keys(user_id,key,lead_id) values(auth.uid(),k,r.id) on conflict do nothing;
 end loop;
 delete from public.lead_sources where lead_id=r.id;
 for item in select value from jsonb_array_elements(coalesce(p_lead->'sources','[]')) loop
  insert into public.lead_sources select * from jsonb_populate_record(null::public.lead_sources,item || jsonb_build_object('lead_id',r.id));
 end loop;
 -- History is append-only through this RPC.
 for item in select value from jsonb_array_elements(coalesce(p_lead->'messages','[]')) loop
  insert into public.messages select * from jsonb_populate_record(null::public.messages,item || jsonb_build_object('lead_id',r.id)) on conflict(id) do nothing;
 end loop;
 for item in select value from jsonb_array_elements(coalesce(p_lead->'events','[]')) loop
  insert into public.lead_events select * from jsonb_populate_record(null::public.lead_events,item || jsonb_build_object('lead_id',r.id)) on conflict(id) do nothing;
 end loop;
 return jsonb_build_object('id',r.id,'duplicate',false);
end; $$;
revoke all on function public.save_lead(jsonb,text[],timestamptz) from public,anon;
grant execute on function public.save_lead(jsonb,text[],timestamptz) to authenticated;
grant usage on schema public to authenticated;
grant select,insert,update,delete on public.profiles,public.leads,public.lead_sources,public.messages,public.lead_events,public.lead_keys to authenticated;
revoke all on public.rate_limits from anon,authenticated;
