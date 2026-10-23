import { beforeEach, describe, expect, it } from 'vitest';
import { readNextParam, rememberNext, takeRememberedNext, validateNextPath } from './nextPath';

describe('rememberNext / takeRememberedNext', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it('returns a parked approval path once, then nothing', () => {
    rememberNext('/approve/abc123/review?page=2');
    expect(takeRememberedNext()).toBe('/approve/abc123/review?page=2');
    expect(takeRememberedNext()).toBeNull();
  });

  it('parks nothing for a null path', () => {
    rememberNext(null);
    expect(takeRememberedNext()).toBeNull();
  });

  it('drops an entry older than an hour', () => {
    rememberNext('/approve/abc123', 1_000);
    expect(takeRememberedNext(1_000 + 60 * 60 * 1000 + 1)).toBeNull();
  });

  it('re-validates the value when it is taken', () => {
    window.sessionStorage.setItem(
      'seald.auth.next',
      JSON.stringify({ next: 'https://evil.com/approve/abc', at: Date.now() }),
    );
    expect(takeRememberedNext()).toBeNull();
  });

  it('ignores a malformed entry', () => {
    window.sessionStorage.setItem('seald.auth.next', 'not json');
    expect(takeRememberedNext()).toBeNull();
  });
});

describe('validateNextPath — accepted approval paths', () => {
  it.each([
    '/approve/abc123',
    '/approve/abc123/review',
    '/approve/ap_9-Z/review',
    '/approve/abc123/review?page=1',
    '/approve/abc123/review?page=1&tab=fields',
  ])('accepts %s', (candidate) => {
    expect(validateNextPath(candidate)).toBe(candidate);
  });
});

describe('validateNextPath — the owner pages (signed-out dialog)', () => {
  it.each([
    '/documents',
    '/documents?q=nda',
    '/document/abc-123',
    '/document/new',
    '/templates',
    '/templates/t_1/use',
    '/signers',
    '/settings',
    '/settings/integrations',
    '/settings/developers',
  ])('accepts %s', (candidate) => {
    expect(validateNextPath(candidate)).toBe(candidate);
  });

  it.each([
    '/documentsx',
    '/document//evil.com',
    '//documents',
    '/documents/../evil',
    '/settings/../../evil',
    '/signers/anything',
    '/m/send',
  ])('refuses %s', (candidate) => {
    expect(validateNextPath(candidate)).toBeNull();
  });
});

describe('validateNextPath — the MCP OAuth consent page (WP-27)', () => {
  it('accepts the exact consent path', () => {
    expect(validateNextPath('/oauth/mcp/consent')).toBe('/oauth/mcp/consent');
  });

  it.each([
    '/oauth/mcp/consent?client_id=x',
    '/oauth/mcp/consent/',
    '/oauth/mcp/consent/../../evil',
    '/oauth/gdrive/callback',
    '//oauth/mcp/consent',
    'https://evil.com/oauth/mcp/consent',
  ])('refuses %s', (candidate) => {
    expect(validateNextPath(candidate)).toBeNull();
  });
});

describe('validateNextPath — open-redirect and off-site cases', () => {
  it.each([
    ['absolute https URL', 'https://evil.com/approve/abc'],
    ['absolute http URL', 'http://evil.com'],
    ['bare protocol-relative', '//evil.com'],
    ['protocol-relative into approve', '//evil.com/approve/abc'],
    ['backslash escape', '/\\evil.com'],
    ['backslash escape into approve', '/\\evil.com/approve/abc'],
    ['backslash inside approve', '/approve\\evil.com'],
    ['double slash inside approve', '/approve//evil.com'],
    ['dot-dot traversal', '/approve/../evil'],
    ['dot segment', '/approve/./abc'],
    ['javascript scheme', 'javascript:alert(1)'],
    ['javascript scheme, mixed case', 'JavaScript:alert(1)'],
    ['data scheme', 'data:text/html,<script>alert(1)</script>'],
    ['userinfo trick', '/approve/abc@evil.com'],
    ['no leading slash', 'approve/abc'],
    ['scheme-less host', 'evil.com/approve/abc'],
    ['protocol with missing slashes', 'https:/approve/abc'],
  ])('refuses %s (%s)', (_label, candidate) => {
    expect(validateNextPath(candidate)).toBeNull();
  });
});

