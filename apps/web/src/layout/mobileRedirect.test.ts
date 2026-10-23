import { describe, expect, it } from 'vitest';
import { isMobileRedirectExempt } from './mobileRedirect';

describe('isMobileRedirectExempt', () => {
  it.each(['/approve', '/approve/abc', '/approve/abc/review'])('exempts %s', (pathname) => {
    expect(isMobileRedirectExempt(pathname)).toBe(true);
  });

  it.each(['/documents', '/m/send', '/signin', '/approvex/abc', '/settings/approvals', '/'])(
    'does not exempt %s',
    (pathname) => {
      expect(isMobileRedirectExempt(pathname)).toBe(false);
    },
  );
});
