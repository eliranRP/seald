import { Allow } from 'class-validator';

export class PatchApiKeyDto {
  @Allow()
  require_owner_approval?: unknown;

  @Allow()
  allow_new_recipients?: unknown;

  @Allow()
  always_require_signin?: unknown;

  @Allow()
  approval_notify?: unknown;
}
