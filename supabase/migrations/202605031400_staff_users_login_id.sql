-- Login ID: editable identifier on staff_users (backfilled from staff_id for existing rows).
alter table public.staff_users add column if not exists login_id text;

update public.staff_users
set login_id = trim(both from staff_id::text)
where login_id is null;

alter table public.staff_users alter column login_id set not null;

create unique index if not exists staff_users_login_id_key on public.staff_users (login_id);
