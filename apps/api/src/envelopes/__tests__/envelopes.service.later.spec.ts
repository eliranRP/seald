import { InMemoryContactsRepository } from '../../../test/in-memory-contacts-repository';
import { InMemoryEnvelopesRepository } from '../../../test/in-memory-envelopes-repository';
import { InMemoryOutboundEmailsRepository } from '../../../test/in-memory-outbound-emails-repository';
import { InMemoryStorageService } from '../../../test/in-memory-storage';
import type { AppEnv } from '../../config/env.schema';
import type { GdriveExportService } from '../../integrations/gdrive/gdrive-export.service';
import type { GdriveEnvelopeExportsRepository } from '../../integrations/gdrive/gdrive-envelope-exports.repository';
import type { GDriveService } from '../../integrations/gdrive/gdrive.service';
import { EnvelopesService } from '../envelopes.service';

/**
 * Fix a signer and change an expiry (WP-26), over the in-memory
 * repository: the rules the approval kinds and the MCP tools rely on.
 */
const OWNER = '00000000-0000-4000-8000-0000000000a1';
const OTHER = '00000000-0000-4000-8000-0000000000b2';
const NOW = new Date('2026-10-02T12:00:00.000Z');
const MCP = {
  auth: 'api_key',
  key_id: '99999999-9999-4999-8999-999999999999',
  key_prefix: 'seald_live_abcd',
  key_name: 'Key 1',
  oauth_client_id: null,
  oauth_grant_id: null,
  acting_for_user_id: OWNER,
  acting_for_email: 'owner@example.com',
  tool: 'envelopes_fix_signer',
  approval: 'email',
  approved_by_session: true,
} as const;

