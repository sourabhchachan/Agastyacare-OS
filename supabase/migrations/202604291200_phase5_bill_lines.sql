-- Phase 5: Bill lines, financial access

insert into public.permissions (code, name, description)
values
  (
    'access_financial_data',
    'Access financial data',
    'View billing, costs, and export financial reports'
  )
on conflict (code) do nothing;

insert into public.department_permissions (department_id, permission_id)
select d.id, p.id
from public.departments d
join public.permissions p on p.code in ('access_financial_data')
where d.code = 'admin'
on conflict do nothing;

create table if not exists public.bill_lines (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid references public.patients (id) on delete set null,
  instance_id uuid not null unique references public.item_instances (id) on delete cascade,
  catalogue_item_id uuid not null references public.item_catalogue (id),
  quantity integer not null default 1,
  unit_cost_at_order numeric(10,2) not null,
  ordered_by uuid references public.staff_users (id) on delete set null,
  order_date date not null default current_date,
  order_time text not null default to_char (clock_timestamp()::time, 'HH24MI'),
  dispatched_by uuid references public.staff_users (id) on delete set null,
  dispatch_date date,
  dispatch_time text,
  received_by uuid references public.staff_users (id) on delete set null,
  receive_date date,
  receive_time text,
  status text not null default 'ordered' check (status in ('ordered', 'dispatched', 'received', 'cancelled', 'not_done')),
  cancellation_remarks text,
  created_at timestamptz not null default now()
);

create index if not exists bill_lines_patient
  on public.bill_lines (patient_id, order_date desc);

create index if not exists bill_lines_order_date
  on public.bill_lines (order_date desc, status);

create index if not exists bill_lines_status
  on public.bill_lines (status);

create index if not exists bill_lines_catalogue
  on public.bill_lines (catalogue_item_id);

alter table public.bill_lines enable row level security;
-- All access is via service role in API; optional policy could allow financial role via JWT.

drop trigger if exists trg_audit_bill_lines on public.bill_lines;
create trigger trg_audit_bill_lines
after insert or update or delete on public.bill_lines
for each row execute function public.audit_trigger_generic ();
