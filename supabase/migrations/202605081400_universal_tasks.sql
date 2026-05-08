-- Universal task system: standalone task table.
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  tags jsonb not null default '[]'::jsonb,
  framework_sop_id uuid references public.sop(id) on delete set null,
  patient_id uuid references public.patients(id) on delete set null,
  patient_ipd_number text,
  patient_bed_number text,
  assignee_user_id uuid not null references public.staff_users(id),
  created_by_user_id uuid not null references public.staff_users(id),
  updated_by_user_id uuid references public.staff_users(id),
  status text not null default 'pending',
  due_at timestamptz,
  priority text not null default 'medium',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tasks_status_check check (status in ('pending', 'in_progress', 'completed', 'cancelled')),
  constraint tasks_priority_check check (priority in ('low', 'medium', 'high', 'critical')),
  constraint tasks_tags_array_check check (jsonb_typeof(tags) = 'array')
);

create index if not exists tasks_assignee_status_due_idx
  on public.tasks (assignee_user_id, status, due_at);

create index if not exists tasks_creator_created_idx
  on public.tasks (created_by_user_id, created_at desc);

create index if not exists tasks_patient_idx
  on public.tasks (patient_id)
  where patient_id is not null;

create index if not exists tasks_framework_sop_idx
  on public.tasks (framework_sop_id)
  where framework_sop_id is not null;

create index if not exists tasks_tags_gin_idx
  on public.tasks using gin (tags);

alter table public.tasks enable row level security;

drop policy if exists "tasks_select_creator_or_assignee" on public.tasks;
create policy "tasks_select_creator_or_assignee"
on public.tasks
for select
using (auth.uid() = created_by_user_id or auth.uid() = assignee_user_id);

drop policy if exists "tasks_update_creator_or_assignee" on public.tasks;
create policy "tasks_update_creator_or_assignee"
on public.tasks
for update
using (auth.uid() = created_by_user_id or auth.uid() = assignee_user_id)
with check (auth.uid() = created_by_user_id or auth.uid() = assignee_user_id);

drop trigger if exists trg_audit_tasks on public.tasks;
create trigger trg_audit_tasks
after insert or update or delete on public.tasks
for each row execute function public.audit_trigger_generic();
