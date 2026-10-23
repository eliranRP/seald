import { afterEach, describe, expect, it } from 'vitest';
import {
  clearSessionExpired,
  dismissNotice,
  getSystemState,
  publishNotice,
  raiseSessionExpired,
  resetSystemState,
  setMaintenance,
} from './systemStore';

afterEach(resetSystemState);

describe('systemStore', () => {
  it('raises and clears the session-expired flag', () => {
    raiseSessionExpired();
    expect(getSystemState().sessionExpired).toBe(true);
    clearSessionExpired();
    expect(getSystemState().sessionExpired).toBe(false);
  });

  it('tracks maintenance with an optional eta', () => {
    setMaintenance(true, 15);
    expect(getSystemState().maintenance).toEqual({ active: true, etaMinutes: 15 });
    setMaintenance(false);
    expect(getSystemState().maintenance.active).toBe(false);
  });

  it('queues notices and replaces one that shares a key', () => {
    publishNotice({ title: 'a', tone: 'info' }, 'k');
    publishNotice({ title: 'b', tone: 'info' }, 'k');
    publishNotice({ title: 'c', tone: 'error' });
    expect(getSystemState().notices.map((n) => n.title)).toEqual(['b', 'c']);
    dismissNotice('k');
    expect(getSystemState().notices.map((n) => n.title)).toEqual(['c']);
  });
});
