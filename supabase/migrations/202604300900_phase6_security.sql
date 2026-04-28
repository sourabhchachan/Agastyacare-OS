-- Phase 6 security hardening: login rate limits and financial RLS policy

create table if not exists public.login_attempts (
  staff_id char(10) primary key,
  failed_count integer not null default 0,
  locked_until timestamptz,
  last_failed_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.login_attempts enable row level security;

drop policy if exists "login_attempts_no_client_access" on public.login_attempts;
create policy "login_attempts_no_client_access" on public.login_attempts
for all using (false) with check (false);

drop trigger if exists trg_login_attempts_updated_at on public.login_attempts;
create trigger trg_login_attempts_updated_at
before update on public.login_attempts
for each row execute function public.set_updated_at();

drop trigger if exists trg_audit_login_attempts on public.login_attempts;
create trigger trg_audit_login_attempts
after insert or update or delete on public.login_attempts
for each row execute function public.audit_trigger_generic();

-- Explicit RLS for financial records
drop policy if exists "bill_lines_finance_select" on public.bill_lines;
create policy "bill_lines_finance_select" on public.bill_lines
for select using (
  public.has_permission(auth.uid(), 'access_financial_data')
);
