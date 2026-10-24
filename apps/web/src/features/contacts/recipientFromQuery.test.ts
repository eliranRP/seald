import { describe, expect, it } from 'vitest';
import type { AddSignerContact } from '@/components/AddSignerDropdown/AddSignerDropdown.types';
import { recipientFromQuery } from './recipientFromQuery';

const ALEX: AddSignerContact = {
  id: 'c-alex',
  name: 'Alex Reyes',
  email: 'alex@quill.vc',
  color: '#7DD3FC',
};
const ME: AddSignerContact = {
  id: 'me:u1',
  name: 'Jamie',
  email: 'jamie@seald.app',
  color: '#F472B6',
};

describe('recipientFromQuery', () => {
  it('returns the saved contact for a matching email, case-insensitively', () => {
    expect(recipientFromQuery(' Alex@Quill.vc ', [ALEX], [ME])).toEqual(ALEX);
  });

  it('gives a saved contact a free colour when its own is already taken', () => {
    const taken: AddSignerContact = { ...ME, color: '#7DD3FC' };
    const out = recipientFromQuery('alex@quill.vc', [ALEX], [taken]);
    expect(out?.id).toBe('c-alex');
    expect(out?.color).not.toBe('#7DD3FC');
  });

  it('builds a one-off recipient named from the address for an unknown email', () => {
    expect(recipientFromQuery('nora.lee@acme.co', [ALEX], [ME])).toMatchObject({
      id: 'to:nora.lee@acme.co',
      name: 'Nora Lee',
      email: 'nora.lee@acme.co',
    });
  });

  it('returns null for a missing or invalid value and for someone already listed', () => {
    expect(recipientFromQuery(null, [ALEX], [ME])).toBeNull();
    expect(recipientFromQuery('', [ALEX], [ME])).toBeNull();
    expect(recipientFromQuery('not-an-email', [ALEX], [ME])).toBeNull();
    expect(recipientFromQuery('JAMIE@seald.app', [ALEX], [ME])).toBeNull();
  });
});