describe('validateNextPath — encoded variants', () => {
  it.each([
    ['percent-encoded double slash', '%2F%2Fevil.com'],
    ['percent-encoded approve prefix', '%2Fapprove%2Fabc'],
    ['double-encoded double slash', '%252F%252Fevil.com'],
    ['percent-encoded backslash', '/%5Cevil.com'],
    ['percent-encoded traversal', '/approve/..%2F..%2Fevil'],
    ['lowercase percent escape', '/approve/a%2fb'],
    ['encoded space', '/approve/a%20b'],
  ])('refuses %s (%s)', (_label, candidate) => {
    expect(validateNextPath(candidate)).toBeNull();
  });

  it('refuses a decoded value that still carries a percent escape', () => {
    // URLSearchParams decodes once. If the value still holds `%`, it was
    // encoded twice, so it is refused instead of decoded again.
    expect(validateNextPath('/approve/%2e%2e')).toBeNull();
  });
});

describe('validateNextPath — fragments, queries and whitespace', () => {
  it.each([
    ['fragment carrying a token', '/approve/abc#token=secret'],
    ['fragment on review', '/approve/abc/review#frag'],
    ['query smuggling a second URL', '/approve/abc?next=//evil.com'],
    ['query with a slash', '/approve/abc?to=/evil'],
    ['query with a colon', '/approve/abc?to=https:evil'],
    ['empty query', '/approve/abc?'],
    ['second question mark', '/approve/abc?a=1?b=2'],
    ['leading whitespace', ' /approve/abc'],
    ['trailing newline', '/approve/abc\n'],
    ['embedded tab', '/approve/abc\t//evil.com'],
    ['embedded space', '/approve/a b'],
    ['empty segment at end', '/approve/abc/'],
  ])('refuses %s', (_label, candidate) => {
    expect(validateNextPath(candidate)).toBeNull();
  });
});

// The dashboard and settings used to be refused here; the signed-out dialog now
// returns the owner to the page they were on, so they moved to the accepted list above.
describe('validateNextPath — other app paths and edge inputs', () => {
  it.each([
    ['sign-in itself', '/signin'],
    ['mobile sender', '/m/send'],
    ['approve prefix without a separator', '/approvex/abc'],
    ['bare approve', '/approve'],
    ['approve with no id', '/approve/'],
    ['wrong case prefix', '/APPROVE/abc'],
    ['root', '/'],
  ])('refuses %s (%s)', (_label, candidate) => {
    expect(validateNextPath(candidate)).toBeNull();
  });

  it('refuses null, undefined and the empty string', () => {
    expect(validateNextPath(null)).toBeNull();
    expect(validateNextPath(undefined)).toBeNull();
    expect(validateNextPath('')).toBeNull();
  });

  it('refuses a value over the length cap', () => {
    const long = `/approve/${'a'.repeat(600)}`;
    expect(validateNextPath(long)).toBeNull();
  });

  it('accepts a value exactly at the length cap', () => {
    const atCap = `/approve/${'a'.repeat(512 - '/approve/'.length)}`;
    expect(atCap).toHaveLength(512);
    expect(validateNextPath(atCap)).toBe(atCap);
  });
});

describe('readNextParam — reads ?next= from the URL', () => {
  it('returns a safe approve path from a percent-encoded search string', () => {
    const params = new URLSearchParams('next=%2Fapprove%2Fabc%2Freview%3Fpage%3D1');
    expect(readNextParam(params)).toBe('/approve/abc/review?page=1');
  });

  it('refuses a protocol-relative value delivered in the search string', () => {
    expect(readNextParam(new URLSearchParams('next=%2F%2Fevil.com'))).toBeNull();
  });

  it('refuses a double-encoded value', () => {
    expect(readNextParam(new URLSearchParams('next=%252Fapprove%252Fabc'))).toBeNull();
  });

  it('returns null when the parameter is missing', () => {
    expect(readNextParam(new URLSearchParams(''))).toBeNull();
  });
});
