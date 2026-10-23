import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';

vi.mock('../envelopesApi', () => ({
  createEnvelope: vi.fn(),
  uploadEnvelopeFile: vi.fn(),
  addEnvelopeSigner: vi.fn(),
  placeEnvelopeFields: vi.fn(),
  sendEnvelope: vi.fn(),
  patchEnvelope: vi.fn(),
}));
vi.mock('@/features/documentEditor/documents/documentsApi', () => ({
  addEnvelopeDocument: vi.fn(),
}));

import * as api from '../envelopesApi';
import { addEnvelopeDocument } from '@/features/documentEditor/documents/documentsApi';
import { useSendEnvelope } from '../useSendEnvelope';

const createEnvelope = api.createEnvelope as unknown as ReturnType<typeof vi.fn>;
const uploadEnvelopeFile = api.uploadEnvelopeFile as unknown as ReturnType<typeof vi.fn>;
const addEnvelopeSigner = api.addEnvelopeSigner as unknown as ReturnType<typeof vi.fn>;
const placeEnvelopeFields = api.placeEnvelopeFields as unknown as ReturnType<typeof vi.fn>;
const sendEnvelope = api.sendEnvelope as unknown as ReturnType<typeof vi.fn>;
const addDocument = addEnvelopeDocument as unknown as ReturnType<typeof vi.fn>;

const FILE_A = new File(['%PDF-1.4 a'], 'a.pdf', { type: 'application/pdf' });
const FILE_B = new File(['%PDF-1.4 b'], 'b.pdf', { type: 'application/pdf' });

beforeEach(() => {
  for (const m of [
    createEnvelope,
    uploadEnvelopeFile,
    addEnvelopeSigner,
    placeEnvelopeFields,
    sendEnvelope,
    addDocument,
  ]) {
    m.mockReset();
  }
  createEnvelope.mockResolvedValue({ id: 'env-1', short_code: 'SC' });
  addEnvelopeSigner.mockResolvedValue({ id: 'server-s1' });
  placeEnvelopeFields.mockResolvedValue([]);
  sendEnvelope.mockResolvedValue({ id: 'env-1', short_code: 'SC-XYZ' });
});

describe('useSendEnvelope with several documents', () => {
  it('adds each document in order instead of the legacy upload, and maps local ids to server ids', async () => {
    addDocument
      .mockResolvedValueOnce({ id: 'server-doc-a' })
      .mockResolvedValueOnce({ id: 'server-doc-b' });
    let seen: ReadonlyMap<string, string> | undefined;

    const { result } = renderHook(() => useSendEnvelope());
    await act(async () => {
      await result.current.run({
        title: 'Closing package',
        file: FILE_A,
        documents: [
          { localId: 'local-a', title: 'Master agreement', file: FILE_A },
          { localId: 'local-b', title: 'Side letter', file: FILE_B },
        ],
        signers: [{ localId: 'local-s', contactId: 'local-s' }],
        buildFields: (_signers, documentIds) => {
          seen = documentIds;
          return [];
        },
      });
    });

    expect(uploadEnvelopeFile).not.toHaveBeenCalled();
    expect(addDocument.mock.calls).toEqual([
      ['env-1', FILE_A, 'Master agreement'],
      ['env-1', FILE_B, 'Side letter'],
    ]);
    expect(seen?.get('local-a')).toBe('server-doc-a');
    expect(seen?.get('local-b')).toBe('server-doc-b');
  });

  it('uses the legacy single upload, and an empty document map, without documents', async () => {
    uploadEnvelopeFile.mockResolvedValue({ pages: 1, sha256: 'x' });
    let size = -1;

    const { result } = renderHook(() => useSendEnvelope());
    await act(async () => {
      await result.current.run({
        title: 'MSA',
        file: FILE_A,
        signers: [{ localId: 'local-s', contactId: 'local-s' }],
        buildFields: (_signers, documentIds) => {
          size = documentIds.size;
          return [];
        },
      });
    });

    expect(uploadEnvelopeFile).toHaveBeenCalledWith('env-1', FILE_A);
    expect(addDocument).not.toHaveBeenCalled();
    expect(size).toBe(0);
  });

  it('stops at the first document that fails and reports the error', async () => {
    addDocument.mockRejectedValueOnce(new Error('file_too_large'));
    const { result } = renderHook(() => useSendEnvelope());
    await act(async () => {
      await expect(
        result.current.run({
          title: 'Closing package',
          file: FILE_A,
          documents: [
            { localId: 'local-a', title: 'A', file: FILE_A },
            { localId: 'local-b', title: 'B', file: FILE_B },
          ],
          signers: [],
          buildFields: () => [],
        }),
      ).rejects.toThrow('file_too_large');
    });
    expect(addDocument).toHaveBeenCalledTimes(1);
    expect(sendEnvelope).not.toHaveBeenCalled();
    expect(result.current.phase).toBe('error');
  });
});
