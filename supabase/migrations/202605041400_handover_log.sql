-- Task handover audit trail (batch transfers of item_instances)

create table if not exists public.handover_log (
  id uuid primary key default gen_random_uuid(),
  from_user_id uuid not null references public.staff_users (id),
  to_user_id uuid not null references public.staff_users (id),
  performed_by uuid references public.staff_users (id),
  instance_ids uuid[] not null,
  item_count integer not null,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists handover_log_created_at on public.handover_log (created_at desc);

alter table public.handover_log enable row level security;

drop policy if exists "handover_log_select_staff" on public.handover_log;
create policy "handover_log_select_staff" on public.handover_log
for select to authenticated
using (
  public.has_permission(auth.uid(), 'manage_patients')
  or public.has_permission(auth.uid(), 'manage_users')
);

drop trigger if exists trg_audit_handover_log on public.handover_log;
create trigger trg_audit_handover_log
after insert or update or delete on public.handover_log
for each row execute function public.audit_trigger_generic();
