-- 0008_templates.sql
-- Per-user reusable signing templates. A template captures a saved field
-- layout (signature/initial/date/text/checkbox positions, addressed by
-- page-rule: 'all' | 'allButLast' | 'first' | 'last' | <page-num>) so the
-- sender can swap in a new PDF and have the same fields snap onto it.
--
-- Scoped by owner_id → auth.users(id). Cascades on user deletion (GDPR-
-- aligned). RLS enabled with no policies — the backend connects as admin
-- and is the sole gate. Mirrors the contacts (0001) and envelopes (0002)
-- patterns.

create table public.templates (
  id              uuid        primary key default gen_random_uuid(),
  owner_id        uuid        not null references auth.users(id) on delete cascade,
  title           text        not null check (char_length(title) between 1 and 200),
  description     text                 check (description is null or char_length(description) <= 2000),
  cover_color     text                 check (cover_color is null or cover_color ~ '^#[0-9A-Fa-f]{6}$'),
  -- field_layout is a JSON array of { type, pageRule, x, y, label? } per the
  -- TemplateField type in packages/shared/src/templates.ts. We keep it as
  -- jsonb (not a separate child table) because:
  --   1. Layouts are read/written atomically — there's no per-field query.
  --   2. The shape is bounded (typically 5-15 entries) and validated at
  --      the HTTP boundary by class-validator + the shared zod schema.
  field_layout    jsonb       not null default '[]'::jsonb,
  uses_count      integer     not null default 0 check (uses_count >= 0),
  last_used_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index templates_owner_idx           on public.templates (owner_id);
-- Sort: last_used_at desc nulls last is the primary list ordering.
create index templates_owner_last_used_idx on public.templates (owner_id, last_used_at desc nulls last);

alter table public.templates enable row level security;

-- Reuse the set_updated_at function defined in 0001_contacts.sql.
create trigger templates_set_updated_at
  before update on public.templates
  for each row execute function public.set_updated_at();

comment on column public.templates.field_layout is
  'JSON array of TemplateField records: { type: signature|initial|date|text|checkbox, pageRule: all|allButLast|first|last|<int>, x: number, y: number, label?: string }. See packages/shared/src/templates.ts.';
