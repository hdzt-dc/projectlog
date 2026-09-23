-- ProjectLog cloud schema
-- Owner/admin: hdzt_dc@outlook.com
-- Run this entire file once in Supabase SQL Editor.

begin;

create extension if not exists pgcrypto;

-- ---------- Shared helpers ----------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------- Accounts and roles ----------

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  display_name text not null default '',
  role text not null default 'pending'
    check (role in ('admin', 'teacher', 'pending')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  insert into public.profiles (id, email, display_name, role)
  values (
    new.id,
    lower(coalesce(new.email, '')),
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(coalesce(new.email, ''), '@', 1)),
    case
      when lower(coalesce(new.email, '')) = 'hdzt_dc@outlook.com' then 'admin'
      else 'pending'
    end
  )
  on conflict (id) do update
  set email = excluded.email,
      display_name = case
        when public.profiles.display_name = '' then excluded.display_name
        else public.profiles.display_name
      end,
      role = case
        when excluded.email = 'hdzt_dc@outlook.com' then 'admin'
        else public.profiles.role
      end,
      updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert or update of email on auth.users
for each row execute function public.handle_new_user();

-- Backfill users that existed before this script was installed.
insert into public.profiles (id, email, display_name, role)
select
  u.id,
  lower(coalesce(u.email, '')),
  coalesce(u.raw_user_meta_data ->> 'display_name', split_part(coalesce(u.email, ''), '@', 1)),
  case when lower(coalesce(u.email, '')) = 'hdzt_dc@outlook.com' then 'admin' else 'pending' end
from auth.users u
where u.email is not null
on conflict (id) do update
set email = excluded.email,
    role = case when excluded.email = 'hdzt_dc@outlook.com' then 'admin' else public.profiles.role end,
    updated_at = now();

create or replace function public.current_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select role from public.profiles where id = auth.uid()), 'anonymous');
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_role() = 'admin';
$$;

create or replace function public.is_teacher()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_role() = 'teacher';
$$;

-- A safe directory that never exposes email addresses.
create or replace view public.profile_directory
with (security_barrier = true)
as
select id, display_name, role
from public.profiles
where role in ('admin', 'teacher');

-- ---------- Assigned projects and student work ----------

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 160),
  requirements text not null default '' check (char_length(requirements) <= 20000),
  category text not null default '' check (char_length(category) <= 100),
  deadline date,
  status text not null default 'assigned'
    check (status in ('assigned', 'planning', 'in_progress', 'review', 'completed', 'archived')),
  created_by uuid not null references public.profiles(id) on delete restrict,
  assigned_to uuid not null references public.profiles(id) on delete restrict,
  work_data jsonb not null default '{}'::jsonb,
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists projects_created_by_idx on public.projects(created_by);
create index if not exists projects_assigned_to_idx on public.projects(assigned_to);
create index if not exists projects_updated_at_idx on public.projects(updated_at desc);

drop trigger if exists projects_set_updated_at on public.projects;
create trigger projects_set_updated_at
before update on public.projects
for each row execute function public.set_updated_at();

-- Teachers create an assignment through this function. It automatically assigns
-- the work to the ProjectLog administrator and does not grant the teacher UPDATE.
create or replace function public.create_assigned_project(
  p_title text,
  p_requirements text default '',
  p_category text default '',
  p_deadline date default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid;
  v_project_id uuid;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  if public.current_role() not in ('admin', 'teacher') then
    raise exception 'Only an approved teacher or administrator can create a project.';
  end if;

  if nullif(trim(p_title), '') is null then
    raise exception 'Project title is required.';
  end if;

  select id into v_admin_id
  from public.profiles
  where role = 'admin'
  order by created_at
  limit 1;

  if v_admin_id is null then
    raise exception 'ProjectLog administrator account has not been created yet.';
  end if;

  insert into public.projects (
    title, requirements, category, deadline, created_by, assigned_to
  ) values (
    trim(p_title), coalesce(p_requirements, ''), coalesce(p_category, ''),
    p_deadline, auth.uid(), v_admin_id
  )
  returning id into v_project_id;

  return v_project_id;
end;
$$;

-- ---------- Teacher annotations, replies and evaluations ----------

create table if not exists public.project_comments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  parent_id uuid references public.project_comments(id) on delete cascade,
  target_type text not null default 'project'
    check (target_type in ('project', 'requirements', 'stage', 'task', 'log', 'code', 'file', 'summary')),
  target_key text not null default '' check (char_length(target_key) <= 200),
  comment_type text not null default 'annotation'
    check (comment_type in ('annotation', 'reply', 'evaluation')),
  body text not null check (char_length(body) between 1 and 10000),
  rating smallint check (rating between 1 and 5),
  resolved boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint evaluation_rating_rule check (
    (comment_type = 'evaluation' and rating is not null)
    or (comment_type <> 'evaluation' and rating is null)
  )
);

create index if not exists project_comments_project_idx
  on public.project_comments(project_id, created_at);
create index if not exists project_comments_target_idx
  on public.project_comments(project_id, target_type, target_key);

drop trigger if exists comments_set_updated_at on public.project_comments;
create trigger comments_set_updated_at
before update on public.project_comments
for each row execute function public.set_updated_at();

-- ---------- Immutable revision archive ----------

