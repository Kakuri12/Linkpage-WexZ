-- Run this once in Supabase: SQL Editor -> New query -> Run.
-- New counters begin at zero.
create table if not exists public.page_views (
  page_key text primary key,
  view_count bigint not null default 0 check (view_count >= 0),
  updated_at timestamptz not null default now()
);

insert into public.page_views (page_key, view_count)
values ('linkpage-wexz', 0)
on conflict (page_key) do nothing;

create or replace function public.increment_page_view(p_page_key text)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  new_count bigint;
begin
  insert into public.page_views as page_views (page_key, view_count)
  values (p_page_key, 1)
  on conflict (page_key) do update
    set view_count = page_views.view_count + 1,
        updated_at = now()
  returning view_count into new_count;

  return new_count;
end;
$$;

-- Visitors can run only the increment function. They cannot read or alter
-- the counter table directly with the public anon key.
revoke all on table public.page_views from anon, authenticated;
grant execute on function public.increment_page_view(text) to anon, authenticated;
