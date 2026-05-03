-- Phase 10: "My Raised Items" RLS support
-- Users should be able to view item instances they personally raised (created_by),
-- along with patient info and checkpoint state.

drop policy if exists "item_instances_select_assigned" on public.item_instances;
create policy "item_instances_select_assigned" on public.item_instances
for select
using (
  auth.uid() = assigned_user_id
  or auth.uid() = created_by
);

drop policy if exists "item_checkpoint_instances_select" on public.item_checkpoint_instances;
create policy "item_checkpoint_instances_select" on public.item_checkpoint_instances
for select
using (
  exists (
    select 1
    from public.item_instances i
    where i.id = instance_id
      and (i.assigned_user_id = auth.uid() or i.created_by = auth.uid())
  )
);

drop policy if exists "patients_select_queue" on public.patients;
create policy "patients_select_queue" on public.patients
for select to authenticated
using (
  exists (
    select 1
    from public.item_instances i
    where i.patient_id = patients.id
      and (i.assigned_user_id = auth.uid() or i.created_by = auth.uid())
  )
  or public.has_permission(auth.uid(), 'manage_patients')
);

