-- Phase 8: move recurrence from catalogue to item instances, add requires_patient

alter table public.item_catalogue
  add column if not exists requires_patient boolean not null default true;

alter table public.item_catalogue
  drop constraint if exists item_catalogue_recurrence_check;

alter table public.item_catalogue
  drop column if exists is_recurring,
  drop column if exists recurrence_frequency,
  drop column if exists recurrence_deadline;

alter table public.item_instances
  add column if not exists is_recurring boolean not null default false,
  add column if not exists recurrence_frequency text,
  add column if not exists recurrence_until timestamptz;

alter table public.item_instances
  drop constraint if exists item_instances_recurrence_check;

alter table public.item_instances
  add constraint item_instances_recurrence_check check (
    (is_recurring = false and recurrence_frequency is null and recurrence_until is null)
    or (
      is_recurring = true
      and recurrence_frequency in ('2hr', '4hr', '6hr', '8hr', '12hr', '24hr')
      and recurrence_until is not null
    )
  );
