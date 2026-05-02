import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

vi.mock('./envelopesApi', () => ({
  createEnvelope: vi.fn(),
  uploadEnvelopeFile: vi.fn(),
  addEnvelopeSigner: vi.fn(),
  placeEnvelopeFields: vi.fn(),
  sendEnvelope: vi.fn(),
}));

// eslint-disable-next-line import/first
import * as api from './envelopesApi';
// eslint-disable-next-line import/first
import { useSendEnvelope } from './useSendEnvelope';
// eslint-disable-next-line import/first
import type { FieldPlacement } from './envelopesApi';

const createEnvelope = api.createEnvelope as unknown as ReturnType<typeof vi.fn>;
const uploadEnvelopeFile = api.uploadEnvelopeFile as unknown as ReturnType<typeof vi.fn>;
const addEnvelopeSigner = api.addEnvelopeSigner as unknown as ReturnType<typeof vi.fn>;
const placeEnvelopeFields = api.placeEnvelopeFields as unknown as ReturnType<typeof vi.fn>;
const sendEnvelope = api.sendEnvelope as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  createEnvelope.mockReset();
  uploadEnvelopeFile.mockReset();
  addEnvelopeSigner.mockReset();
  placeEnvelopeFields.mockReset();
  sendEnvelope.mockReset();
});

const FILE = new File(['%PDF-1.4'], 'contract.pdf', { type: 'application/pdf' });

