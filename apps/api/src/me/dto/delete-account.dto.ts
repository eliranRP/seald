import { Equals } from 'class-validator';

/**
 * T-20: account deletion is gated on a verbatim confirm phrase to make
 * the destructive intent explicit. The SPA prompts the user for the
 * phrase; copy/paste protections live there. The server treats the
 * absence of the literal as 400.
 */
export class DeleteAccountDto {
  @Equals('DELETE_MY_ACCOUNT', {
    message: 'confirm must be the literal string "DELETE_MY_ACCOUNT"',
  })
  readonly confirm!: 'DELETE_MY_ACCOUNT';
}
