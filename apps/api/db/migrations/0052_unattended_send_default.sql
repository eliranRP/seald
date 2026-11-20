-- Agent and API sends no longer wait for the owner's Approve by default.
--
-- New API keys and OAuth grants start with `require_owner_approval = false`
-- and `allow_new_recipients = true`: `envelopes_send` (MCP and /api/v1)
-- sends after the agent's own preview + confirmation token, with the daily
-- send caps and the suspension rules unchanged. Existing keys and grants
-- move to the same settings. An owner turns approval back on per key with
-- `approvals_set_required` (applies at once). Remind, cancel and every
-- other approval kind still ask the owner.

alter table public.api_keys
  alter column require_owner_approval set default false,
  alter column allow_new_recipients set default true;

alter table public.oauth_grants
  alter column require_owner_approval set default false,
  alter column allow_new_recipients set default true;

update public.api_keys
   set require_owner_approval = false,
       allow_new_recipients = true
 where revoked_at is null
   and (require_owner_approval or not allow_new_recipients);

update public.oauth_grants
   set require_owner_approval = false,
       allow_new_recipients = true,
       updated_at = now()
 where revoked_at is null
   and (require_owner_approval or not allow_new_recipients);
