import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * POST /envelopes/:id/send body. Both fields are optional and only consulted
 * when the caller's JWT carries no `email` claim (anonymous Supabase
 * sessions used by the no-sign-up "guest" flow). When the JWT *does* have
 * an email, the controller ignores the body completely — the JWT email is
 * authoritative, defeating any spoofing attempt by a signed-in user.
 */
export class SendEnvelopeDto {
  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  readonly sender_email?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  readonly sender_name?: string;
}
