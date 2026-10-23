import { HttpException } from '@nestjs/common';
import type { ApprovalsLifecycleService } from '../approvals-lifecycle.service';
import type { DeliveryHealth, McpSendUsage, SendGuardRepository } from '../send-guard.repository';
import { SendGuardService, isDeliverySuspended } from '../send-guard.service';

const OWNER = '00000000-0000-4000-8000-0000000000a1';
const KEY = '00000000-0000-4000-8000-0000000000c1';
const NOW = new Date('2026-10-02T23:00:00.000Z');

function guard(
  usage: McpSendUsage,
  health: DeliveryHealth = { sent: 0, bounced: 0, complaints: 0 },
  keySuspended = false,
) {
  const calls: string[] = [];
  const repo: SendGuardRepository = {
    lockOwner: async () => {
      calls.push('lockOwner');
    },
    lockEnvelope: async () => {
      calls.push('lockEnvelope');
    },
    usageSince: async (_owner, since) => {
      calls.push(`usageSince:${since.toISOString()}`);
      return usage;
    },
    deliveryHealthSince: async (_owner, since) => {
      calls.push(`health:${since.toISOString()}`);
      return health;
    },
  };
  const lifecycle = {
    isSendSuspended: async () => keySuspended,
  } as unknown as ApprovalsLifecycleService;
  return { svc: new SendGuardService(repo, lifecycle), calls };
}

async function slugOf(p: Promise<unknown>): Promise<{ slug: string; retryAfter?: number }> {
  try {
    await p;
  } catch (err) {
    if (err instanceof HttpException) {
      const body = err.getResponse() as { message: string; retryAfter?: number } | string;
      return typeof body === 'string' ? { slug: body } : { slug: body.message, ...body };
    }
    throw err;
  }
  return { slug: 'none' };
}

describe('SendGuardService', () => {
  it('allows the 20th send and refuses the 21st, retrying at UTC midnight', async () => {
    expect(
      (await slugOf(guard({ sends: 19, newRecipients: 0 }).svc.assertCaps(OWNER, 0, NOW))).slug,
    ).toBe('none');
    const refused = await slugOf(
      guard({ sends: 20, newRecipients: 0 }).svc.assertCaps(OWNER, 0, NOW),
    );
    expect(refused).toMatchObject({ slug: 'send_daily_cap', retryAfter: 3600 });
  });

  it('counts the rows of a bulk batch as that many sends (WP-26)', async () => {
    const g = guard({ sends: 12, newRecipients: 0 });
    expect((await slugOf(g.svc.assertCaps(OWNER, 0, NOW, 8))).slug).toBe('none');
    expect((await slugOf(g.svc.assertCaps(OWNER, 0, NOW, 9))).slug).toBe('send_daily_cap');
    expect((await slugOf(g.svc.assertCapsLocked(OWNER, 0, NOW, 9))).slug).toBe('send_daily_cap');
    expect(g.calls.filter((c) => c === 'lockOwner')).toHaveLength(1);
  });

  it('counts the new recipients of this send against the 25 a day', async () => {
    const g = guard({ sends: 0, newRecipients: 23 });
    expect((await slugOf(g.svc.assertCaps(OWNER, 2, NOW))).slug).toBe('none');
    expect((await slugOf(g.svc.assertCaps(OWNER, 3, NOW))).slug).toBe('recipient_daily_cap');
    // The day starts at UTC midnight.
    expect(g.calls).toContain('usageSince:2026-10-02T00:00:00.000Z');
  });

  it('takes the owner lock before counting on the send path', async () => {
    const g = guard({ sends: 0, newRecipients: 0 });
    await g.svc.assertCapsLocked(OWNER, 1, NOW);
    expect(g.calls[0]).toBe('lockOwner');
    expect(g.calls[1]).toMatch(/^usageSince:/);
  });

  it('suspends on 2 complaints or a bounce rate over 5% in 7 days', async () => {
    expect(isDeliverySuspended({ sent: 100, bounced: 5, complaints: 1 })).toBe(false);
    expect(isDeliverySuspended({ sent: 100, bounced: 6, complaints: 0 })).toBe(true);
    expect(isDeliverySuspended({ sent: 1, bounced: 0, complaints: 2 })).toBe(true);
    expect(isDeliverySuspended({ sent: 0, bounced: 0, complaints: 0 })).toBe(false);
    const g = guard({ sends: 0, newRecipients: 0 }, { sent: 10, bounced: 1, complaints: 0 });
    expect((await slugOf(g.svc.assertNotSuspended(OWNER, KEY, NOW))).slug).toBe('send_suspended');
    expect(g.calls).toContain('health:2026-09-25T23:00:00.000Z');
  });

  it('refuses a key suspended after three denials', async () => {
    const g = guard({ sends: 0, newRecipients: 0 }, undefined, true);
    expect((await slugOf(g.svc.assertNotSuspended(OWNER, KEY, NOW))).slug).toBe(
      'key_send_suspended',
    );
  });

  it("reports what is left of today's allowance, never below zero", async () => {
    expect(await guard({ sends: 3, newRecipients: 30 }).svc.remaining(OWNER, NOW)).toEqual({
      sends: 17,
      newRecipients: 0,
    });
  });
});
