import { findTokenShapedStrings } from '../leak-scan';

const KEY = `${'seald_live_'}${'x'.repeat(43)}`;
const JWT = `eyJ${'a'.repeat(12)}.eyJ${'b'.repeat(12)}.${'c'.repeat(12)}`;

describe('findTokenShapedStrings', () => {
  it.each([
    ['a signing link token', { url: 'https://seald.test/sign/abc?t=secret' }, 'signing link token'],
    ['an API key', { note: KEY }, 'api key'],
    ['an OAuth access token', { note: `${'seald_oat_'}${'x'.repeat(43)}` }, 'oauth token'],
    ['an OAuth refresh token', { note: `${'seald_ort_'}${'x'.repeat(43)}` }, 'oauth token'],
    ['a token hash column', { access_token_hash: 'x' }, 'token hash column'],
    ['a storage path', { storage_path: 'a/b.pdf' }, 'storage path column'],
    ['a file path column', { sealed_file_path: 'a/b.pdf' }, 'storage path column'],
    ['a link token', { link_token: 'x' }, 'link token'],
    ['an approval token link', { u: 'https://seald.test/approve#tok' }, 'approval token link'],
    ['a JWT', { session: JWT }, 'jwt'],
    ['a signed URL query', { url: 'https://s.test/object/sign/a?token=x' }, 'signed url query'],
  ])('finds %s', (_name, value, pattern) => {
    expect(findTokenShapedStrings(value).map((f) => f.pattern)).toContain(pattern);
  });

  it('reports pattern names only, never the matched text', () => {
    const found = findTokenShapedStrings({ note: KEY });
    expect(JSON.stringify(found)).not.toContain('x'.repeat(10));
  });

  it('passes clean data, including the review path and plain URLs', () => {
    expect(
      findTokenShapedStrings({
        title: 'Lease',
        review_url: 'https://seald.nromomentum.com/approve/123/review',
        verify: 'https://seald.test/verify/ABC?lang=en',
      }),
    ).toEqual([]);
  });

  it('allows a signed URL (with a JWT token) only in the named top-level field', () => {
    const url = `https://s.test/object/sign/a/b.pdf?token=${JWT}`;
    expect(findTokenShapedStrings({ url }, { signedUrlFields: ['url'] })).toEqual([]);
    expect(findTokenShapedStrings({ other: url }, { signedUrlFields: ['url'] })).not.toEqual([]);
    // The exempt field is still checked for everything else.
    expect(
      findTokenShapedStrings({ url: `${url}&t=signer` }, { signedUrlFields: ['url'] }).map(
        (f) => f.pattern,
      ),
    ).toEqual(['signing link token']);
  });
});
