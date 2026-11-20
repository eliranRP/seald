import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';

vi.mock('../envelopesApi', () => ({
  createEnvelope: vi.fn(),
  uploadEnvelopeFile: vi.fn(),
  addEnvelopeSigner: vi.fn(),
  placeEnvelopeFields: vi.fn(),
  sendEnvelope: vi.fn(),
  patchEnvelope: vi.fn(),
  setEnvelopeSigningOrder: vi.fn(),
}));

import * as api from '../envelopesApi';
import {
  SEND_ENVELOPE_IDLE,
  sendEnvelopeReducer,
  useSendEnvelope,
  type SendEnvelopeState,
} from '../useSendEnvelope';

const createEnvelope = api.createEnvelope as unknown as ReturnType<typeof vi.fn>;
const uploadEnvelopeFile = api.uploadEnvelopeFile as unknown as ReturnType<typeof vi.fn>;
const sendEnvelope = api.sendEnvelope as unknown as ReturnType<typeof vi.fn>;

const FILE = new File(['%PDF-1.4'], 'contract.pdf', { type: 'application/pdf' });
const INPUT = { title: 'MSA', file: FILE, signers: [], buildFields: () => [] };

describe('sendEnvelopeReducer', () => {
  it('records the step that failed and the draft already created', () => {
    let s: SendEnvelopeState = SEND_ENVELOPE_IDLE;
    s = sendEnvelopeReducer(s, { type: 'step', step: 'creating' });
    s = sendEnvelopeReducer(s, { type: 'created', envelopeId: 'env-1' });
    s = sendEnvelopeReducer(s, { type: 'step', step: 'uploading' });
    const error = new Error('upload_failed');
    s = sendEnvelopeReducer(s, { type: 'fail', error });
    expect(s).toEqual({ phase: 'error', error, failedStep: 'uploading', envelopeId: 'env-1' });
  });

  it('leaves done and error only through reset', () => {
    const done: SendEnvelopeState = { phase: 'done', error: null, envelopeId: 'env-1' };
    expect(sendEnvelopeReducer(done, { type: 'step', step: 'sending' })).toBe(done);
    expect(sendEnvelopeReducer(done, { type: 'fail', error: new Error('x') })).toBe(done);
    expect(sendEnvelopeReducer(done, { type: 'reset' })).toBe(SEND_ENVELOPE_IDLE);
  });

  it('cannot fail or finish without having started', () => {
    expect(sendEnvelopeReducer(SEND_ENVELOPE_IDLE, { type: 'fail', error: new Error('x') })).toBe(
      SEND_ENVELOPE_IDLE,
    );
    expect(sendEnvelopeReducer(SEND_ENVELOPE_IDLE, { type: 'done', envelopeId: 'e' })).toBe(
      SEND_ENVELOPE_IDLE,
    );
  });
});

describe('useSendEnvelope guards', () => {
  beforeEach(() => {
    createEnvelope.mockReset();
    uploadEnvelopeFile.mockReset();
    sendEnvelope.mockReset();
  });

  it('a second run while one is in flight joins it instead of creating another envelope', async () => {
    let release: (v: { id: string; short_code: string }) => void = () => undefined;
    createEnvelope.mockReturnValueOnce(
      new Promise((r) => {
        release = r;
      }),
    );
    uploadEnvelopeFile.mockResolvedValue({ pages: 1, sha256: '' });
    sendEnvelope.mockResolvedValue({ id: 'env-1', short_code: 'SC' });
    const { result } = renderHook(() => useSendEnvelope());

    let a!: Promise<unknown>;
    let b!: Promise<unknown>;
    act(() => {
      a = result.current.run(INPUT);
      b = result.current.run(INPUT);
    });
    expect(b).toBe(a);
    await act(async () => {
      release({ id: 'env-1', short_code: 'SC' });
      await a;
    });
    expect(createEnvelope).toHaveBeenCalledTimes(1);
    expect(result.current.phase).toBe('done');
    expect(result.current.envelopeId).toBe('env-1');
  });

  it('reset drops the in-flight run: its late result does not move the state', async () => {
    let release: (v: { id: string; short_code: string }) => void = () => undefined;
    createEnvelope.mockReturnValueOnce(
      new Promise((r) => {
        release = r;
      }),
    );
    createEnvelope.mockResolvedValueOnce({ id: 'env-2', short_code: 'SC2' });
    uploadEnvelopeFile.mockResolvedValue({ pages: 1, sha256: '' });
    sendEnvelope.mockImplementation(async (id: string) => ({ id, short_code: 'SC' }));
    const { result } = renderHook(() => useSendEnvelope());

    let first!: Promise<unknown>;
    act(() => {
      first = result.current.run(INPUT);
    });
    act(() => result.current.reset());
    let second!: Promise<unknown>;
    act(() => {
      second = result.current.run({ ...INPUT, title: 'Edited' });
    });
    expect(second).not.toBe(first);
    await act(async () => {
      await second;
    });
    expect(result.current).toMatchObject({ phase: 'done', envelopeId: 'env-2' });
    await act(async () => {
      release({ id: 'env-1', short_code: 'SC' });
      await first;
    });
    // The abandoned run finished on the server but left the UI alone.
    expect(result.current).toMatchObject({ phase: 'done', envelopeId: 'env-2' });
  });

  it('a failure keeps the failed step and the draft id', async () => {
    createEnvelope.mockResolvedValueOnce({ id: 'env-9', short_code: 'SC' });
    uploadEnvelopeFile.mockRejectedValueOnce(new Error('upload_failed'));
    const { result } = renderHook(() => useSendEnvelope());
    await act(async () => {
      await expect(result.current.run(INPUT)).rejects.toThrow('upload_failed');
    });
    expect(result.current).toMatchObject({
      phase: 'error',
      failedStep: 'uploading',
      envelopeId: 'env-9',
    });
    expect(result.current.error?.message).toBe('upload_failed');
    act(() => result.current.reset());
    expect(result.current).toMatchObject({ phase: 'idle', error: null, failedStep: null });
  });
});
