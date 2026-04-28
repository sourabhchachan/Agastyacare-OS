-- Fix: permission RPCs must bypass RLS recursion for admin access checks
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
