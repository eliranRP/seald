import { describe, expect, it } from 'vitest';
import { DRIVE_DISCONNECT_NOTE, RECORD_ACCESS_ATTESTATION } from 'shared';

describe('shared product claims', () => {
  it('keeps the record-access attestation as a capability, not a completed download', () => {
    expect(RECORD_ACCESS_ATTESTATION).toMatch(/can open and download/i);
    expect(RECORD_ACCESS_ATTESTATION).not.toMatch(/was able to open/i);
  });

  it('describes a leftover Drive token without an encryption claim', () => {
    expect(DRIVE_DISCONNECT_NOTE).toBe(
      "Disconnect any time. We ask Google to revoke our access and stop using the saved token. The saved token isn't deleted from our database yet.",
    );
    expect(DRIVE_DISCONNECT_NOTE).not.toMatch(/encrypt/i);
  });
});
