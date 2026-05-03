-- Physical beds registry and link from patients

create table if not exists public.beds (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  ward text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index if not exists beds_name_lower on public.beds (lower(name));

alter table public.patients
  add column if not exists bed_id uuid references public.beds (id) on delete set null;

create index if not exists patients_bed_id_active on public.patients (bed_id) where is_active = true;

alter table public.beds enable row level security;

drop policy if exists "beds_select_staff" on public.beds;
create policy "beds_select_staff" on public.beds
for select to authenticated
using (
  public.has_permission(auth.uid(), 'manage_patients')
  or public.has_permission(auth.uid(), 'manage_users')
);

drop policy if exists "beds_insert_manage_users" on public.beds;
create policy "beds_insert_manage_users" on public.beds
for insert to authenticated
with check (public.has_permission(auth.uid(), 'manage_users'));

drop policy if exists "beds_update_manage_users" on public.beds;
create policy "beds_update_manage_users" on public.beds
for update to authenticated
using (public.has_permission(auth.uid(), 'manage_users'))
with check (public.has_permission(auth.uid(), 'manage_users'));

drop trigger if exists trg_audit_beds on public.beds;
create trigger trg_audit_beds
after insert or update or delete on public.beds
for each row execute function public.audit_trigger_generic();
