import { IsIn, IsOptional, Matches } from 'class-validator';
import { ACCESS_CODE_PATTERN, ACCESS_CODE_PURPOSES, type AccessCodePurpose } from 'shared';

/** `POST /sign/access-code/send` (mirrors AccessCodeSendRequestSchema). */
export class SendAccessCodeDto {
  @IsOptional()
  @IsIn(ACCESS_CODE_PURPOSES)
  readonly purpose?: AccessCodePurpose;
}

/** `POST /sign/access-code/verify` (mirrors AccessCodeVerifyRequestSchema). */
export class VerifyAccessCodeDto {
  @Matches(ACCESS_CODE_PATTERN, { message: 'code must be 6 digits' })
  readonly code!: string;
}
