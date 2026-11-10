import { parseCookies, serializeCookie } from '../cookies';

// Expected strings are the `cookie` 1.1.1 `serialize` output for the same
// arguments: the 2.x upgrade must not change a Set-Cookie header seald sends.
describe('cookies', () => {
  it('serializes the signer session cookie exactly as cookie 1.x did', () => {
    expect(
      serializeCookie('seald_signer_session', 'eyJhbGciOi.eyJzdWIi.c2ln-_', {
        httpOnly: true,
        sameSite: 'lax',
        secure: true,
        path: '/sign',
        maxAge: 1800,
      }),
    ).toBe(
      'seald_signer_session=eyJhbGciOi.eyJzdWIi.c2ln-_; Max-Age=1800; Path=/sign; HttpOnly; Secure; SameSite=Lax',
    );
  });

  it('serializes a clearing cookie exactly as cookie 1.x did', () => {
    expect(
      serializeCookie('seald_signer_session', '', {
        httpOnly: true,
        sameSite: 'lax',
        secure: false,
        path: '/sign',
        maxAge: 0,
      }),
    ).toBe('seald_signer_session=; Max-Age=0; Path=/sign; HttpOnly; SameSite=Lax');
  });

  it('serializes a strict base64url CSRF nonce exactly as cookie 1.x did', () => {
    expect(
      serializeCookie('seald_approval_csrf', 'AbC_09-xyz', {
        httpOnly: true,
        secure: true,
        sameSite: 'strict',
        path: '/',
        maxAge: 600,
      }),
    ).toBe(
      'seald_approval_csrf=AbC_09-xyz; Max-Age=600; Path=/; HttpOnly; Secure; SameSite=Strict',
    );
  });

  it('parses a Cookie header, keeping the first of duplicate names', () => {
    expect(parseCookies('a=1; seald_signer_session=eyJ.a.b; dup=1; dup=2; q="x%20y"')).toEqual({
      a: '1',
      seald_signer_session: 'eyJ.a.b',
      dup: '1',
      q: '"x y"',
    });
    expect(parseCookies('')).toEqual({});
  });
});
