import { describe, it, expect } from 'vitest';
import { MOBILE_NAV_ITEMS, NAV_ITEMS, NEW_DOCUMENT_PATH, matchNavId } from './navItems';

/**
 * Redesign v2 IA: Documents · Templates · Contacts on desktop; the mobile
 * bottom nav adds "Me" (settings). The old "Sign" tab is gone — starting a
 * document is the Documents page's primary action, so every `/document/*`
 * path keeps "Documents" lit.
 */
describe('matchNavId', () => {
  it.each([
    ['/documents', 'documents'],
    ['/document/new', 'documents'],
    ['/document/abc-123', 'documents'],
    ['/document/abc-123/sent', 'documents'],
    ['/templates', 'templates'],
    ['/templates/abc/use', 'templates'],
    ['/templates/abc/edit', 'templates'],
    ['/signers', 'signers'],
    ['/signers/abc-123', 'signers'],
    ['/settings', 'settings'],
    ['/settings/integrations', 'settings'],
    ['/approve/abc/review', 'documents'],
    ['/somewhere-else', 'documents'],
  ])('%s → %s', (pathname, id) => {
    expect(matchNavId(pathname)).toBe(id);
  });

  it('does not confuse look-alike prefixes', () => {
    expect(matchNavId('/templatesx')).toBe('documents');
    expect(matchNavId('/signersx')).toBe('documents');
  });
});

describe('NAV_ITEMS', () => {
  it('is exactly Documents · Templates · Contacts, in order', () => {
    expect(NAV_ITEMS.map((i) => [i.id, i.label, i.path])).toEqual([
      ['documents', 'Documents', '/documents'],
      ['templates', 'Templates', '/templates'],
      ['signers', 'Contacts', '/signers'],
    ]);
  });

  it('gives every item an icon', () => {
    for (const item of NAV_ITEMS) expect(item.icon).toBeTruthy();
  });

  it('no longer has a "Sign" tab', () => {
    expect(NAV_ITEMS.find((i) => i.id === 'sign')).toBeUndefined();
  });
});

describe('MOBILE_NAV_ITEMS', () => {
  it('adds "Me" → /settings after the desktop destinations', () => {
    expect(MOBILE_NAV_ITEMS.map((i) => i.label)).toEqual([
      'Documents',
      'Templates',
      'Contacts',
      'Me',
    ]);
    expect(MOBILE_NAV_ITEMS[MOBILE_NAV_ITEMS.length - 1]?.path).toBe('/settings');
  });

  it('new document lives at /document/new', () => {
    expect(NEW_DOCUMENT_PATH).toBe('/document/new');
  });
});
