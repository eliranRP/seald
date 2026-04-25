-- 0005_signer_initials.sql
-- Separate storage for the signer's *initials* capture (a tiny "MR"-style
-- glyph) from the full signature image. Before this migration, both
-- captures were written to `signature_image_path`, so whichever was
-- uploaded last clobbered the other and the burn-in pipeline rendered the
-- initials at every signature placement (and vice versa).
--
-- Both columns are nullable: legacy envelopes that already submitted only
-- carry `signature_image_path`; the burn-in falls back to that single
-- image when `initials_image_path` is null, preserving prior behaviour.

alter table public.envelope_signers
  add column initials_image_path text,
  add column initials_format     signature_format;
