import { NotFoundException } from '@nestjs/common';
import { FEATURE_FLAGS, type FeatureFlag } from 'shared';
import { requireFlag } from '../feature-flag.guard';

type OverrideHost = { __SEALD_FEATURE_OVERRIDES__?: Partial<Record<FeatureFlag, boolean>> };

const host = globalThis as unknown as OverrideHost;

const WP00_FLAGS: FeatureFlag[] = [
  'multiDocumentEnvelopes',
  'signingOrder',
  'fieldMetaV2',
  'customReminders',
  'signerAccessAuth',
  'mcpServer',
  'mcpOauth',
  'workflowAutomations',
  'publicApi',
  'bulkSend',
  'directLinks',
  'i18n',
];

afterEach(() => {
  delete host.__SEALD_FEATURE_OVERRIDES__;
});

describe('requireFlag', () => {
  it('throws NotFoundException when the flag is off', () => {
    host.__SEALD_FEATURE_OVERRIDES__ = { signingOrder: false };
    expect(() => requireFlag('signingOrder')).toThrow(NotFoundException);
  });

  it('passes when an override switches the flag on, and falls back to the shipped default after cleanup', () => {
    host.__SEALD_FEATURE_OVERRIDES__ = { signingOrder: true };
    expect(() => requireFlag('signingOrder')).not.toThrow();

    host.__SEALD_FEATURE_OVERRIDES__ = { signingOrder: false };
    expect(() => requireFlag('signingOrder')).toThrow(NotFoundException);

    delete host.__SEALD_FEATURE_OVERRIDES__;
    if (FEATURE_FLAGS.signingOrder === true) {
      expect(() => requireFlag('signingOrder')).not.toThrow();
    } else {
      expect(() => requireFlag('signingOrder')).toThrow(NotFoundException);
    }
  });
});

describe('parity feature flag seeds', () => {
  // The owner switched every parity flag on (feat/enable-parity-flags).
  it.each(WP00_FLAGS)('%s ships on', (flag) => {
    expect(FEATURE_FLAGS[flag]).toBe(true);
  });

  it('appendCertificate is off: the audit trail is never appended to the sealed PDF', () => {
    expect(FEATURE_FLAGS.appendCertificate).toBe(false);
  });

  it('gdriveMultiAccount stays off (its UI is not part of the parity work)', () => {
    expect(FEATURE_FLAGS.gdriveMultiAccount).toBe(false);
  });
});
