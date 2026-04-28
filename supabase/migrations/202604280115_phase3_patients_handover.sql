-- Phase 3: Patient management and bed assignments

create table if not exists public.patients (
  id uuid primary key default gen_random_uuid(),
  patient_number text unique not null,
  name text not null,
  bed_number text not null,
  priority text default 'stable' check (priority in ('critical', 'moderate', 'stable')),
  is_active boolean default true,
  admission_date date default current_date,
  discharge_date date,
  admitted_by uuid references public.staff_users(id),
  created_at timestamptz default now()
);

create table if not exists public.bed_assignments (
  id uuid primary key default gen_random_uuid(),
  dept_id uuid references public.departments(id),
  assigned_user_id uuid references public.staff_users(id),
  bed_range_start text not null,
  bed_range_end text not null,
  assigned_at timestamptz default now(),
  assigned_by uuid references public.staff_users(id)
);

insert into public.permissions (code, name, description)
values
  ('manage_patients', 'Manage patients', 'Can admit/discharge patients and view patient operations'),
  ('update_patient_priority', 'Update patient priority', 'Can change patient criticality level'),
  ('manage_users', 'Manage users and handover', 'Can assign beds and run handovers')
on conflict (code) do nothing;

insert into public.department_permissions (department_id, permission_id)
select d.id, p.id
from public.departments d
join public.permissions p on p.code in ('manage_patients', 'update_patient_priority', 'manage_users')
where d.code = 'admin'
on conflict do nothing;

alter table public.patients enable row level security;
alter table public.bed_assignments enable row level security;

drop policy if exists "patients_manage" on public.patients;
create policy "patients_manage" on public.patients
for all using (public.has_permission(auth.uid(), 'manage_patients'))
with check (public.has_permission(auth.uid(), 'manage_patients'));

drop policy if exists "bed_assignments_manage" on public.bed_assignments;
create policy "bed_assignments_manage" on public.bed_assignments
for all using (public.has_permission(auth.uid(), 'manage_users'))
with check (public.has_permission(auth.uid(), 'manage_users'));

drop trigger if exists trg_audit_patients on public.patients;
create trigger trg_audit_patients
after insert or update or delete on public.patients
for each row execute function public.audit_trigger_generic();

drop trigger if exists trg_audit_bed_assignments on public.bed_assignments;
create trigger trg_audit_bed_assignments
after insert or update or delete on public.bed_assignments
for each row execute function public.audit_trigger_generic();
