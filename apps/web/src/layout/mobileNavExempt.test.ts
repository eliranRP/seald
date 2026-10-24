import { describe, expect, it } from 'vitest';
import { isMobileNavExempt } from './mobileNavExempt';

describe('isMobileNavExempt', () => {
  it.each(['/approve', '/approve/abc', '/approve/abc/review'])('exempts %s', (pathname) => {
    expect(isMobileNavExempt(pathname)).toBe(true);
  });

  it.each(['/documents', '/m/send', '/signin', '/approvex/abc', '/settings/approvals', '/'])(
    'does not exempt %s',
    (pathname) => {
      expect(isMobileNavExempt(pathname)).toBe(false);
    },
  );
});
