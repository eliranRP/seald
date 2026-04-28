import sharp from 'sharp';
import type { AppEnv } from '../config/env.schema';
import type { OutboundEmailsRepository } from '../email/outbound-emails.repository';
import type {
  Envelope,
  EnvelopeSigner,
  EnvelopesRepository,
  SetSignerSignatureInput,
} from '../envelopes/envelopes.repository';
import type { StorageService } from '../storage/storage.service';
import { makeEnvelope, makeSigner } from '../../test/factories';
import type { SignerSessionService } from './signer-session.service';
import type { SigningTokenService } from './signing-token.service';
import { SigningService } from './signing.service';

/**
 * Verifies the kind='signature' / kind='initials' split landed end-to-end
 * through the service: each variant must write to its OWN storage path
 * and trigger a repo update with the matching `kind` discriminator. Prior
 * to the split both kinds clobbered each other on disk, which is what the
 * burn-in regression tests are now catching.
 */

const ENV_ID = '00000000-0000-0000-0000-000000000010';
const SIGNER_ID = '00000000-0000-0000-0000-0000000000bb';

// Rule 11.1 — delegate to the shared factories. We keep the tiny
// per-spec wrappers below so the existing call sites (`envelope()`,
// `signer()`) don't need to be touched.
function envelope(): Envelope {
  return makeEnvelope({
    id: ENV_ID,
    owner_id: '00000000-0000-0000-0000-000000000098',
    title: 'Spec',
    short_code: 'SC0000000010',
    status: 'awaiting_others',
  });
}

function signer(): EnvelopeSigner {
  return makeSigner({ id: SIGNER_ID });
}

async function tinyPng(): Promise<Buffer> {
  return sharp({
    create: {
      width: 32,
      height: 16,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 1 },
    },
  })
    .png()
    .toBuffer();
}

interface Captured {
  uploads: Array<{ path: string; bytes: Buffer; contentType: string }>;
  setSignerSignatureCalls: Array<{ signer_id: string; input: SetSignerSignatureInput }>;
}

function makeService(captured: Captured): SigningService {
  const storage: Pick<StorageService, 'upload'> = {
    async upload(path: string, body: Buffer, contentType: string): Promise<void> {
      captured.uploads.push({ path, bytes: Buffer.from(body), contentType });
    },
  };
  const repo: Pick<EnvelopesRepository, 'setSignerSignature'> = {
    async setSignerSignature(
      signer_id: string,
      input: SetSignerSignatureInput,
    ): Promise<EnvelopeSigner> {
      captured.setSignerSignatureCalls.push({ signer_id, input });
      return signer();
    },
  };
  return new SigningService(
    repo as EnvelopesRepository,
    {} as SigningTokenService,
    {} as SignerSessionService,
    storage as StorageService,
    {} as OutboundEmailsRepository,
    { APP_PUBLIC_URL: 'http://localhost' } as AppEnv,
  );
}

describe('SigningService.setSignature — kind branching', () => {
  it("kind='signature' writes to {signer_id}.png and forwards kind='signature' to the repo", async () => {
    const captured: Captured = { uploads: [], setSignerSignatureCalls: [] };
    const svc = makeService(captured);
    await svc.setSignature(envelope(), signer(), await tinyPng(), {
      kind: 'signature',
      format: 'drawn',
    });

    expect(captured.uploads).toHaveLength(1);
    expect(captured.uploads[0]!.path).toBe(`${ENV_ID}/signatures/${SIGNER_ID}.png`);
    expect(captured.setSignerSignatureCalls).toHaveLength(1);
    const call = captured.setSignerSignatureCalls[0]!;
    expect(call.input.kind).toBe('signature');
    expect(call.input.signature_image_path).toBe(`${ENV_ID}/signatures/${SIGNER_ID}.png`);
  });

  it("kind='initials' writes to {signer_id}-initials.png and forwards kind='initials' to the repo", async () => {
    const captured: Captured = { uploads: [], setSignerSignatureCalls: [] };
    const svc = makeService(captured);
    await svc.setSignature(envelope(), signer(), await tinyPng(), {
      kind: 'initials',
      format: 'drawn',
    });

    expect(captured.uploads).toHaveLength(1);
    expect(captured.uploads[0]!.path).toBe(`${ENV_ID}/signatures/${SIGNER_ID}-initials.png`);
    expect(captured.setSignerSignatureCalls).toHaveLength(1);
    const call = captured.setSignerSignatureCalls[0]!;
    expect(call.input.kind).toBe('initials');
    expect(call.input.signature_image_path).toBe(`${ENV_ID}/signatures/${SIGNER_ID}-initials.png`);
  });

  it('omitting kind defaults to signature (back-compat with older clients)', async () => {
    const captured: Captured = { uploads: [], setSignerSignatureCalls: [] };
    const svc = makeService(captured);
    await svc.setSignature(envelope(), signer(), await tinyPng(), {
      format: 'drawn',
    });

    expect(captured.uploads[0]!.path).toBe(`${ENV_ID}/signatures/${SIGNER_ID}.png`);
    expect(captured.setSignerSignatureCalls[0]!.input.kind).toBe('signature');
  });
});
