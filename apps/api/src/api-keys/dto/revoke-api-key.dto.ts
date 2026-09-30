import { Allow } from 'class-validator';

export class RevokeApiKeyDto {
  @Allow()
  revoked?: unknown;
}
