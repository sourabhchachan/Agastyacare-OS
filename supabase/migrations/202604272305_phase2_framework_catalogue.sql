-- Phase 2: Operational framework and item catalogue

create table if not exists public.kra (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  created_at timestamptz default now()
);

create table if not exists public.kpi (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  measurement_unit text,
  kra_id uuid references public.kra(id) on delete cascade,
  created_at timestamptz default now()
);

create table if not exists public.sop (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  kpi_id uuid references public.kpi(id) on delete cascade,
  created_at timestamptz default now()
);

create table if not exists public.vendors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text,
  contact text,
  created_at timestamptz default now()
);

create table if not exists public.item_catalogue (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null check (type in ('recurring', 'triggered', 'facility')),
  frequency text not null,
  frequency_time text,
  frequency_day text,
  ordering_dept_id uuid references public.departments(id),
  dispatching_dept_id uuid references public.departments(id),
  vendor_id uuid references public.vendors(id),
  billing_flag boolean default false,
  unit_cost numeric(10,2) default 0,
  category text,
  sop_id uuid references public.sop(id),
  created_at timestamptz default now()
);

create unique index if not exists item_catalogue_name_ci on public.item_catalogue (lower(name));

create table if not exists public.item_checkpoint_definitions (
  id uuid primary key default gen_random_uuid(),
  catalogue_item_id uuid references public.item_catalogue(id) on delete cascade,
  step_number integer not null,
  dept_id uuid references public.departments(id),
  description text not null,
  unique(catalogue_item_id, step_number)
);

alter table public.kra enable row level security;
alter table public.kpi enable row level security;
alter table public.sop enable row level security;
alter table public.vendors enable row level security;
alter table public.item_catalogue enable row level security;
alter table public.item_checkpoint_definitions enable row level security;

insert into public.permissions (code, name, description)
values ('build_system', 'Build system', 'Can manage framework, catalogue, and vendors')
on conflict (code) do nothing;

insert into public.department_permissions (department_id, permission_id)
select d.id, p.id
from public.departments d
join public.permissions p on p.code = 'build_system'
where d.code = 'admin'
on conflict do nothing;
