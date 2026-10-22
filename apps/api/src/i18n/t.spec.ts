import { t } from './t';

describe('i18n t()', () => {
  it('resolves a key from the common catalog', () => {
    expect(t('en', 'server.certificate.title')).toBe('Certificate of completion');
  });

  it('accepts a regional tag via its primary subtag', () => {
    expect(t('en-GB', 'guestBadge.label')).toBe('Guest mode');
  });

  it('falls back to en for an unsupported locale', () => {
    expect(t('xx', 'guestBadge.label')).toBe('Guest mode');
    expect(t(null, 'guestBadge.label')).toBe('Guest mode');
  });

  it('returns the key itself when it is missing', () => {
    expect(t('en', 'no.such.key')).toBe('no.such.key');
  });

  it('does not treat a non-leaf node as a string', () => {
    expect(t('en', 'server.certificate')).toBe('server.certificate');
  });

  it('returns the key for an unknown namespace', () => {
    expect(t('en', 'nope:guestBadge.label')).toBe('nope:guestBadge.label');
  });
});
