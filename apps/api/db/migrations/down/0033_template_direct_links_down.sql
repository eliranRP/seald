-- Rollback for 0033_template_direct_links.sql.
--
-- Drops the direct-link tables (every public link stops resolving), the
-- envelope columns that point at them, and templates.delivery_mode.
-- envelopes.source_template_id belongs to 0031 and stays. Envelopes already
-- created through a link keep existing; only their provenance is lost.
-- Run it only after rolling the API image back to a build without the
-- direct-links module. Idempotent.

begin;

drop index if exists public.envelopes_direct_link_idx;
alter table public.envelopes drop column if exists direct_link_id;
alter table public.envelopes drop constraint if exists envelopes_source_chk;
alter table public.envelopes drop column if exists source;

drop table if exists public.template_direct_link_claims;
drop table if exists public.template_direct_links;

alter table public.templates drop column if exists delivery_mode;

delete from public.schema_migrations
 where filename = '0033_template_direct_links.sql';

commit;