describe('useSendEnvelope', () => {
  it('runs create → upload → addSigner (one per contact) → placeFields → send in order', async () => {
    createEnvelope.mockResolvedValueOnce({ id: 'env-1', short_code: 'SC' });
    uploadEnvelopeFile.mockResolvedValueOnce({ pages: 2, sha256: 'abc' });
    addEnvelopeSigner
      .mockResolvedValueOnce({ id: 'server-s1' })
      .mockResolvedValueOnce({ id: 'server-s2' });
    placeEnvelopeFields.mockResolvedValueOnce([]);
    sendEnvelope.mockResolvedValueOnce({ id: 'env-1', short_code: 'SC-XYZ' });

    const { result } = renderHook(() => useSendEnvelope());

    expect(result.current.phase).toBe('idle');

    const run = result.current.run({
      title: 'MSA',
      file: FILE,
      signers: [
        { localId: 'local-1', contactId: 'local-1' },
        { localId: 'local-2', contactId: 'local-2' },
      ],
      buildFields: (map): FieldPlacement[] => [
        {
          signer_id: map.get('local-1')!,
          kind: 'signature',
          page: 1,
          x: 0.1,
          y: 0.8,
          required: true,
        },
      ],
    });

    const out = await act(async () => run);

    expect(out).toEqual({ envelope_id: 'env-1', short_code: 'SC-XYZ' });
    expect(createEnvelope).toHaveBeenCalledWith({ title: 'MSA' });
    expect(uploadEnvelopeFile).toHaveBeenCalledWith('env-1', FILE);
    expect(addEnvelopeSigner).toHaveBeenCalledTimes(2);
    expect(addEnvelopeSigner).toHaveBeenNthCalledWith(1, 'env-1', { contact_id: 'local-1' });
    expect(addEnvelopeSigner).toHaveBeenNthCalledWith(2, 'env-1', { contact_id: 'local-2' });
    expect(placeEnvelopeFields).toHaveBeenCalledWith('env-1', [
      expect.objectContaining({ signer_id: 'server-s1', kind: 'signature' }),
    ]);
    expect(sendEnvelope).toHaveBeenCalledWith('env-1', {});
    await waitFor(() => expect(result.current.phase).toBe('done'));
  });

  it('skips the placeFields call when buildFields returns an empty array', async () => {
    createEnvelope.mockResolvedValueOnce({ id: 'env-empty', short_code: 'SC' });
    uploadEnvelopeFile.mockResolvedValueOnce({ pages: 1, sha256: '' });
    sendEnvelope.mockResolvedValueOnce({ id: 'env-empty', short_code: 'SC' });

    const { result } = renderHook(() => useSendEnvelope());

    await act(async () => {
      await result.current.run({
        title: 'Empty',
        file: FILE,
        signers: [],
        buildFields: () => [],
      });
    });

    expect(placeEnvelopeFields).not.toHaveBeenCalled();
    expect(sendEnvelope).toHaveBeenCalledWith('env-empty', {});
  });

  it('passes senderEmail/senderName through to sendEnvelope (guest mode)', async () => {
    createEnvelope.mockResolvedValueOnce({ id: 'env-guest', short_code: 'SC' });
    uploadEnvelopeFile.mockResolvedValueOnce({ pages: 1, sha256: '' });
    sendEnvelope.mockResolvedValueOnce({ id: 'env-guest', short_code: 'SC' });

    const { result } = renderHook(() => useSendEnvelope());

    await act(async () => {
      await result.current.run({
        title: 'Guest send',
        file: FILE,
        signers: [],
        buildFields: () => [],
        senderEmail: 'guest@example.com',
        senderName: 'Ada Lovelace',
      });
    });

    expect(sendEnvelope).toHaveBeenCalledWith('env-guest', {
      sender_email: 'guest@example.com',
      sender_name: 'Ada Lovelace',
    });
  });

  it('forwards ad-hoc signers (email/name/color) when no contactId is provided (guest mode)', async () => {
    createEnvelope.mockResolvedValueOnce({ id: 'env-adhoc', short_code: 'SC' });
    uploadEnvelopeFile.mockResolvedValueOnce({ pages: 1, sha256: '' });
    addEnvelopeSigner
      .mockResolvedValueOnce({ id: 'server-a' })
      .mockResolvedValueOnce({ id: 'server-b' });
    sendEnvelope.mockResolvedValueOnce({ id: 'env-adhoc', short_code: 'SC' });

    const { result } = renderHook(() => useSendEnvelope());

    await act(async () => {
      await result.current.run({
        title: 'Guest envelope',
        file: FILE,
        // Synthetic guest ids — the API DTO would reject these as `contact_id`.
        // Hook must instead post `{ email, name, color? }` per the AddSignerDto.
        signers: [
          {
            localId: 'guest-aaa',
            email: 'ada@example.com',
            name: 'Ada Lovelace',
            color: '#818CF8',
          },
          { localId: 'guest-bbb', email: 'lin@example.com', name: 'Lin Wei' },
        ],
        buildFields: (map): FieldPlacement[] => [
          {
            signer_id: map.get('guest-aaa')!,
            kind: 'signature',
            page: 1,
            x: 0.1,
            y: 0.8,
            required: true,
          },
        ],
      });
    });

    expect(addEnvelopeSigner).toHaveBeenCalledTimes(2);
    expect(addEnvelopeSigner).toHaveBeenNthCalledWith(1, 'env-adhoc', {
      email: 'ada@example.com',
      name: 'Ada Lovelace',
      color: '#818CF8',
    });
    expect(addEnvelopeSigner).toHaveBeenNthCalledWith(2, 'env-adhoc', {
      email: 'lin@example.com',
      name: 'Lin Wei',
    });
    // Field map must use the local id as key so buildFields can resolve it.
    expect(placeEnvelopeFields).toHaveBeenCalledWith('env-adhoc', [
      expect.objectContaining({ signer_id: 'server-a' }),
    ]);
  });

  it('captures the first failure + exposes it on `error`', async () => {
    createEnvelope.mockResolvedValueOnce({ id: 'env-bad', short_code: 'SC' });
    uploadEnvelopeFile.mockRejectedValueOnce(new Error('upload_failed'));

    const { result } = renderHook(() => useSendEnvelope());

    await act(async () => {
      await expect(
        result.current.run({
          title: 'Boom',
          file: FILE,
          signers: [],
          buildFields: () => [],
        }),
      ).rejects.toThrow(/upload_failed/);
    });

    await waitFor(() => {
      expect(result.current.phase).toBe('error');
      expect(result.current.error?.message).toMatch(/upload_failed/);
    });
    expect(addEnvelopeSigner).not.toHaveBeenCalled();
    expect(sendEnvelope).not.toHaveBeenCalled();
  });

  it('reset() returns the hook to idle', async () => {
    createEnvelope.mockRejectedValueOnce(new Error('nope'));
    const { result } = renderHook(() => useSendEnvelope());
    await act(async () => {
      await expect(
        result.current.run({ title: 'x', file: FILE, signers: [], buildFields: () => [] }),
      ).rejects.toThrow();
    });
    expect(result.current.phase).toBe('error');
    act(() => {
      result.current.reset();
    });
    expect(result.current.phase).toBe('idle');
    expect(result.current.error).toBeNull();
  });
});
