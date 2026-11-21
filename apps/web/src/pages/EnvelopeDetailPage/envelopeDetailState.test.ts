import { describe, expect, it } from 'vitest';
import type { EnvelopeSigner } from '@/features/envelopes';
import {
  DOWNLOAD_IDLE,
  REMIND_IDLE,
  SIGNER_EDIT_IDLE,
  documentsCardBusy,
  fixingSignerId,
  remindingSignerId,
  replacingSigner,
  signerEditReducer,
  splitButtonBusy,
} from './envelopeDetailState';
import type { SignerEdit } from './envelopeDetailState';

const ALEX = { id: 'alex', name: 'Alex Reyes', email: 'alex@quill.vc' } as EnvelopeSigner;

describe('signerEditReducer', () => {
  it('opens a fix or a replace for one signer, never both', () => {
    const fixing = signerEditReducer(SIGNER_EDIT_IDLE, { type: 'open-fix', signerId: 'hannah' });
    expect(fixing).toEqual({ kind: 'fixing', signerId: 'hannah', busy: false });
    const replacing = signerEditReducer(fixing, { type: 'open-replace', signer: ALEX });
    expect(replacing).toEqual({ kind: 'replacing', signer: ALEX, busy: false });
    expect(fixingSignerId(replacing)).toBeNull();
    expect(replacingSigner(replacing)).toBe(ALEX);
  });

  it('marks only the open target busy, and clears busy on failure', () => {
    const open: SignerEdit = { kind: 'fixing', signerId: 'alex', busy: false };
    const busy = signerEditReducer(open, { type: 'submit', signerId: 'alex' });
    expect(busy).toEqual({ kind: 'fixing', signerId: 'alex', busy: true });
    expect(signerEditReducer(open, { type: 'submit', signerId: 'hannah' })).toBe(open);
    expect(signerEditReducer(SIGNER_EDIT_IDLE, { type: 'submit', signerId: 'alex' })).toBe(
      SIGNER_EDIT_IDLE,
    );
    expect(signerEditReducer(busy, { type: 'failed', signerId: 'alex' })).toEqual(open);
  });

  it('closes on success for the open target only', () => {
    const replacing: SignerEdit = { kind: 'replacing', signer: ALEX, busy: true };
    expect(signerEditReducer(replacing, { type: 'succeeded', signerId: 'alex' })).toEqual(
      SIGNER_EDIT_IDLE,
    );
    const other: SignerEdit = { kind: 'fixing', signerId: 'hannah', busy: false };
    expect(signerEditReducer(other, { type: 'succeeded', signerId: 'alex' })).toBe(other);
    expect(signerEditReducer(other, { type: 'failed', signerId: 'alex' })).toBe(other);
  });

  it('opening a new target starts it idle, even while another request runs', () => {
    const busy: SignerEdit = { kind: 'fixing', signerId: 'alex', busy: true };
    expect(signerEditReducer(busy, { type: 'open-fix', signerId: 'hannah' })).toEqual({
      kind: 'fixing',
      signerId: 'hannah',
      busy: false,
    });
    expect(signerEditReducer(busy, { type: 'close' })).toEqual(SIGNER_EDIT_IDLE);
  });
});

describe('remind state', () => {
  it('names the spinning row only for a single reminder', () => {
    expect(remindingSignerId(REMIND_IDLE)).toBeNull();
    expect(remindingSignerId({ kind: 'all' })).toBeNull();
    expect(remindingSignerId({ kind: 'one', signerId: 'alex' })).toBe('alex');
  });
});

describe('download state', () => {
  it('maps a header artifact to the split button and zip to the documents card', () => {
    expect(splitButtonBusy({ kind: 'artifact', which: 'sealed' }, false)).toBe('sealed');
    expect(documentsCardBusy({ kind: 'artifact', which: 'sealed' })).toBeNull();
    expect(splitButtonBusy({ kind: 'artifact', which: 'zip' }, false)).toBe('zip');
    expect(documentsCardBusy({ kind: 'artifact', which: 'zip' })).toBe('zip');
  });

  it('maps a document to the documents card only, and Drive wins on the split button', () => {
    expect(documentsCardBusy({ kind: 'document', documentId: 'doc-2' })).toBe('doc-2');
    expect(splitButtonBusy({ kind: 'document', documentId: 'doc-2' }, false)).toBeNull();
    expect(splitButtonBusy(DOWNLOAD_IDLE, true)).toBe('gdrive');
    expect(splitButtonBusy(DOWNLOAD_IDLE, false)).toBeNull();
    expect(documentsCardBusy(DOWNLOAD_IDLE)).toBeNull();
  });
});
