import { describe, expect, it } from 'vitest';
import { INITIAL_SCAN_PHASE, scanPhaseReducer } from './scanPhase';
import type { ScanPhase } from './scanPhase';

const REVIEW: ScanPhase = { kind: 'review', captureFailed: false, buildFailed: false };

describe('scanPhaseReducer', () => {
  it('starts on the camera with no error', () => {
    expect(INITIAL_SCAN_PHASE).toEqual({ kind: 'camera', captureFailed: false });
  });

  it('sets and clears a capture error on the screen it happened on', () => {
    const failed = scanPhaseReducer(INITIAL_SCAN_PHASE, { type: 'capture-failed' });
    expect(failed).toEqual({ kind: 'camera', captureFailed: true });
    expect(scanPhaseReducer(failed, { type: 'capture-started' })).toEqual(INITIAL_SCAN_PHASE);
    expect(scanPhaseReducer(REVIEW, { type: 'capture-failed' })).toEqual({
      ...REVIEW,
      captureFailed: true,
    });
    expect(scanPhaseReducer(REVIEW, { type: 'capture-started' })).toBe(REVIEW);
  });

  it('changing screens drops the errors of the last one', () => {
    const cameraFailed: ScanPhase = { kind: 'camera', captureFailed: true };
    expect(scanPhaseReducer(cameraFailed, { type: 'open-review' })).toEqual(REVIEW);
    const reviewFailed: ScanPhase = { kind: 'review', captureFailed: true, buildFailed: true };
    expect(scanPhaseReducer(reviewFailed, { type: 'open-camera' })).toEqual(INITIAL_SCAN_PHASE);
  });

  it('picked photos land on review, flagging any that could not be read', () => {
    expect(
      scanPhaseReducer(INITIAL_SCAN_PHASE, { type: 'photos-added', someUnreadable: true }),
    ).toEqual({ kind: 'review', captureFailed: true, buildFailed: false });
    expect(
      scanPhaseReducer(INITIAL_SCAN_PHASE, { type: 'photos-added', someUnreadable: false }),
    ).toEqual(REVIEW);
  });

  it('making counts pages, and a failed build returns to review with the error', () => {
    const making = scanPhaseReducer(REVIEW, { type: 'build-started' });
    expect(making).toEqual({ kind: 'making', progress: 0 });
    const two = scanPhaseReducer(scanPhaseReducer(making, { type: 'page-processed' }), {
      type: 'page-processed',
    });
    expect(two).toEqual({ kind: 'making', progress: 2 });
    expect(scanPhaseReducer(two, { type: 'build-failed' })).toEqual({
      kind: 'review',
      captureFailed: false,
      buildFailed: true,
    });
  });

  it('ignores progress and capture events outside their screens', () => {
    expect(scanPhaseReducer(REVIEW, { type: 'page-processed' })).toBe(REVIEW);
    const making: ScanPhase = { kind: 'making', progress: 1 };
    expect(scanPhaseReducer(making, { type: 'capture-failed' })).toBe(making);
  });
});
