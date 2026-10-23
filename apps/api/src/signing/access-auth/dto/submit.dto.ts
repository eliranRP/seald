import { FlagGatedProperty } from '../../../common/flag-gated.validators';
import { ACCESS_CODE_PATTERN } from 'shared';

/**
 * `POST /sign/submit` body. Before WP-10 the route took no body; with
 * `signerAccessAuth` off `access_code` is rejected like any unknown
 * property, so a dark request fails the same way it did before.
 */
export class SubmitDto {
  @FlagGatedProperty(
    'signerAccessAuth',
    (v) => typeof v === 'string' && ACCESS_CODE_PATTERN.test(v),
    (p) => `${p} must be 6 digits`,
  )
  readonly access_code?: string;
}
