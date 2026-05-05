import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  clearDoneSnapshot,
  readDoneSnapshot,
  writeDoneSnapshot,
  type DoneSnapshot,
} from '../doneSnapshot';

const ENV_ID = '00000000-0000-4000-8000-000000000001';

const VALID: DoneSnapshot = {
  kind: 'submitted',
  envelope_id: ENV_ID,
  short_code: 'ABCDEF1234567',
  title: 'Master Services Agreement',
  sender_name: 'Eliran',
  recipient_email: 'maya@example.com',
  timestamp: '2026-04-24T00:00:00Z',
};

beforeEach(() => {
  window.sessionStorage.clear();
});

afterEach(() => {
  window.sessionStorage.clear();
});

describe('doneSnapshot — write/read round-trip', () => {
  it('round-trips a complete snapshot', () => {
    writeDoneSnapshot(VALID);
    expect(readDoneSnapshot(ENV_ID)).toEqual(VALID);
  });

  it('returns null when nothing has been written', () => {
    expect(readDoneSnapshot(ENV_ID)).toBeNull();
  });

  it('returns null when the stored snapshot belongs to a different envelope', () => {
    writeDoneSnapshot(VALID);
    expect(readDoneSnapshot('00000000-0000-4000-8000-000000000099')).toBeNull();
  });

  it('clearDoneSnapshot drops the stored value', () => {
    writeDoneSnapshot(VALID);
    clearDoneSnapshot();
    expect(readDoneSnapshot(ENV_ID)).toBeNull();
  });

  it('returns null when the stored value is not valid JSON', () => {
    window.sessionStorage.setItem('sealed.sign.last', '{not json');
    expect(readDoneSnapshot(ENV_ID)).toBeNull();
  });
});

describe('doneSnapshot — defensive shape validation (regression)', () => {
  // Regression: without runtime validation, a malformed snapshot (e.g. a
  // crafted sessionStorage entry, or a partial write from a future-version
  // client) was returned to the consumer as-is. The Done page then
  // rendered `/verify/undefined` and `<b>{undefined}</b>` for the
  // recipient email — neither of which crashes but both of which are
  // visible-broken UX. Each test below pins one missing/invalid field
  // and asserts the read returns null instead of the partial object.

  it('returns null when `kind` is missing', () => {
    window.sessionStorage.setItem(
      'sealed.sign.last',
      JSON.stringify({ ...VALID, kind: undefined }),
    );
    expect(readDoneSnapshot(ENV_ID)).toBeNull();
  });

  it('returns null when `kind` is not one of the known terminal states', () => {
    window.sessionStorage.setItem(
      'sealed.sign.last',
      JSON.stringify({ ...VALID, kind: 'something-else' }),
    );
    expect(readDoneSnapshot(ENV_ID)).toBeNull();
  });

  it('returns null when `short_code` is missing', () => {
    const partial: Record<string, unknown> = { ...VALID };
    delete partial.short_code;
    window.sessionStorage.setItem('sealed.sign.last', JSON.stringify(partial));
    expect(readDoneSnapshot(ENV_ID)).toBeNull();
  });

  it('returns null when `recipient_email` is missing', () => {
    const partial: Record<string, unknown> = { ...VALID };
    delete partial.recipient_email;
    window.sessionStorage.setItem('sealed.sign.last', JSON.stringify(partial));
    expect(readDoneSnapshot(ENV_ID)).toBeNull();
  });

  it('returns null when `envelope_id` is missing entirely', () => {
    const partial: Record<string, unknown> = { ...VALID };
    delete partial.envelope_id;
    window.sessionStorage.setItem('sealed.sign.last', JSON.stringify(partial));
    expect(readDoneSnapshot(ENV_ID)).toBeNull();
  });

  it('returns null when the value is a JSON array (wrong root type)', () => {
    window.sessionStorage.setItem('sealed.sign.last', JSON.stringify([VALID]));
    expect(readDoneSnapshot(ENV_ID)).toBeNull();
  });

  it('returns null when the value is null literal', () => {
    window.sessionStorage.setItem('sealed.sign.last', 'null');
    expect(readDoneSnapshot(ENV_ID)).toBeNull();
  });
});
