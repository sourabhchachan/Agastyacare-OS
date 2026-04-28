-- Allow staff to read catalogue and patient data needed for their queue (no hardcoded roles)

drop policy if exists "item_catalogue_select_queue" on public.item_catalogue;
create policy "item_catalogue_select_queue" on public.item_catalogue
for select to authenticated
using (true);

drop policy if exists "patients_select_queue" on public.patients;
create policy "patients_select_queue" on public.patients
for select to authenticated
using (
  exists (
    select 1 from public.item_instances i
    where i.patient_id = patients.id
      and i.assigned_user_id = auth.uid()
  )
  or public.has_permission(auth.uid(), 'manage_patients')
);

drop policy if exists "item_checkpoint_definitions_read" on public.item_checkpoint_definitions;
create policy "item_checkpoint_definitions_read" on public.item_checkpoint_definitions
for select to authenticated
using (true);

drop policy if exists "departments_select_admit" on public.departments;
create policy "departments_select_admit" on public.departments
for select to authenticated
using (public.has_permission(auth.uid(), 'manage_patients'));
