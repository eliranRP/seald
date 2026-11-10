import { parseCookie, stringifySetCookie, type SetCookie } from 'cookie';

/**
 * Set-Cookie and Cookie header helpers over `cookie` 2, which replaced
 * `serialize(name, value, options)` and `parse(header)` with
 * `stringifySetCookie({ name, value, ...options })` and `parseCookie`.
 *
 * Every value seald sets (signer session and access-pending JWTs, the
 * approval CSRF nonce) is base64url, which `cookie` 1 and 2 encode the
 * same way, so the headers are byte-identical to the 1.x output
 * (pinned in `__tests__/cookies.spec.ts`).
 */
export type CookieOptions = Omit<SetCookie, 'name' | 'value'>;

export function serializeCookie(name: string, value: string, options: CookieOptions): string {
  return stringifySetCookie({ name, value, ...options });
}

export function parseCookies(header: string): Record<string, string | undefined> {
  return parseCookie(header);
}
