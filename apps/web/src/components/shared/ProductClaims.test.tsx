import { describe, expect, it } from 'vitest';
import { RECORD_ACCESS_ATTESTATION } from 'shared';

describe('shared product claims', () => {
  it('keeps the record-access attestation as a capability, not a completed download', () => {
    expect(RECORD_ACCESS_ATTESTATION).toMatch(/can open and download/i);
    expect(RECORD_ACCESS_ATTESTATION).not.toMatch(/was able to open/i);
  });
});
