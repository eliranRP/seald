import { ConflictException } from '@nestjs/common';
import type { AccessAuthSettings } from 'shared';
import { listTools } from '../../../tool-catalog';
import { resetFlags, setFlags } from '../../__tests__/write-harness';
import {
  ENVELOPE_ID,
  OWNER,
  SIGNER_ID,
  call,
  dry,
  errorOf,
  laterWorld,
  ok,
  principal,
  write,
} from './later-harness';

const WRITE_SCOPES = ['envelopes:read', 'envelopes:write'] as const;
const settings: AccessAuthSettings = {
  access_auth: 'email_otp',
  action_auth: 'email_otp',
  signers: [],
};

describe('envelopes_set_access_auth', () => {
  beforeEach(() => {
    setFlags();
  });
  afterEach(() => {
    resetFlags();
  });

  it('passes only the settings the caller sent to patchSettings', async () => {
    const w = laterWorld();
    w.answers.set('accessAuth.patchSettings', settings);
    const out = ok(
      await call(
        w,
        'envelopes_set_access_auth',
        write({
          envelope_id: ENVELOPE_ID,
          access_auth: 'email_otp',
          signers: [{ signer_id: SIGNER_ID, action_auth: null }],
        }),
        principal(WRITE_SCOPES),
      ),
    );
    expect(out).toEqual(settings);
    expect(w.calls[0]?.args).toEqual([
      OWNER,
      ENVELOPE_ID,
      { access_auth: 'email_otp', signers: [{ signer_id: SIGNER_ID, action_auth: null }] },
    ]);
  });

  it('needs at least one setting, and a method outside none/email_otp is refused', async () => {
    const w = laterWorld();
    const p = principal(WRITE_SCOPES);
    expect(
      errorOf(await call(w, 'envelopes_set_access_auth', write({ envelope_id: ENVELOPE_ID }), p))
        .slug,
    ).toBe('validation_error');
    expect(
      errorOf(
        await call(
          w,
          'envelopes_set_access_auth',
          write({ envelope_id: ENVELOPE_ID, access_auth: 'sms' }),
          p,
        ),
      ).slug,
    ).toBe('validation_error');
    expect(w.calls).toEqual([]);
  });

  it('a sent envelope is envelope_not_draft', async () => {
    const w = laterWorld();
    w.answers.set('accessAuth.patchSettings', new ConflictException('envelope_not_draft'));
    expect(
      errorOf(
        await call(
          w,
          'envelopes_set_access_auth',
          write({ envelope_id: ENVELOPE_ID, action_auth: 'none' }),
          principal(WRITE_SCOPES),
        ),
      ).slug,
    ).toBe('envelope_not_draft');
  });

  it('dry_run checks the draft and the signer ids without writing', async () => {
    const w = laterWorld();
    w.answers.set('envelopes.getById', {
      id: ENVELOPE_ID,
      status: 'draft',
      signers: [{ id: SIGNER_ID }],
    });
    const out = ok(
      await call(
        w,
        'envelopes_set_access_auth',
        dry({ envelope_id: ENVELOPE_ID, access_auth: 'none' }),
        principal(WRITE_SCOPES),
      ),
    );
    expect(out).toMatchObject({ dry_run: true, would: { envelope_id: ENVELOPE_ID } });
    expect(w.calls.map((c) => c.method)).toEqual(['getById']);

    w.answers.set('envelopes.getById', { id: ENVELOPE_ID, status: 'awaiting_others', signers: [] });
    expect(
      errorOf(
        await call(
          w,
          'envelopes_set_access_auth',
          dry({ envelope_id: ENVELOPE_ID, access_auth: 'none' }),
          principal(WRITE_SCOPES),
        ),
      ).slug,
    ).toBe('envelope_not_draft');
  });

  it('is hidden while signerAccessAuth is off', () => {
    setFlags({ signerAccessAuth: false });
    expect(listTools().map((t) => t.name)).not.toContain('envelopes_set_access_auth');
  });
});
