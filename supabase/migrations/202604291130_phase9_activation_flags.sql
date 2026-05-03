-- Phase 9: Soft deactivation flags for framework and catalogue entities

alter table public.item_catalogue
  add column if not exists is_active boolean not null default true;

alter table public.kra
  add column if not exists is_active boolean not null default true;

alter table public.kpi
  add column if not exists is_active boolean not null default true;

alter table public.sop
  add column if not exists is_active boolean not null default true;
