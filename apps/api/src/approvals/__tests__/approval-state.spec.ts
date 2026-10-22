import {
  approvalStatus,
  approveRequires,
  cardState,
  displayKeyName,
  EXECUTION_STALE_MS,
  expiryFrom,
  isFreshForApproval,
  isOpen,
  matchToken,
  planAgentRepreview,
  planOwnerEdit,
  sortRecipients,
  tokenCanDecide,
  type ApprovalRecord,
} from '../approval-state';

const NOW = new Date('2026-10-22T12:00:00.000Z');
const H = 60 * 60 * 1000;
const hash = (c: string) => c.repeat(64);

function record(over: Partial<ApprovalRecord> = {}): ApprovalRecord {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    ownerId: '00000000-0000-4000-8000-0000000000a1',
    apiKeyId: '00000000-0000-4000-8000-0000000000c1',
    oauthGrantId: null,
    kind: 'envelope_send',
    tool: 'envelopes_send',
    subjectKey: 'envelope:x',
    envelopeId: null,
    args: {},
    summary: {
      kind: 'envelope_send',
      action_label: 'Send for signature',
      title: 'NDA',
      recipients: [],
      page_count: 1,
      key_name: 'Key 1',
      approver_email: 'owner@example.com',
      destination: null,
    },
    subjectHash: hash('a'),
    linkTokenHash: hash('1'),
    previousTokenHash: null,
    priorTokenHashes: [],
    notify: 'email',
    approveRequires: 'link',
    ownerEditedAt: null,
    expiresAt: new Date(NOW.getTime() + 2 * H).toISOString(),
    approvedAt: null,
    deniedAt: null,
    failedAt: null,
    expiredAt: null,
    completedAt: null,
    expiredReason: null,
    decidedVia: null,
    resultSlug: null,
    result: null,
    createdAt: new Date(NOW.getTime() - H).toISOString(),
    updatedAt: new Date(NOW.getTime() - H).toISOString(),
    ...over,
  };
}

