begin;

-- Account-dependent rules must not run for anonymous visitors.
alter policy projects_read_allowed on public.projects to authenticated;

drop policy if exists projects_public_read on public.projects;
create policy projects_public_read
on public.projects for select
to anon
using (is_public = true);

commit;

-- Check the same permissions used by a signed-out visitor.
begin;
set local role anon;
select id, title from public.projects where is_public = true limit 5;
rollback;
