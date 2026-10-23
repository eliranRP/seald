import { describe, expect, it } from 'vitest';
import { isMeSignerId, makeMeSigner } from './meSigner';

describe('meSigner', () => {
  it('builds a prefixed signer that is not a contact id', () => {
    const me = makeMeSigner({ id: 'u-1', name: 'Eliran Azulay', email: 'eliran@seald.app' });
    expect(me.id).toBe('me:u-1');
    expect(isMeSignerId(me.id)).toBe(true);
    expect(isMeSignerId('c-1')).toBe(false);
    expect(me.name).toBe('Eliran Azulay');
  });

  it('falls back to the email when the name is blank', () => {
    const me = makeMeSigner({ id: 'u-1', name: '  ', email: 'eliran@seald.app' });
    expect(me.name).toBe('eliran@seald.app');
  });
});