describe('approval state machine', () => {
  describe('approvalStatus', () => {
    it('is pending while open, expired past expires_at even before anything stamps it', () => {
      expect(approvalStatus(record(), NOW).status).toBe('pending');
      expect(approvalStatus(record({ expiresAt: NOW.toISOString() }), NOW).status).toBe('expired');
      expect(approvalStatus(record({ expiredAt: NOW.toISOString() }), NOW).status).toBe('expired');
    });

    it('done needs the action to have completed; until then an approval reads pending', () => {
      const approved = record({ approvedAt: NOW.toISOString() });
      expect(approvalStatus(approved, NOW).status).toBe('pending');
      expect(approvalStatus({ ...approved, completedAt: NOW.toISOString() }, NOW).status).toBe(
        'done',
      );
    });

    it('an approval whose action never finished reads failed / execution_interrupted', () => {
      const approved = record({
        approvedAt: new Date(NOW.getTime() - EXECUTION_STALE_MS - 1).toISOString(),
      });
      expect(approvalStatus(approved, NOW)).toEqual({
        status: 'failed',
        resultSlug: 'execution_interrupted',
      });
    });

    it('denied wins over everything, failed carries its slug, an approved row past 24h stays done', () => {
      expect(approvalStatus(record({ deniedAt: NOW.toISOString() }), NOW).status).toBe('denied');
      expect(
        approvalStatus(record({ failedAt: NOW.toISOString(), resultSlug: 'api_key_revoked' }), NOW),
      ).toEqual({ status: 'failed', resultSlug: 'api_key_revoked' });
      const late = new Date(NOW.getTime() + 48 * H);
      expect(
        approvalStatus(
          record({ approvedAt: NOW.toISOString(), completedAt: NOW.toISOString() }),
          late,
        ).status,
      ).toBe('done');
    });

    it('isOpen only before any outcome and inside 24 hours', () => {
      expect(isOpen(record(), NOW)).toBe(true);
      expect(isOpen(record({ deniedAt: NOW.toISOString() }), NOW)).toBe(false);
      expect(isOpen(record({ expiresAt: NOW.toISOString() }), NOW)).toBe(false);
    });

    it('expiry is 24 hours from the given moment', () => {
      expect(Date.parse(expiryFrom(NOW)) - NOW.getTime()).toBe(24 * H);
    });
  });

  describe('tokens and card states', () => {
    const r = record({
      linkTokenHash: hash('c'),
      previousTokenHash: hash('p'),
      priorTokenHashes: [hash('o')],
    });

    it('matches the current token, the single alias and replaced tokens', () => {
      expect(matchToken(r, hash('c'))).toBe('current');
      expect(matchToken(r, hash('p'))).toBe('alias');
      expect(matchToken(r, hash('o'))).toBe('prior');
      expect(matchToken(r, hash('z'))).toBeNull();
      expect(tokenCanDecide('current')).toBe(true);
      expect(tokenCanDecide('alias')).toBe(true);
      expect(tokenCanDecide('prior')).toBe(false);
      expect(tokenCanDecide(null)).toBe(false);
    });

    it('a re-previewed link reads superseded ("Updated, see the newest email"), not expired', () => {
      expect(cardState(r, 'prior', NOW)).toBe('superseded');
      expect(cardState(r, 'current', NOW)).toBe('pending');
      expect(cardState(r, 'alias', NOW)).toBe('pending');
    });

    it('an unknown token reads expired; a used link shows its decision, not expired', () => {
      expect(cardState(null, null, NOW)).toBe('expired');
      expect(cardState(r, null, NOW)).toBe('expired');
      const done = { ...r, approvedAt: NOW.toISOString(), completedAt: NOW.toISOString() };
      expect(cardState(done, 'current', NOW)).toBe('done');
      expect(cardState({ ...r, deniedAt: NOW.toISOString() }, 'alias', NOW)).toBe('denied');
      // A re-previewed link of a decided row shows the decision.
      expect(cardState(done, 'prior', NOW)).toBe('done');
    });
  });

  describe('agent re-preview', () => {
    it('is a no-op when the subject did not change', () => {
      expect(planAgentRepreview(record(), hash('a'), NOW)).toEqual({ kind: 'unchanged' });
    });

    it('keeps the id, moves the current token and the alias into prior hashes, restarts 24h', () => {
      const r = record({
        linkTokenHash: hash('c'),
        previousTokenHash: hash('p'),
        priorTokenHashes: [hash('o')],
      });
      const plan = planAgentRepreview(r, hash('b'), NOW);
      expect(plan).toEqual({
        kind: 'repreview',
        subjectHash: hash('b'),
        priorTokenHashes: [hash('o'), hash('c'), hash('p')],
        expiresAt: expiryFrom(NOW),
      });
    });

    it('a row whose email was never minted moves nothing', () => {
      const plan = planAgentRepreview(record({ linkTokenHash: null }), hash('b'), NOW);
      expect(plan.kind === 'repreview' && plan.priorTokenHashes).toEqual([]);
    });
  });

  describe('owner edit re-mint', () => {
    it('the latest email token becomes the one alias and the 24 hours restart', () => {
      const plan = planOwnerEdit(record({ linkTokenHash: hash('1') }), hash('b'), NOW);
      expect(plan).toEqual({
        kind: 'remint',
        subjectHash: hash('b'),
        previousTokenHash: hash('1'),
        expiresAt: expiryFrom(NOW),
        ownerEditedAt: NOW.toISOString(),
      });
    });

    it('a second edit overwrites the alias: the first link then matches nothing (expired)', () => {
      // Edit 1: link 1 → alias. Email 2 is minted (link 2).
      const first = planOwnerEdit(record({ linkTokenHash: hash('1') }), hash('b'), NOW);
      if (first.kind !== 'remint') throw new Error('expected remint');
      const afterFirst = record({
        subjectHash: first.subjectHash,
        previousTokenHash: first.previousTokenHash,
        linkTokenHash: hash('2'),
      });
      expect(cardState(afterFirst, matchToken(afterFirst, hash('1')), NOW)).toBe('pending');
      // Edit 2: link 2 → alias; link 1 is gone.
      const second = planOwnerEdit(afterFirst, hash('c'), NOW);
      if (second.kind !== 'remint') throw new Error('expected remint');
      const afterSecond = record({
        subjectHash: second.subjectHash,
        previousTokenHash: second.previousTokenHash,
        linkTokenHash: hash('3'),
      });
      expect(matchToken(afterSecond, hash('1'))).toBeNull();
      expect(cardState(afterSecond, matchToken(afterSecond, hash('1')), NOW)).toBe('expired');
      expect(matchToken(afterSecond, hash('2'))).toBe('alias');
      expect(matchToken(afterSecond, hash('3'))).toBe('current');
    });

    it('keeps the alias when no email was minted since the last edit', () => {
      const plan = planOwnerEdit(
        record({ linkTokenHash: null, previousTokenHash: hash('1') }),
        hash('b'),
        NOW,
      );
      expect(plan.kind === 'remint' && plan.previousTokenHash).toBe(hash('1'));
    });

    it('an unchanged subject is a no-op', () => {
      expect(planOwnerEdit(record(), hash('a'), NOW)).toEqual({ kind: 'unchanged' });
    });
  });

  describe('who may approve without a session', () => {
    const known = [{ name: 'Ada', email: 'ada@x.test', is_new: false }];
    const base = { highRisk: false, recipients: known, alwaysRequireSignin: false, batchSize: 1 };

    it('login-free only when every recipient is known and nothing else asks for a session', () => {
      expect(approveRequires(base)).toBe('link');
      expect(
        approveRequires({
          ...base,
          recipients: [...known, { name: 'N', email: 'n@x.test', is_new: true }],
        }),
      ).toBe('session');
      expect(approveRequires({ ...base, highRisk: true })).toBe('session');
      expect(approveRequires({ ...base, alwaysRequireSignin: true })).toBe('session');
      expect(approveRequires({ ...base, batchSize: 5 })).toBe('link');
      expect(approveRequires({ ...base, batchSize: 6 })).toBe('session');
    });

    it('a fresh sign-in is amr within 12 hours, never in the future', () => {
      const s = NOW.getTime() / 1000;
      expect(isFreshForApproval(s - 11 * 3600, NOW)).toBe(true);
      expect(isFreshForApproval(s - 13 * 3600, NOW)).toBe(false);
      expect(isFreshForApproval(s + 3600, NOW)).toBe(false);
      expect(isFreshForApproval(null, NOW)).toBe(false);
      expect(isFreshForApproval(undefined, NOW)).toBe(false);
    });
  });

  it('sorts New recipients first and names a nameless key "Sent via API key"', () => {
    expect(
      sortRecipients([
        { name: 'A', email: 'a@x', is_new: false },
        { name: 'B', email: 'b@x', is_new: true },
        { name: 'C', email: 'c@x', is_new: false },
        { name: 'D', email: 'd@x', is_new: true },
      ]).map((r) => r.name),
    ).toEqual(['B', 'D', 'A', 'C']);
    expect(displayKeyName('Key 2')).toBe('Key 2');
    expect(displayKeyName('  ')).toBe('Sent via API key');
    expect(displayKeyName(null)).toBe('Sent via API key');
  });
});
