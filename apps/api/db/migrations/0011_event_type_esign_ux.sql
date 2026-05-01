-- 0011_event_type_esign_ux.sql
-- Add three new event_type values that back the legal-production-readiness
-- ESIGN UX surfaces (Phase 5 / tasks T-14, T-15, T-16):
--
--   esign_disclosure_acknowledged  – signer acknowledged the ESIGN Act
--                                    Consumer Disclosure + demonstrated
--                                    ability to access electronic records
--                                    on their device (T-14).
--   intent_to_sign_confirmed       – signer confirmed intent-to-sign on the
--                                    Review screen before submission (T-15).
--   consent_withdrawn              – signer withdrew consent for electronic
--                                    delivery (distinct from "decline") and
--                                    asked for an alternate delivery channel
--                                    (T-16).
--
-- Adding to the enum is forward-only; existing rows are unaffected.

alter type event_type add value if not exists 'esign_disclosure_acknowledged';
alter type event_type add value if not exists 'intent_to_sign_confirmed';
alter type event_type add value if not exists 'consent_withdrawn';