create table if not exists public.project_revisions (
  id bigint generated by default as identity primary key,
  project_id uuid not null references public.projects(id) on delete cascade,
  editor_id uuid references public.profiles(id) on delete set null,
  snapshot jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists project_revisions_project_idx
  on public.project_revisions(project_id, created_at desc);

create or replace function public.archive_project_revision()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.work_data is distinct from new.work_data
     or old.status is distinct from new.status
     or old.is_public is distinct from new.is_public then
    insert into public.project_revisions (project_id, editor_id, snapshot)
    values (
      old.id,
      auth.uid(),
      jsonb_build_object(
        'title', old.title,
        'requirements', old.requirements,
        'category', old.category,
        'deadline', old.deadline,
        'status', old.status,
        'work_data', old.work_data,
        'is_public', old.is_public,
        'updated_at', old.updated_at
      )
    );
  end if;
  return new;
end;
$$;

drop trigger if exists projects_archive_revision on public.projects;
create trigger projects_archive_revision
before update on public.projects
for each row execute function public.archive_project_revision();

-- ---------- Admin actions ----------

create or replace function public.approve_teacher(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only the administrator can approve teachers.';
  end if;

  if p_user_id = auth.uid() then
    raise exception 'The administrator role cannot be changed.';
  end if;

  update public.profiles
  set role = 'teacher', updated_at = now()
  where id = p_user_id and role = 'pending';

  if not found then
    raise exception 'Pending user not found.';
  end if;
end;
$$;

create or replace function public.revoke_teacher(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only the administrator can revoke teacher access.';
  end if;

  update public.profiles
  set role = 'pending', updated_at = now()
  where id = p_user_id and role = 'teacher';
end;
$$;

create or replace function public.update_my_display_name(p_display_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  if nullif(trim(p_display_name), '') is null or char_length(trim(p_display_name)) > 80 then
    raise exception 'Display name must contain 1 to 80 characters.';
  end if;

  update public.profiles
  set display_name = trim(p_display_name), updated_at = now()
  where id = auth.uid();
end;
$$;

-- ---------- Row Level Security ----------

alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.project_comments enable row level security;
alter table public.project_revisions enable row level security;

drop policy if exists profiles_read_self_or_admin on public.profiles;
create policy profiles_read_self_or_admin
on public.profiles for select
to authenticated
using (id = auth.uid() or public.is_admin());

drop policy if exists projects_read_allowed on public.projects;
create policy projects_read_allowed
on public.projects for select
to anon, authenticated
using (
  is_public
  or assigned_to = auth.uid()
  or created_by = auth.uid()
  or public.is_admin()
);

drop policy if exists projects_admin_insert on public.projects;
create policy projects_admin_insert
on public.projects for insert
to authenticated
with check (public.is_admin() and assigned_to = auth.uid());

drop policy if exists projects_admin_update on public.projects;
create policy projects_admin_update
on public.projects for update
to authenticated
using (public.is_admin() and assigned_to = auth.uid())
with check (public.is_admin() and assigned_to = auth.uid());

drop policy if exists projects_admin_delete on public.projects;
create policy projects_admin_delete
on public.projects for delete
to authenticated
using (public.is_admin() and assigned_to = auth.uid());

drop policy if exists comments_read_for_visible_project on public.project_comments;
create policy comments_read_for_visible_project
on public.project_comments for select
to anon, authenticated
using (
  exists (
    select 1 from public.projects p
    where p.id = project_comments.project_id
      and (
        p.is_public
        or p.assigned_to = auth.uid()
        or p.created_by = auth.uid()
        or public.is_admin()
      )
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
      and (p.assigned_to = auth.uid() or p.created_by = auth.uid() or public.is_admin())
  )
);

drop policy if exists comments_update_own_or_admin on public.project_comments;
create policy comments_update_own_or_admin
on public.project_comments for update
to authenticated
using (author_id = auth.uid() or public.is_admin())
with check (
  public.is_admin()
  or (
    author_id = auth.uid()
    and exists (
      select 1 from public.projects p
      where p.id = project_comments.project_id
        and (p.assigned_to = auth.uid() or p.created_by = auth.uid())
    )
  )
);

drop policy if exists comments_delete_own_or_admin on public.project_comments;
create policy comments_delete_own_or_admin
on public.project_comments for delete
to authenticated
using (author_id = auth.uid() or public.is_admin());

drop policy if exists revisions_admin_read on public.project_revisions;
create policy revisions_admin_read
on public.project_revisions for select
to authenticated
using (public.is_admin());

-- ---------- API privileges ----------

revoke all on table public.profiles from anon, authenticated;
revoke all on table public.projects from anon, authenticated;
revoke all on table public.project_comments from anon, authenticated;
revoke all on table public.project_revisions from anon, authenticated;

grant select on public.profile_directory to authenticated;
grant select on public.profiles to authenticated;
grant select on public.projects to anon, authenticated;
grant insert, update, delete on public.projects to authenticated;
grant select on public.project_comments to anon, authenticated;
grant insert, update, delete on public.project_comments to authenticated;
grant select on public.project_revisions to authenticated;

grant execute on function public.current_role() to anon, authenticated;
grant execute on function public.is_admin() to anon, authenticated;
grant execute on function public.is_teacher() to anon, authenticated;
grant execute on function public.create_assigned_project(text, text, text, date) to authenticated;
grant execute on function public.approve_teacher(uuid) to authenticated;
grant execute on function public.revoke_teacher(uuid) to authenticated;
grant execute on function public.update_my_display_name(text) to authenticated;

-- Keep privileged helper functions unavailable to direct API calls.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.archive_project_revision() from public, anon, authenticated;
revoke execute on function public.set_updated_at() from public, anon, authenticated;

commit;

-- Verification: these queries should return four rows and the configured email.
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in ('profiles', 'projects', 'project_comments', 'project_revisions')
order by tablename;

select 'hdzt_dc@outlook.com' as configured_admin_email;
