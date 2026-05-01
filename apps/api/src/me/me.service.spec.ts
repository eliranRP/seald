import { ServiceUnavailableException } from '@nestjs/common';
import type { AuthUser } from '../auth/auth-user';
import type { ContactsRepository } from '../contacts/contacts.repository';
import type { OutboundEmailsRepository } from '../email/outbound-emails.repository';
import type { EnvelopesRepository } from '../envelopes/envelopes.repository';
import type { TemplatesRepository } from '../templates/templates.repository';
import type { IdempotencyRepository } from './idempotency.repository';
import { MeService } from './me.service';
import { SupabaseAdminClient, SupabaseAdminError } from './supabase-admin.client';

const USER: AuthUser = {
  id: '11111111-1111-1111-1111-111111111111',
  email: 'maya@example.com',
  provider: 'email',
};

function makeMocks() {
  const calls: string[] = [];
  const contactsRepo = {
    findAllByOwner: jest.fn(async () => [{ id: 'c1', name: 'A', email: 'a@x' }]),
  } as unknown as ContactsRepository;
  const templatesRepo = {
    findAllByOwner: jest.fn(async () => [{ id: 't1', title: 'T1' }]),
  } as unknown as TemplatesRepository;
  const envelopesRepo = {
    listByOwner: jest.fn(async () => ({
      items: [{ id: 'env-1' }],
      next_cursor: null,
    })),
    findByIdWithAll: jest.fn(async (id: string) => ({
      id,
      owner_id: USER.id,
      title: 'NDA',
      short_code: 'aaaaaaaaaaaaa',
      signers: [{ id: 's1', email: 'a@x', name: 'A' }],
      fields: [],
    })),
    listEventsForEnvelope: jest.fn(async () => [{ id: 'e1', event_type: 'created' }]),
  } as unknown as EnvelopesRepository;
  const outboundEmailsRepo = {
    listByEnvelope: jest.fn(async () => [{ id: 'oe1', kind: 'invite' }]),
  } as unknown as OutboundEmailsRepository;
  const idempotencyRepo = {
    deleteByUser: jest.fn(async () => {
      calls.push('idempotency.deleteByUser');
      return 3;
    }),
  } as unknown as IdempotencyRepository;
  const supabaseAdmin = {
    deleteUser: jest.fn(async () => {
      calls.push('supabaseAdmin.deleteUser');
    }),
  } as unknown as SupabaseAdminClient;
  return {
    calls,
    contactsRepo,
    templatesRepo,
    envelopesRepo,
    outboundEmailsRepo,
    idempotencyRepo,
    supabaseAdmin,
  };
}

function build(mocks: ReturnType<typeof makeMocks>): MeService {
  return new MeService(
    mocks.contactsRepo,
    mocks.envelopesRepo,
    mocks.templatesRepo,
    mocks.outboundEmailsRepo,
    mocks.idempotencyRepo,
    mocks.supabaseAdmin,
  );
}

describe('MeService.exportAll', () => {
  it('builds an AccountExport with meta + counts + nested envelope bundles', async () => {
    const mocks = makeMocks();
    const svc = build(mocks);
    const out = await svc.exportAll(USER);
    expect(out.meta.format_version).toBe('1.0');
    expect(out.meta.user).toEqual({ id: USER.id, email: USER.email });
    expect(out.meta.includes_files).toBe(false);
    expect(out.meta.counts).toEqual({
      contacts: 1,
      envelopes: 1,
      templates: 1,
      outbound_emails: 1,
    });
    expect(out.contacts).toHaveLength(1);
    expect(out.templates).toHaveLength(1);
    expect(out.envelopes).toHaveLength(1);
    expect(out.envelopes[0]?.envelope.id).toBe('env-1');
    expect(out.envelopes[0]?.events).toHaveLength(1);
    expect(out.envelopes[0]?.outbound_emails).toHaveLength(1);
  });

  it('skips envelopes that disappear mid-flight rather than crashing', async () => {
    const mocks = makeMocks();
    (mocks.envelopesRepo.findByIdWithAll as jest.Mock).mockResolvedValueOnce(null);
    const svc = build(mocks);
    const out = await svc.exportAll(USER);
    expect(out.envelopes).toHaveLength(0);
    expect(out.meta.counts.envelopes).toBe(0);
  });
});

describe('MeService.deleteAccount', () => {
  it('wipes idempotency_records BEFORE calling Supabase admin (FK does not cascade)', async () => {
    const mocks = makeMocks();
    const svc = build(mocks);
    await svc.deleteAccount(USER);
    // Order matters — see service comment. If a future refactor swaps
    // them this assertion will fail.
    expect(mocks.calls).toEqual(['idempotency.deleteByUser', 'supabaseAdmin.deleteUser']);
    expect(mocks.idempotencyRepo.deleteByUser).toHaveBeenCalledWith(USER.id);
    expect(mocks.supabaseAdmin.deleteUser).toHaveBeenCalledWith(USER.id);
  });

  it('maps SupabaseAdminError to a 503 (ServiceUnavailableException)', async () => {
    const mocks = makeMocks();
    (mocks.supabaseAdmin.deleteUser as jest.Mock).mockRejectedValueOnce(
      new SupabaseAdminError('SUPABASE_SERVICE_ROLE_KEY is not configured'),
    );
    const svc = build(mocks);
    await expect(svc.deleteAccount(USER)).rejects.toBeInstanceOf(ServiceUnavailableException);
    // idempotency wipe still happened (it ran before the admin call).
    expect(mocks.idempotencyRepo.deleteByUser).toHaveBeenCalledWith(USER.id);
  });

  it('rethrows non-SupabaseAdminError errors verbatim', async () => {
    const mocks = makeMocks();
    const boom = new Error('boom');
    (mocks.supabaseAdmin.deleteUser as jest.Mock).mockRejectedValueOnce(boom);
    const svc = build(mocks);
    await expect(svc.deleteAccount(USER)).rejects.toBe(boom);
  });
});
