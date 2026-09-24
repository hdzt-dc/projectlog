-- Run once in Supabase SQL Editor after projectlog_schema.sql.
-- Approved teachers may read the administrator's project work and comment on it.
-- They still cannot INSERT, UPDATE, or DELETE project work directly.

begin;

drop policy if exists projects_read_allowed on public.projects;
create policy projects_read_allowed
on public.projects for select
to anon, authenticated
using (
  is_public
  or assigned_to = auth.uid()
  or created_by = auth.uid()
  or public.is_admin()
  or (
    public.is_teacher()
    and exists (
      select 1 from public.profiles owner
      where owner.id = projects.assigned_to and owner.role = 'admin'
    )
  )
);

drop policy if exists comments_read_for_visible_project on public.project_comments;
create policy comments_read_for_visible_project
on public.project_comments for select
to anon, authenticated
using (
  exists (
    select 1 from public.projects p
    where p.id = project_comments.project_id
  )
);

drop policy if exists comments_insert_by_project_participant on public.project_comments;
create policy comments_insert_by_project_participant
on public.project_comments for insert
to authenticated
with check (
  author_id = auth.uid()
  and public.current_role() in ('admin', 'teacher')
  and exists (
    select 1 from public.projects p
    where p.id = project_comments.project_id
      and (p.assigned_to = auth.uid() or public.is_admin() or public.is_teacher())
  )
);

commit;
