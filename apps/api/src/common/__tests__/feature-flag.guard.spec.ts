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
  'appendCertificate',
  'mcpServer',
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
    expect(() => requireFlag('signingOrder')).toThrow(NotFoundException);
  });

  it('passes when an override switches the flag on, and is dark again after cleanup', () => {
    host.__SEALD_FEATURE_OVERRIDES__ = { signingOrder: true };
    expect(() => requireFlag('signingOrder')).not.toThrow();

    delete host.__SEALD_FEATURE_OVERRIDES__;
    expect(() => requireFlag('signingOrder')).toThrow(NotFoundException);
  });
});

describe('WP-00 feature flag seeds', () => {
  it.each(WP00_FLAGS)('%s defaults to false', (flag) => {
    expect(FEATURE_FLAGS[flag]).toBe(false);
  });
});