describe('EnvelopesService: fix a signer and change an expiry', () => {
  let repo: InMemoryEnvelopesRepository;
  let outbound: InMemoryOutboundEmailsRepository;
  let svc: EnvelopesService;

  beforeEach(() => {
    repo = new InMemoryEnvelopesRepository();
    outbound = new InMemoryOutboundEmailsRepository();
    svc = new EnvelopesService(
      repo,
      new InMemoryContactsRepository(),
      new InMemoryStorageService(),
      outbound,
      { APP_PUBLIC_URL: 'https://seald.test' } as AppEnv,
      {} as GDriveService,
      {} as GdriveExportService,
      { findLatestByEnvelope: async () => null } as unknown as GdriveEnvelopeExportsRepository,
    );
  });

  /** A sent envelope with signers Ada and Bob. */
  async function sent(): Promise<{ id: string; ada: string; bob: string }> {
    const draft = await svc.createDraft(OWNER, { title: 'Lease' });
    const ada = await svc.addSigner(OWNER, draft.id, { email: 'ada@example.com', name: 'Ada' });
    const bob = await svc.addSigner(OWNER, draft.id, { email: 'bob@example.com', name: 'Bob' });
    const env = repo.envelopes.get(draft.id);
    if (!env) throw new Error('missing');
    repo.envelopes.set(draft.id, {
      ...env,
      status: 'awaiting_others',
      sent_at: NOW.toISOString(),
      sender_email: 'owner@example.com',
      sender_name: 'Owner',
    });
    return { id: draft.id, ada: ada.id, bob: bob.id };
  }

  const eventsOf = (id: string, type: string) =>
    repo.events.filter((e) => e.envelope_id === id && e.event_type === type);

  describe('fixSigner', () => {
    it('corrects the email: event with attribution, a new invite and a note to the old address', async () => {
      const { id, ada } = await sent();
      const out = await svc.fixSigner(
        OWNER,
        id,
        ada,
        { email: 'ada.lovelace@example.com' },
        { ip: '203.0.113.9', user_agent: 'UA' },
        { mcp: MCP },
        NOW,
      );
      expect(out).toMatchObject({
        email_changed: true,
        signer: { email: 'ada.lovelace@example.com', name: 'Ada' },
      });
      const [event] = eventsOf(id, 'signer_corrected');
      expect(event).toMatchObject({
        signer_id: ada,
        actor_kind: 'sender',
        metadata: {
          previous_email: 'ada@example.com',
          new_email: 'ada.lovelace@example.com',
          email_changed: true,
          mcp: MCP,
        },
      });
      const mail = outbound.rows.map((r) => [r.kind, r.to_email, r.signer_id]);
      expect(mail).toEqual([
        ['invite', 'ada.lovelace@example.com', ada],
        ['signer_corrected', 'ada@example.com', ada],
      ]);
      // Both rows hang off the audit event, and neither carries a link.
      expect(outbound.rows.every((r) => r.source_event_id === event?.id)).toBe(true);
      expect(JSON.stringify(outbound.rows.map((r) => r.payload))).not.toContain('?t=');
      expect(outbound.rows[1]?.payload).toMatchObject({
        sender_name: 'Owner',
        envelope_title: 'Lease',
      });
    });

    it('corrects only the name: a new invite, and no note to an address that did not change', async () => {
      const { id, ada } = await sent();
      await svc.fixSigner(OWNER, id, ada, { name: 'Ada Lovelace' }, undefined, undefined, NOW);
      expect(outbound.rows.map((r) => r.kind)).toEqual(['invite']);
      expect(eventsOf(id, 'signer_corrected')[0]?.metadata).toMatchObject({
        previous_name: 'Ada',
        new_name: 'Ada Lovelace',
        email_changed: false,
      });
      // SPA-style callers pass no attribution, so the event has no `mcp` key.
      expect(eventsOf(id, 'signer_corrected')[0]?.metadata).not.toHaveProperty('mcp');
    });

    it('does not invite a later sequential step before its turn', async () => {
      const { id, ada, bob } = await sent();
      const env = repo.envelopes.get(id);
      if (!env) throw new Error('missing');
      repo.envelopes.set(id, {
        ...env,
        delivery_mode: 'sequential',
        signers: env.signers.map((s) => ({ ...s, signing_order: s.id === bob ? 2 : 1 })),
      });
      await svc.fixSigner(OWNER, id, bob, { email: 'bob2@example.com' }, undefined, undefined, NOW);
      expect(outbound.rows.map((r) => [r.kind, r.signer_id])).toEqual([['signer_corrected', bob]]);
      outbound.reset();
      await svc.fixSigner(OWNER, id, ada, { name: 'Ada B' }, undefined, undefined, NOW);
      expect(outbound.rows.map((r) => r.kind)).toEqual(['invite']);
    });

    it('refuses a signer who signed or declined, a draft, and a stranger’s envelope', async () => {
      const { id, ada, bob } = await sent();
      const env = repo.envelopes.get(id);
      if (!env) throw new Error('missing');
      repo.envelopes.set(id, {
        ...env,
        signers: env.signers.map((s) =>
          s.id === ada
            ? { ...s, signed_at: NOW.toISOString(), status: 'completed' as const }
            : s.id === bob
              ? { ...s, declined_at: NOW.toISOString(), status: 'declined' as const }
              : s,
        ),
      });
      await expect(svc.fixSigner(OWNER, id, ada, { name: 'X' })).rejects.toThrow(
        'signer_already_signed',
      );
      await expect(svc.fixSigner(OWNER, id, bob, { name: 'X' })).rejects.toThrow(
        'already_declined',
      );
      await expect(svc.fixSigner(OTHER, id, ada, { name: 'X' })).rejects.toThrow(
        'envelope_not_found',
      );
      const draft = await svc.createDraft(OWNER, { title: 'D' });
      const s = await svc.addSigner(OWNER, draft.id, { email: 'd@example.com', name: 'D' });
      await expect(svc.fixSigner(OWNER, draft.id, s.id, { name: 'X' })).rejects.toThrow(
        'envelope_terminal',
      );
      expect(outbound.rows).toEqual([]);
      expect(eventsOf(id, 'signer_corrected')).toEqual([]);
    });

    it('refuses an unknown signer, no change, and an address another signer has', async () => {
      const { id, ada } = await sent();
      await expect(
        svc.fixSigner(OWNER, id, '00000000-0000-4000-8000-00000000dead', { name: 'X' }),
      ).rejects.toThrow('signer_not_found');
      await expect(svc.fixSigner(OWNER, id, ada, { name: 'Ada' })).rejects.toThrow(
        'signer_unchanged',
      );
      await expect(svc.fixSigner(OWNER, id, ada, { email: 'BOB@example.com' })).rejects.toThrow(
        'signer_email_taken',
      );
    });

    it('checkFixSigner writes nothing', async () => {
      const { id, ada } = await sent();
      await svc.checkFixSigner(OWNER, id, ada, { email: 'new@example.com' });
      expect(outbound.rows).toEqual([]);
      expect(eventsOf(id, 'signer_corrected')).toEqual([]);
      expect(repo.envelopes.get(id)?.signers[0]?.email).toBe('ada@example.com');
    });
  });

  describe('replaceSigner', () => {
    it('swaps the person: event, invite to the new address, note to the old one', async () => {
      const { id, bob } = await sent();
      const out = await svc.replaceSigner(
        OWNER,
        id,
        bob,
        { name: 'Jordan Lee', email: 'jordan@example.com' },
        { ip: null, user_agent: null },
        NOW,
      );
      expect(out.signer).toMatchObject({
        id: bob,
        email: 'jordan@example.com',
        name: 'Jordan Lee',
      });
      expect(eventsOf(id, 'signer_replaced')[0]).toMatchObject({
        signer_id: bob,
        metadata: { previous_email: 'bob@example.com', new_email: 'jordan@example.com' },
      });
      expect(outbound.rows.map((r) => [r.kind, r.to_email])).toEqual([
        ['invite', 'jordan@example.com'],
        ['signer_replaced', 'bob@example.com'],
      ]);
    });

    it('refuses the same address, a taken address and a signer who signed', async () => {
      const { id, ada, bob } = await sent();
      await expect(
        svc.replaceSigner(OWNER, id, bob, { name: 'Bob', email: 'BOB@example.com' }),
      ).rejects.toMatchObject({ message: 'signer_unchanged' });
      await expect(
        svc.replaceSigner(OWNER, id, bob, { name: 'X', email: 'ada@example.com' }),
      ).rejects.toMatchObject({ message: 'signer_email_taken' });
      const env = repo.envelopes.get(id);
      if (!env) throw new Error('missing');
      repo.envelopes.set(id, {
        ...env,
        signers: env.signers.map((x) =>
          x.id === ada ? { ...x, signed_at: NOW.toISOString() } : x,
        ),
      });
      await expect(
        svc.replaceSigner(OWNER, id, ada, { name: 'X', email: 'x@example.com' }),
      ).rejects.toMatchObject({ message: 'signer_already_signed' });
      expect(outbound.rows).toEqual([]);
    });
  });

  describe('changeExpiry', () => {
    it('moves the expiry and records previous and new, with attribution', async () => {
      const { id } = await sent();
      const before = repo.envelopes.get(id)?.expires_at;
      const out = await svc.changeExpiry(
        OWNER,
        id,
        '2026-11-20T09:00:00+02:00',
        { ip: null, user_agent: null },
        { mcp: { ...MCP, tool: 'envelopes_change_expiry' } },
        NOW,
      );
      expect(out).toEqual({ previous_expires_at: before, expires_at: '2026-11-20T07:00:00.000Z' });
      expect(repo.envelopes.get(id)?.expires_at).toBe('2026-11-20T07:00:00.000Z');
      expect(eventsOf(id, 'expiry_changed')[0]).toMatchObject({
        actor_kind: 'sender',
        metadata: {
          previous_expires_at: before,
          expires_at: '2026-11-20T07:00:00.000Z',
          mcp: { tool: 'envelopes_change_expiry' },
        },
      });
    });

    it('keeps the new time inside the bounds of the send controls', async () => {
      const { id } = await sent();
      await expect(
        svc.changeExpiry(OWNER, id, '2026-10-02T18:00:00.000Z', undefined, undefined, NOW),
      ).rejects.toThrow('expiry_out_of_range');
      await expect(
        svc.changeExpiry(OWNER, id, '2027-03-01T00:00:00.000Z', undefined, undefined, NOW),
      ).rejects.toThrow('expiry_out_of_range');
      await expect(
        svc.changeExpiry(OWNER, id, 'not a date', undefined, undefined, NOW),
      ).rejects.toThrow('expiry_out_of_range');
    });

    it('refuses an unchanged time, a draft, a finished envelope and a stranger', async () => {
      const { id } = await sent();
      const env = repo.envelopes.get(id);
      if (!env) throw new Error('missing');
      repo.envelopes.set(id, { ...env, expires_at: '2026-10-20T00:00:00.000Z' });
      await expect(
        svc.changeExpiry(OWNER, id, '2026-10-20T00:00:00.000Z', undefined, undefined, NOW),
      ).rejects.toThrow('expiry_unchanged');
      await expect(
        svc.changeExpiry(OTHER, id, '2026-11-01T00:00:00.000Z', undefined, undefined, NOW),
      ).rejects.toThrow('envelope_not_found');
      repo.envelopes.set(id, { ...env, status: 'completed' });
      await expect(
        svc.changeExpiry(OWNER, id, '2026-11-01T00:00:00.000Z', undefined, undefined, NOW),
      ).rejects.toThrow('envelope_terminal');
      const draft = await svc.createDraft(OWNER, { title: 'D' });
      await expect(
        svc.changeExpiry(OWNER, draft.id, '2026-11-01T00:00:00.000Z', undefined, undefined, NOW),
      ).rejects.toThrow('envelope_terminal');
      expect(eventsOf(id, 'expiry_changed')).toEqual([]);
    });
  });
});
