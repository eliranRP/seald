begin;

alter table public.deleted_user_tombstones disable row level security;
alter table public.schema_migrations disable row level security;

commit;
