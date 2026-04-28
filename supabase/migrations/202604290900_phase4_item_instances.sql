-- Phase 4: Item instances, checkpoint instances, raise_items, patient admitting department

alter table public.patients
  add column if not exists admitting_dept_id uuid references public.departments(id);

create table if not exists public.item_instances (
  id uuid primary key default gen_random_uuid(),
  catalogue_item_id uuid not null references public.item_catalogue(id),
  assigned_user_id uuid not null references public.staff_users(id),
  patient_id uuid references public.patients(id),
  status text not null default 'pending' check (status in ('pending', 'in_progress', 'completed', 'cancelled', 'not_done')),
  remarks text,
  due_at timestamptz not null,
  created_at timestamptz not null default now(),
  created_by uuid references public.staff_users(id),
  completed_at timestamptz,
  cancelled_by uuid references public.staff_users(id),
  catalogue_type text check (catalogue_type in ('recurring', 'triggered', 'facility'))
);

create table if not exists public.item_checkpoint_instances (
  id uuid primary key default gen_random_uuid(),
  instance_id uuid not null references public.item_instances(id) on delete cascade,
  step_number integer not null,
  actor_user_id uuid references public.staff_users(id),
  status text not null default 'pending' check (status in ('pending', 'completed')),
  actioned_date date,
  actioned_time text,
  proof_note text,
  created_at timestamptz not null default now()
);

create index if not exists item_instances_assigned_due
  on public.item_instances (assigned_user_id, due_at)
  where status in ('pending', 'in_progress');

create index if not exists item_instances_patient
  on public.item_instances (patient_id)
  where patient_id is not null;

create index if not exists item_checkpoint_instances_instance
  on public.item_checkpoint_instances (instance_id, step_number);

insert into public.permissions (code, name, description)
values ('raise_items', 'Raise items', 'Can raise triggered item instances')
on conflict (code) do nothing;

insert into public.department_permissions (department_id, permission_id)
select d.id, p.id
from public.departments d
join public.permissions p on p.code in ('raise_items')
where d.code = 'admin'
on conflict do nothing;

alter table public.item_instances enable row level security;
alter table public.item_checkpoint_instances enable row level security;

drop policy if exists "item_instances_select_assigned" on public.item_instances;
create policy "item_instances_select_assigned" on public.item_instances
for select using (auth.uid() = assigned_user_id);

drop policy if exists "item_checkpoint_instances_select" on public.item_checkpoint_instances;
create policy "item_checkpoint_instances_select" on public.item_checkpoint_instances
for select using (
  exists (
    select 1 from public.item_instances i
    where i.id = instance_id and i.assigned_user_id = auth.uid()
  )
);

-- Allow authenticated users to receive realtime; mutations via service role in API
drop policy if exists "item_instances_update_assigned" on public.item_instances;
create policy "item_instances_update_assigned" on public.item_instances
for update using (auth.uid() = assigned_user_id)
with check (auth.uid() = assigned_user_id);

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'item_instances'
  ) then
    alter publication supabase_realtime add table public.item_instances;
  end if;
exception
  when undefined_object then
    null;
end $$;

drop trigger if exists trg_audit_item_instances on public.item_instances;
create trigger trg_audit_item_instances
after insert or update or delete on public.item_instances
for each row execute function public.audit_trigger_generic();

drop trigger if exists trg_audit_item_checkpoint_instances on public.item_checkpoint_instances;
create trigger trg_audit_item_checkpoint_instances
after insert or update or delete on public.item_checkpoint_instances
for each row execute function public.audit_trigger_generic();
