-- Phase 7: Simplified catalogue and manual ordering

alter table public.item_catalogue
  add column if not exists is_recurring boolean not null default false,
  add column if not exists recurrence_frequency text,
  add column if not exists recurrence_deadline timestamptz;

alter table public.item_catalogue
  drop constraint if exists item_catalogue_type_check;

alter table public.item_catalogue
  drop column if exists type,
  drop column if exists frequency,
  drop column if exists frequency_time,
  drop column if exists frequency_day,
  drop column if exists category;

alter table public.item_catalogue
  add constraint item_catalogue_recurrence_check check (
    (is_recurring = false and recurrence_frequency is null)
    or (is_recurring = true and recurrence_frequency in ('2hr', '4hr', '6hr', '8hr', '12hr', '24hr'))
  );

alter table public.item_instances
  drop constraint if exists item_instances_catalogue_type_check;

-- Manual-only ordering: no automatic recurring item creation on admit.
