-- LocalLead V3: public site previews. Run once in the Supabase SQL editor after 002.
-- Only public facts about the venue live here; notes, scores and drafts never do.
create table if not exists public.site_previews (
 slug text primary key check (slug ~ '^[a-z0-9]{10,32}$'),
 lead_id uuid not null unique references public.leads(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 content jsonb not null default '{}',
 views integer not null default 0,
 last_viewed_at timestamptz,
 created_at timestamptz not null default now(),
 expires_at timestamptz not null default now() + interval '60 days'
);
alter table public.site_previews enable row level security;
drop policy if exists site_previews_owner on public.site_previews;
create policy site_previews_owner on public.site_previews for all to authenticated
 using (user_id = (select auth.uid()) and exists(select 1 from public.leads l where l.id = lead_id and l.user_id = (select auth.uid())))
 with check (user_id = (select auth.uid()) and exists(select 1 from public.leads l where l.id = lead_id and l.user_id = (select auth.uid())));
grant select,insert,update,delete on public.site_previews to authenticated;
revoke all on public.site_previews from anon;

-- The only public way in is the secret link. Expired links, opt-outs and closed
-- venues return nothing. Visits by the owner are not counted.
create or replace function public.site_preview(p_slug text, p_count boolean default true)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare p public.site_previews; l public.leads; prefs jsonb;
begin
 select * into p from public.site_previews where slug = p_slug and expires_at > now();
 if not found then return null; end if;
 select * into l from public.leads where id = p.lead_id;
 if not found or l.do_not_contact or coalesce((l.analysis->>'permanently_closed')::boolean, false) then return null; end if;
 select preferences into prefs from public.profiles where id = p.user_id;
 if p_count and auth.uid() is distinct from p.user_id then
  update public.site_previews set views = views + 1, last_viewed_at = now() where slug = p.slug;
 end if;
 return jsonb_build_object(
  'content', p.content,
  'place_id', l.place_id,
  'sender', jsonb_build_object(
   'name', coalesce(prefs->>'sender_name', ''),
   'phone', coalesce(prefs->>'sender_phone', ''),
   'price', coalesce((prefs->>'site_price')::int, 200)));
end; $$;
revoke all on function public.site_preview(text,boolean) from public;
grant usage on schema public to anon;
grant execute on function public.site_preview(text,boolean) to anon, authenticated;
