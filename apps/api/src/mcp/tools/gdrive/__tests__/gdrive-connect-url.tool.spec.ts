import { findTokenShapedStrings } from '../../../leak-scan';
import {
  callWrite,
  err,
  ok,
  resetFlags,
  setFlags,
  writeWorld,
} from '../../__tests__/write-harness';

describe('gdrive_connect_url', () => {
  beforeEach(() => setFlags());
  afterEach(() => resetFlags());

  it('returns the Seald settings page, never a Google consent URL or token', async () => {
    const w = writeWorld();
    const out = ok(await callWrite(w, 'gdrive_connect_url', {}));
    expect(out['url']).toBe('https://seald.test/settings/integrations');
    expect(String(out['url'])).not.toMatch(/google|state=|code_challenge/);
    expect(findTokenShapedStrings(out)).toEqual([]);
  });

  it('needs gdrive:read', async () => {
    const w = writeWorld();
    expect(
      err(await callWrite(w, 'gdrive_connect_url', {}, { scopes: ['documents:write'] })).slug,
    ).toBe('insufficient_scope');
    expect(err(await callWrite(w, 'gdrive_connect_url', { return: '/x' })).slug).toBe(
      'validation_error',
    );
  });
});
