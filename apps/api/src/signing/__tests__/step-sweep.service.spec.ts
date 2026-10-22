import type { AppEnv } from '../../config/env.schema';
import type { Envelope, EnvelopesRepository } from '../../envelopes/envelopes.repository';
import { makeEnvelope, makeSigner } from '../../../test/factories';
import type { SigningOrderService } from '../signing-order.service';
import {
  STEP_SWEEP_MIN_AGE_MS,
  StepSweepRepository,
  StepSweepService,
  type StalledStep,
} from '../step-sweep.service';

const ENV_ID = '00000000-0000-0000-0000-0000000000e1';
const A = '00000000-0000-0000-0000-0000000000a1';
const B = '00000000-0000-0000-0000-0000000000b1';
const NOW = new Date('2026-10-22T12:00:00.000Z');

function sequential(overrides: Partial<Envelope> = {}): Envelope {
  return makeEnvelope({
    id: ENV_ID,
    status: 'awaiting_others',
    delivery_mode: 'sequential',
    signers: [
      makeSigner({ id: A, signing_order: 1, signed_at: '2026-10-22T10:00:00.000Z' }),
      makeSigner({ id: B, signing_order: 2, signed_at: null }),
    ],
    ...overrides,
  });
}

class FakeRepo extends StepSweepRepository {
  stalled: StalledStep[] = [{ envelopeId: ENV_ID, signingOrder: 2 }];
  claims: Array<{ step: StalledStep; invitedBefore: Date }> = [];
  claimResult: string[] = [B];
  async findStalledSteps(): Promise<StalledStep[]> {
    return this.stalled;
  }
  async claimStalledStep(step: StalledStep, invitedBefore: Date): Promise<string[]> {
    this.claims.push({ step, invitedBefore });
    const out = this.claimResult;
    this.claimResult = [];
    return out;
  }
}

function build(envelope: Envelope | null, env: Partial<AppEnv> = {}) {
  const repo = new FakeRepo();
  const resumed: Array<{ id: string; order: number; signers: ReadonlyArray<string> }> = [];
  const order = {
    async resumeStep(e: Envelope, signingOrder: number, signerIds: ReadonlyArray<string>) {
      resumed.push({ id: e.id, order: signingOrder, signers: signerIds });
    },
  } as unknown as SigningOrderService;
  const envelopes = {
    async findByIdWithAll() {
      return envelope;
    },
  } as unknown as EnvelopesRepository;
  const svc = new StepSweepService(repo, envelopes, order, {
    WORKER_ENABLED: false,
    ...env,
  } as AppEnv);
  return { svc, repo, resumed };
}

describe('StepSweepService', () => {
  it('claims a stalled active step and resumes it with the claimed signers', async () => {
    const { svc, repo, resumed } = build(sequential());
    const result = await svc.sweep(NOW);
    expect(result).toEqual({
      scanned: 1,
      resumed: 1,
      resumed_envelope_ids: [ENV_ID],
      skipped: 0,
    });
    expect(repo.claims[0]?.invitedBefore).toEqual(new Date(NOW.getTime() - STEP_SWEEP_MIN_AGE_MS));
    expect(resumed).toEqual([{ id: ENV_ID, order: 2, signers: [B] }]);
  });

  it('a second pass (or a concurrent sweep that lost the claim) resumes nothing', async () => {
    const { svc, resumed } = build(sequential());
    await svc.sweep(NOW);
    const again = await svc.sweep(NOW);
    expect(again.resumed).toBe(0);
    expect(again.skipped).toBe(1);
    expect(resumed).toHaveLength(1);
  });

  it.each([
    ['the envelope is gone', null],
    ['the envelope is no longer awaiting', sequential({ status: 'declined' })],
    ['the envelope is parallel', sequential({ delivery_mode: 'parallel' })],
    [
      'the step is no longer the active one',
      sequential({
        signers: [
          makeSigner({ id: A, signing_order: 1, signed_at: null }),
          makeSigner({ id: B, signing_order: 2, signed_at: null }),
        ],
      }),
    ],
  ])('skips without claiming when %s', async (_label, envelope) => {
    const { svc, repo, resumed } = build(envelope);
    const result = await svc.sweep(NOW);
    expect(result.skipped).toBe(1);
    expect(repo.claims).toHaveLength(0);
    expect(resumed).toHaveLength(0);
  });

  it('the tick does nothing while the signingOrder flag is off', async () => {
    const { svc, resumed } = build(sequential());
    await svc.tick();
    expect(resumed).toHaveLength(0);
  });

  it('the tick sweeps once the signingOrder flag is on', async () => {
    const host = globalThis as unknown as {
      __SEALD_FEATURE_OVERRIDES__?: Record<string, boolean> | undefined;
    };
    const prior = host.__SEALD_FEATURE_OVERRIDES__;
    host.__SEALD_FEATURE_OVERRIDES__ = { ...prior, signingOrder: true };
    try {
      const { svc, resumed } = build(sequential());
      await svc.tick();
      expect(resumed).toHaveLength(1);
    } finally {
      host.__SEALD_FEATURE_OVERRIDES__ = prior;
    }
  });

  it('does not schedule a timer without WORKER_ENABLED', () => {
    const spy = jest.spyOn(global, 'setInterval');
    const { svc } = build(sequential());
    svc.onModuleInit();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
    svc.onModuleDestroy();
  });
});
