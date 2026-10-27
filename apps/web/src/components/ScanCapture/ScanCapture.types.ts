export interface ScanCaptureProps {
  /**
   * Gets the finished PDF. Resolve when the host has taken it (the host then
   * swaps the screen); reject to show "Couldn't build the PDF" with a retry.
   */
  readonly onComplete: (pdf: File) => Promise<void>;
  /** Close (X) on the camera. Omit to hide the button. */
  readonly onClose?: (() => void) | undefined;
  /**
   * Optional context shown in the camera's top bar and the blocked screen's
   * header (e.g. "Scan for your computer" on the phone hand-off page), so the
   * user knows where the scan goes. Omit for a bare camera.
   */
  readonly title?: string | undefined;
}

/** One captured or picked page. `blob` is the unfiltered JPEG. */
export interface ScanPage {
  readonly id: string;
  readonly blob: Blob;
}
