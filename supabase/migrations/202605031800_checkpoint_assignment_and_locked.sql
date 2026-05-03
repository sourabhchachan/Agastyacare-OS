-- Checkpoint assignment (catalogue), locked/pending chain, claimed_by, queue RLS, queue RPC

-- 1) Catalogue: assignment type + optional assignee
alter table public.item_checkpoint_definitions
  add column if not exists assignment_type text not null default 'department_pool',
  add column if not exists assigned_user_id uuid references public.staff_users (id);

alter table public.item_checkpoint_definitions
  drop constraint if exists item_checkpoint_definitions_assignment_type_check;

alter table public.item_checkpoint_definitions
  add constraint item_checkpoint_definitions_assignment_type_check
  check (assignment_type in ('department_pool', 'specific_user'));

alter table public.item_checkpoint_definitions
  drop constraint if exists item_checkpoint_definitions_assignment_user_check;

alter table public.item_checkpoint_definitions
  add constraint item_checkpoint_definitions_assignment_user_check
  check (
    (assignment_type = 'department_pool' and assigned_user_id is null)
    or (assignment_type = 'specific_user' and assigned_user_id is not null)
  );

-- 2) Instances: claimed_by + extended status (locked)
alter table public.item_checkpoint_instances
  add column if not exists claimed_by uuid references public.staff_users (id);

alter table public.item_checkpoint_instances
  drop constraint if exists item_checkpoint_instances_status_check;

alter table public.item_checkpoint_instances
  add constraint item_checkpoint_instances_status_check
  check (status in ('locked', 'pending', 'completed'));

-- Backfill: only one "pending" chain — lock steps that still have an incomplete predecessor
update public.item_checkpoint_instances cpi
set status = 'locked'
where cpi.status = 'pending'
  and exists (
    select 1
    from public.item_checkpoint_instances prev
    where prev.instance_id = cpi.instance_id
      and prev.step_number < cpi.step_number
      and prev.status <> 'completed'
  );

-- 3) Helper: operational / build admins bypass checkpoint assignment rules
create or replace function public.is_checkpoint_assignment_admin(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_permission(p_user_id, 'manage_users')
    or public.has_permission(p_user_id, 'build_system');
$$;

-- 4) User may complete the current pending checkpoint (unlocked: no incomplete prior step)
create or replace function public.user_can_act_on_instance_checkpoint(p_user_id uuid, p_instance_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.item_instances ii
    join public.item_checkpoint_instances cpi
      on cpi.instance_id = ii.id
     and cpi.status = 'pending'
    join public.item_checkpoint_definitions def
      on def.catalogue_item_id = ii.catalogue_item_id
     and def.step_number = cpi.step_number
    where ii.id = p_instance_id
      and ii.status in ('pending', 'in_progress')
      and not exists (
        select 1
        from public.item_checkpoint_instances prev
        where prev.instance_id = cpi.instance_id
          and prev.step_number < cpi.step_number
          and prev.status <> 'completed'
      )
      and (
        public.is_checkpoint_assignment_admin(p_user_id)
        or (
          def.assignment_type = 'department_pool'
          and def.dept_id is not null
          and exists (
            select 1
            from public.user_departments ud
            where ud.user_id = p_user_id
              and ud.department_id = def.dept_id
          )
        )
        or (
          def.assignment_type = 'specific_user'
          and def.assigned_user_id = p_user_id
        )
      )
  );
$$;

-- 5) SELECT access on item_instances (detail, history, related reads)
create or replace function public.user_item_instance_select_access(p_user_id uuid, p_instance_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.item_instances ii
    where ii.id = p_instance_id
      and (
        public.is_checkpoint_assignment_admin(p_user_id)
        or ii.assigned_user_id = p_user_id
        or ii.created_by = p_user_id
        or public.user_can_act_on_instance_checkpoint(p_user_id, ii.id)
        or exists (
          select 1
          from public.item_checkpoint_instances cpi
          where cpi.instance_id = ii.id
            and cpi.actor_user_id = p_user_id
        )
      )
  );
$$;

-- 6) Queue: instances shown on home queue
create or replace function public.user_item_instance_in_queue(p_user_id uuid, p_instance_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.item_instances ii
    where ii.id = p_instance_id
      and ii.status in ('pending', 'in_progress')
      and (
        public.is_checkpoint_assignment_admin(p_user_id)
        or public.user_can_act_on_instance_checkpoint(p_user_id, ii.id)
      )
  );
$$;

-- RPC for authenticated clients (uses auth.uid())
create or replace function public.get_queue_instances()
returns setof public.item_instances
language sql
stable
security definer
set search_path = public
as $$
  select ii.*
  from public.item_instances ii
  where ii.status in ('pending', 'in_progress')
    and public.user_item_instance_in_queue(auth.uid(), ii.id)
  order by ii.due_at asc;
$$;

grant execute on function public.get_queue_instances() to authenticated;

-- 7) RLS: item_instances
drop policy if exists "item_instances_select_assigned" on public.item_instances;
create policy "item_instances_select_assigned" on public.item_instances
for select
using (public.user_item_instance_select_access(auth.uid(), id));

drop policy if exists "item_instances_update_assigned" on public.item_instances;
create policy "item_instances_update_assigned" on public.item_instances
for update
using (
  public.is_checkpoint_assignment_admin(auth.uid())
  or assigned_user_id = auth.uid()
  or public.user_can_act_on_instance_checkpoint(auth.uid(), id)
)
with check (
  public.is_checkpoint_assignment_admin(auth.uid())
  or assigned_user_id = auth.uid()
  or public.user_can_act_on_instance_checkpoint(auth.uid(), id)
);

-- 8) RLS: checkpoint instances (hide locked from non-admins)
drop policy if exists "item_checkpoint_instances_select" on public.item_checkpoint_instances;
create policy "item_checkpoint_instances_select" on public.item_checkpoint_instances
for select
using (
  exists (
    select 1
    from public.item_instances i
    where i.id = instance_id
      and public.user_item_instance_select_access(auth.uid(), i.id)
  )
  and (
    public.is_checkpoint_assignment_admin(auth.uid())
    or status <> 'locked'
  )
);

-- 9) Realtime for checkpoint unlock events
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'item_checkpoint_instances'
  ) then
    alter publication supabase_realtime add table public.item_checkpoint_instances;
  end if;
exception
  when undefined_object then
    null;
end $$;

-- Patient visibility for queue-related reads (matches item instance access)
drop policy if exists "patients_select_queue" on public.patients;
create policy "patients_select_queue" on public.patients
for select to authenticated
using (
  exists (
    select 1
    from public.item_instances i
    where i.patient_id = patients.id
      and (
        i.assigned_user_id = auth.uid()
        or i.created_by = auth.uid()
        or public.user_can_act_on_instance_checkpoint(auth.uid(), i.id)
        or public.is_checkpoint_assignment_admin(auth.uid())
      )
  )
  or public.has_permission(auth.uid(), 'manage_patients')
);
