import { Allow } from 'class-validator';

/** Fields the ValidationPipe must keep. The service checks the values. */
export class CreateApiKeyDto {
  @Allow()
  name?: unknown;

  @Allow()
  scopes?: unknown;

  @Allow()
  expires_at?: unknown;

  @Allow()
  always_require_signin?: unknown;
}
