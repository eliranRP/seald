/**
 * The scanner's screen, with the state that only that screen uses:
 * capture errors on the camera and the review grid, a build error on the
 * review grid, and the build progress while the PDF is made. Each error is
 * about the screen it was raised on, so changing screens clears it.
 */
export type ScanPhase =
  | { readonly kind: 'camera'; readonly captureFailed: boolean }
  | { readonly kind: 'review'; readonly captureFailed: boolean; readonly buildFailed: boolean }
  | { readonly kind: 'making'; readonly progress: number };

export type ScanPhaseEvent =
  | { readonly type: 'open-camera' }
  | { readonly type: 'open-review' }
  /** A shutter press or a photo pick started: clear the last capture error. */
  | { readonly type: 'capture-started' }
  | { readonly type: 'capture-failed' }
  /** Picked photos were added; some of them may not have been readable. */
  | { readonly type: 'photos-added'; readonly someUnreadable: boolean }
  | { readonly type: 'build-started' }
  | { readonly type: 'page-processed' }
  | { readonly type: 'build-failed' };

export const INITIAL_SCAN_PHASE: ScanPhase = { kind: 'camera', captureFailed: false };

function withCaptureFailed(phase: ScanPhase, captureFailed: boolean): ScanPhase {
  if (phase.kind === 'making' || phase.captureFailed === captureFailed) return phase;
  return { ...phase, captureFailed };
}

export function scanPhaseReducer(phase: ScanPhase, event: ScanPhaseEvent): ScanPhase {
  switch (event.type) {
    case 'open-camera':
      return INITIAL_SCAN_PHASE;
    case 'open-review':
      return { kind: 'review', captureFailed: false, buildFailed: false };
    case 'capture-started':
      return withCaptureFailed(phase, false);
    case 'capture-failed':
      return withCaptureFailed(phase, true);
    case 'photos-added':
      return { kind: 'review', captureFailed: event.someUnreadable, buildFailed: false };
    case 'build-started':
      return { kind: 'making', progress: 0 };
    case 'page-processed':
      return phase.kind === 'making' ? { kind: 'making', progress: phase.progress + 1 } : phase;
    case 'build-failed':
      return { kind: 'review', captureFailed: false, buildFailed: true };
    default: {
      const exhaustive: never = event;
      return exhaustive;
    }
  }
}
