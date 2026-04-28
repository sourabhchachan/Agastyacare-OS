-- Policies for Phase 2 admin-managed entities

drop policy if exists "kra_admin_manage" on public.kra;
create policy "kra_admin_manage" on public.kra
for all using (public.has_permission(auth.uid(), 'build_system'))
with check (public.has_permission(auth.uid(), 'build_system'));

drop policy if exists "kpi_admin_manage" on public.kpi;
create policy "kpi_admin_manage" on public.kpi
for all using (public.has_permission(auth.uid(), 'build_system'))
with check (public.has_permission(auth.uid(), 'build_system'));

drop policy if exists "sop_admin_manage" on public.sop;
create policy "sop_admin_manage" on public.sop
for all using (public.has_permission(auth.uid(), 'build_system'))
with check (public.has_permission(auth.uid(), 'build_system'));

drop policy if exists "vendors_admin_manage" on public.vendors;
create policy "vendors_admin_manage" on public.vendors
for all using (public.has_permission(auth.uid(), 'build_system'))
with check (public.has_permission(auth.uid(), 'build_system'));

drop policy if exists "item_catalogue_admin_manage" on public.item_catalogue;
create policy "item_catalogue_admin_manage" on public.item_catalogue
for all using (public.has_permission(auth.uid(), 'build_system'))
with check (public.has_permission(auth.uid(), 'build_system'));

drop policy if exists "item_checkpoint_admin_manage" on public.item_checkpoint_definitions;
create policy "item_checkpoint_admin_manage" on public.item_checkpoint_definitions
for all using (public.has_permission(auth.uid(), 'build_system'))
with check (public.has_permission(auth.uid(), 'build_system'));
