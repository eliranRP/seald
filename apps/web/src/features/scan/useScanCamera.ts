import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

export type ScanCameraStatus = 'starting' | 'live' | 'blocked';

export interface ScanCamera {
  readonly videoRef: RefObject<HTMLVideoElement | null>;
  readonly status: ScanCameraStatus;
  /** Ask for the camera again (after the person changed the browser setting). */
  readonly retry: () => void;
}

/**
 * The rear camera as a live `<video>`. `blocked` covers a denied permission,
 * no camera, and a page that is not a secure context: all of them fall back to
 * picking photos. While `enabled` is false the stream is released, so the
 * review screen does not keep the camera light on.
 */
export function useScanCamera(enabled: boolean): ScanCamera {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [status, setStatus] = useState<ScanCameraStatus>('starting');
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [attempt, setAttempt] = useState(0);

  // Ask for the camera while enabled; release it when not.
  useEffect(() => {
    if (!enabled) return undefined;
    const devices = typeof navigator === 'undefined' ? undefined : navigator.mediaDevices;
    if (!devices || typeof devices.getUserMedia !== 'function') {
      setStatus('blocked');
      return undefined;
    }
    let cancelled = false;
    let acquired: MediaStream | null = null;
    setStatus('starting');
    devices
      .getUserMedia({
        audio: false,
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 } },
      })
      .then((s) => {
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        acquired = s;
        setStream(s);
        setStatus('live');
      })
      .catch(() => {
        if (!cancelled) setStatus('blocked');
      });
    return () => {
      cancelled = true;
      acquired?.getTracks().forEach((t) => t.stop());
      setStream(null);
    };
  }, [enabled, attempt]);

  // The `<video>` may mount after the stream arrives (the blocked screen has
  // none), so attach in its own effect.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !stream) return undefined;
    video.srcObject = stream;
    void video.play().catch(() => undefined);
    return () => {
      video.srcObject = null;
    };
  }, [stream, status]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { videoRef, status, retry };
}
