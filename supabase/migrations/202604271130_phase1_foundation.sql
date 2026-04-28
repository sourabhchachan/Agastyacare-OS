-- Phase 1 Foundation: users, departments, permissions, audits
create extension if not exists "pgcrypto";

create table if not exists public.departments (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.permissions (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null,
  description text,
  created_at timestamptz not null default now()
);

create table if not exists public.department_permissions (
  department_id uuid not null references public.departments(id) on delete cascade,
  permission_id uuid not null references public.permissions(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (department_id, permission_id)
);

create table if not exists public.staff_users (
  id uuid primary key references auth.users(id) on delete cascade,
  staff_id char(10) unique not null,
  full_name text not null,
  phone text,
  is_active boolean not null default true,
  must_change_pin boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint staff_id_digits check (staff_id ~ '^[0-9]{10}$')
);

create table if not exists public.user_departments (
  user_id uuid not null references public.staff_users(id) on delete cascade,
  department_id uuid not null references public.departments(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, department_id)
);

create table if not exists public.audit_logs (
  id bigint generated always as identity primary key,
  actor_user_id uuid,
  event text not null,
  table_name text not null,
  record_id text,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.get_actor_user_id()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

create or replace function public.write_audit_log(
  p_event text,
  p_table_name text,
  p_record_id text,
  p_old_data jsonb,
  p_new_data jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.audit_logs (actor_user_id, event, table_name, record_id, old_data, new_data)
  values (public.get_actor_user_id(), p_event, p_table_name, p_record_id, p_old_data, p_new_data);
end;
$$;

drop trigger if exists trg_departments_updated_at on public.departments;
create trigger trg_departments_updated_at
before update on public.departments
for each row execute function public.set_updated_at();

drop trigger if exists trg_staff_users_updated_at on public.staff_users;
create trigger trg_staff_users_updated_at
before update on public.staff_users
for each row execute function public.set_updated_at();

create or replace function public.audit_trigger_generic()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.write_audit_log('created', tg_table_name, new.id::text, null, to_jsonb(new));
    return new;
  elsif tg_op = 'UPDATE' then
    perform public.write_audit_log('updated', tg_table_name, new.id::text, to_jsonb(old), to_jsonb(new));
    return new;
  elsif tg_op = 'DELETE' then
    perform public.write_audit_log('deleted', tg_table_name, old.id::text, to_jsonb(old), null);
    return old;
  end if;
  return null;
end;
$$;

create or replace function public.audit_trigger_user_departments()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_record_id text;
begin
  v_record_id := coalesce(new.user_id::text, old.user_id::text) || ':' || coalesce(new.department_id::text, old.department_id::text);

  if tg_op = 'INSERT' then
    perform public.write_audit_log('user_department_added', tg_table_name, v_record_id, null, to_jsonb(new));
    return new;
  elsif tg_op = 'DELETE' then
    perform public.write_audit_log('user_department_removed', tg_table_name, v_record_id, to_jsonb(old), null);
    return old;
  end if;

  return null;
end;
$$;

create or replace function public.audit_trigger_department_permissions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_record_id text;
begin
  v_record_id := coalesce(new.department_id::text, old.department_id::text) || ':' || coalesce(new.permission_id::text, old.permission_id::text);

  if tg_op = 'INSERT' then
    perform public.write_audit_log('department_permission_added', tg_table_name, v_record_id, null, to_jsonb(new));
    return new;
  elsif tg_op = 'DELETE' then
    perform public.write_audit_log('department_permission_removed', tg_table_name, v_record_id, to_jsonb(old), null);
    return old;
  end if;

  return null;
end;
$$;

drop trigger if exists trg_audit_departments on public.departments;
create trigger trg_audit_departments
after insert or update or delete on public.departments
for each row execute function public.audit_trigger_generic();

drop trigger if exists trg_audit_staff_users on public.staff_users;
create trigger trg_audit_staff_users
after insert or update or delete on public.staff_users
for each row execute function public.audit_trigger_generic();

drop trigger if exists trg_audit_user_departments on public.user_departments;
create trigger trg_audit_user_departments
after insert or delete on public.user_departments
for each row execute function public.audit_trigger_user_departments();

drop trigger if exists trg_audit_department_permissions on public.department_permissions;
create trigger trg_audit_department_permissions
after insert or delete on public.department_permissions
for each row execute function public.audit_trigger_department_permissions();

create or replace function public.has_permission(p_user_id uuid, p_permission_code text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_departments ud
    join public.department_permissions dp on dp.department_id = ud.department_id
    join public.permissions p on p.id = dp.permission_id
    join public.staff_users su on su.id = ud.user_id
    where ud.user_id = p_user_id
      and su.is_active = true
      and p.code = p_permission_code
  );
$$;

create or replace function public.current_user_permissions()
returns table (permission_code text)
language sql
stable
security definer
set search_path = public
as $$
  select distinct p.code
  from public.user_departments ud
  join public.department_permissions dp on dp.department_id = ud.department_id
  join public.permissions p on p.id = dp.permission_id
  join public.staff_users su on su.id = ud.user_id
  where ud.user_id = auth.uid()
    and su.is_active = true;
$$;

insert into public.permissions (code, name, description)
values
  ('admin.users.view', 'View users', 'Can view user list'),
  ('admin.users.manage', 'Manage users', 'Can create and activate/deactivate users'),
  ('admin.users.bulk_import', 'Bulk import users', 'Can upload users from excel'),
  ('admin.departments.view', 'View departments', 'Can view departments'),
  ('admin.departments.manage', 'Manage departments', 'Can create/update departments and permissions')
on conflict (code) do nothing;

insert into public.departments (code, name, description)
values
  ('admin', 'Administration', 'System and operational administration')
on conflict (code) do nothing;

insert into public.department_permissions (department_id, permission_id)
select d.id, p.id
from public.departments d
join public.permissions p on p.code like 'admin.%'
where d.code = 'admin'
on conflict do nothing;

alter table public.departments enable row level security;
alter table public.permissions enable row level security;
alter table public.department_permissions enable row level security;
alter table public.staff_users enable row level security;
alter table public.user_departments enable row level security;
alter table public.audit_logs enable row level security;

drop policy if exists "staff_users_select_self_or_admin" on public.staff_users;
create policy "staff_users_select_self_or_admin" on public.staff_users
for select using (
  auth.uid() = id
  or public.has_permission(auth.uid(), 'admin.users.view')
);

drop policy if exists "staff_users_update_self_or_admin" on public.staff_users;
create policy "staff_users_update_self_or_admin" on public.staff_users
for update using (
  auth.uid() = id
  or public.has_permission(auth.uid(), 'admin.users.manage')
)
with check (
  auth.uid() = id
  or public.has_permission(auth.uid(), 'admin.users.manage')
);

drop policy if exists "staff_users_insert_admin" on public.staff_users;
create policy "staff_users_insert_admin" on public.staff_users
for insert with check (
  public.has_permission(auth.uid(), 'admin.users.manage')
);

drop policy if exists "departments_view" on public.departments;
create policy "departments_view" on public.departments
for select using (
  public.has_permission(auth.uid(), 'admin.departments.view')
);

drop policy if exists "departments_manage" on public.departments;
create policy "departments_manage" on public.departments
for all using (
  public.has_permission(auth.uid(), 'admin.departments.manage')
)
with check (
  public.has_permission(auth.uid(), 'admin.departments.manage')
);

drop policy if exists "permissions_view" on public.permissions;
create policy "permissions_view" on public.permissions
for select using (
  public.has_permission(auth.uid(), 'admin.departments.view')
);

drop policy if exists "department_permissions_manage" on public.department_permissions;
create policy "department_permissions_manage" on public.department_permissions
for all using (
  public.has_permission(auth.uid(), 'admin.departments.manage')
)
with check (
  public.has_permission(auth.uid(), 'admin.departments.manage')
);

drop policy if exists "user_departments_view_self_or_admin" on public.user_departments;
create policy "user_departments_view_self_or_admin" on public.user_departments
for select using (
  user_id = auth.uid()
  or public.has_permission(auth.uid(), 'admin.users.view')
);

drop policy if exists "user_departments_manage_admin" on public.user_departments;
create policy "user_departments_manage_admin" on public.user_departments
for all using (
  public.has_permission(auth.uid(), 'admin.users.manage')
)
with check (
  public.has_permission(auth.uid(), 'admin.users.manage')
);

drop policy if exists "audit_logs_admin_view" on public.audit_logs;
create policy "audit_logs_admin_view" on public.audit_logs
for select using (
  public.has_permission(auth.uid(), 'admin.users.view')
  or public.has_permission(auth.uid(), 'admin.departments.view')
);
