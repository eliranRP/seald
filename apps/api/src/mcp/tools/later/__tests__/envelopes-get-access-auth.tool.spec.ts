import { NotFoundException } from '@nestjs/common';
import { EnvelopesGetAccessAuthOutputSchema, type AccessAuthSettings } from 'shared';
import { listTools } from '../../../tool-catalog';
import { resetFlags, setFlags } from '../../__tests__/write-harness';
import {
  ENVELOPE_ID,
  OWNER,
  SIGNER_ID,
  call,
  errorOf,
  laterWorld,
  ok,
  principal,
} from './later-harness';

const settings: AccessAuthSettings = {
  access_auth: 'email_otp',
  action_auth: 'none',
  signers: [
    {
      signer_id: SIGNER_ID,
      access_auth: null,
      action_auth: 'email_otp',
      effective_access_auth: 'email_otp',
      effective_action_auth: 'email_otp',
    },
  ],
};

describe('envelopes_get_access_auth', () => {
  beforeEach(() => {
    setFlags();
  });
  afterEach(() => {
    resetFlags();
  });

  it('returns the settings of the owner’s envelope', async () => {
    const w = laterWorld();
    w.answers.set('accessAuth.getSettings', settings);
    const out = ok(await call(w, 'envelopes_get_access_auth', { envelope_id: ENVELOPE_ID }));
    expect(EnvelopesGetAccessAuthOutputSchema.safeParse(out).success).toBe(true);
    expect(out).toEqual(settings);
    expect(w.calls[0]?.args).toEqual([OWNER, ENVELOPE_ID]);
  });

  it('is read-only, scoped to envelopes:read, and an unknown envelope is not found', async () => {
    const w = laterWorld();
    w.answers.set('accessAuth.getSettings', new NotFoundException('envelope_not_found'));
    expect(
      errorOf(await call(w, 'envelopes_get_access_auth', { envelope_id: ENVELOPE_ID })).slug,
    ).toBe('envelope_not_found');
    expect(
      errorOf(
        await call(w, 'envelopes_get_access_auth', { envelope_id: ENVELOPE_ID }, principal([])),
      ).slug,
    ).toBe('insufficient_scope');
  });

  it('is hidden while signerAccessAuth is off', () => {
    setFlags({ signerAccessAuth: false });
    expect(listTools().map((t) => t.name)).not.toContain('envelopes_get_access_auth');
  });
});
