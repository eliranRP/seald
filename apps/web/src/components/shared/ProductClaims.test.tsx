import { describe, expect, it } from 'vitest';
import { DRIVE_DISCONNECT_NOTE, RECORD_ACCESS_ATTESTATION } from 'shared';

describe('shared product claims', () => {
  it('keeps the record-access attestation as a capability, not a completed download', () => {
    expect(RECORD_ACCESS_ATTESTATION).toMatch(/can open and download/i);
    expect(RECORD_ACCESS_ATTESTATION).not.toMatch(/was able to open/i);
  });

  it('says Drive disconnect asks Google to revoke access and deletes the saved token', () => {
    expect(DRIVE_DISCONNECT_NOTE).toBe(
      'Disconnect any time. We ask Google to revoke our access and delete the saved token.',
    );
    expect(DRIVE_DISCONNECT_NOTE).not.toMatch(/encrypt/i);
    expect(DRIVE_DISCONNECT_NOTE).not.toMatch(/database/i);
  });
});
