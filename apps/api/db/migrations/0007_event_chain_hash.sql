-- 0007_event_chain_hash.sql
-- Add tamper-evident hash chain to envelope_events.
--
-- Each row stores SHA-256 of the previous row's canonical JSON in the same
-- envelope. Walking the chain in (envelope_id, created_at) order and
-- recomputing the hash detects any DB-level tampering (insert / update /
-- delete) of audit events. The genesis event of each envelope has NULL.

alter table envelope_events
  add column if not exists prev_event_hash bytea;

-- Index helps the verify-page query that walks the chain.
create index if not exists envelope_events_prev_hash_idx
  on envelope_events (envelope_id, created_at);

-- Concurrency safety: prevent two concurrent appendEvent transactions from
-- both observing the same "latest" predecessor and writing two children with
-- the same prev_event_hash (which would silently break the chain). The
-- second writer hits a 23505 unique-violation; the repository wraps that
-- as a retry. NULL values do not collide under a partial unique index, so
-- the genesis event of any envelope is unaffected.
create unique index if not exists envelope_events_envelope_prev_hash_unique
  on envelope_events (envelope_id, prev_event_hash)
  where prev_event_hash is not null;

comment on column envelope_events.prev_event_hash is
  'SHA-256 of the previous event row in this envelope (canonical JSON of id, envelope_id, signer_id, actor_kind, event_type, ip, user_agent, metadata, created_at). NULL only for the genesis event of each envelope. Walking the chain and recomputing hashes detects any DB-level tampering.';
