/**
 * Minimal local types for the subset of the Google Picker API we use.
 *
 * We deliberately do NOT depend on `@types/gapi.client.picker` — that
 * package is unmaintained, drags >300 KB of unused ambient declarations
 * into the SPA, and would force every consumer of this picker to install
 * it transitively. Hand-rolling the four interfaces we actually call
 * keeps the runtime contract narrow + type-safe (rule 3.2).
 *
 * Reference: https://developers.google.com/drive/picker/reference
 */

export interface PickerDoc {
  readonly id: string;
  readonly name: string;
  readonly mimeType: string;
}

export interface PickerCallbackData {
  readonly action: 'picked' | 'cancel' | 'loaded';
  readonly docs?: ReadonlyArray<PickerDoc>;
}

export interface PickerInstance {
  setVisible(visible: boolean): void;
  dispose?(): void;
}

export interface PickerBuilder {
  setOAuthToken(token: string): PickerBuilder;
  setDeveloperKey(key: string): PickerBuilder;
  setAppId(id: string): PickerBuilder;
  /**
   * Required when the picker iframe is embedded in a different origin
   * than the parent — without it, Google's picker can't postMessage
   * back the selection. Defensive even when origins match (HMR /
   * preview deployments).
   */
  setOrigin(origin: string): PickerBuilder;
  /**
   * Toggle a builder-level feature flag. We use this to enable
   * `SUPPORT_DRIVES` so the "Shared drives" tab can list shared-drive
   * content in addition to My Drive.
   */
  enableFeature(name: string): PickerBuilder;
  addView(view: unknown): PickerBuilder;
  setCallback(cb: (data: PickerCallbackData) => void): PickerBuilder;
  build(): PickerInstance;
}

export interface DocsViewBuilder {
  setMimeTypes(mimes: string): DocsViewBuilder;
  /** Show folders in the listing so the user can navigate into them. */
  setIncludeFolders(include: boolean): DocsViewBuilder;
  /** When false, folders are visible but not selectable as a result. */
  setSelectFolderEnabled(enabled: boolean): DocsViewBuilder;
  /**
   * Filter the view by ownership.
   *   - `true`  → "My Drive" tab (only files owned by the user).
   *   - `false` → "Shared with me" tab (files shared with the user).
   */
  setOwnedByMe(owned: boolean): DocsViewBuilder;
  /**
   * Show shared-drive content in this view. Requires the builder to
   * have `enableFeature(Feature.SUPPORT_DRIVES)` set as well.
   */
  setEnableDrives(enable: boolean): DocsViewBuilder;
  /**
   * Filter the view to starred items only. Combined with
   * `setOwnedByMe(true)` produces the canonical "Starred" tab —
   * the user's own files filtered to starred.
   */
  setStarred(starred: boolean): DocsViewBuilder;
  /**
   * Switch the view between grid (thumbnails) and list mode.
   * With `drive.file` scope, thumbnails are blocked by Chrome's ORB
   * because the picker can't access lh3.googleusercontent.com without
   * broader permissions. Use `DocsViewMode.LIST` to avoid grey
   * thumbnails while keeping full file-selection functionality.
   */
  setMode(mode: unknown): DocsViewBuilder;
  /**
   * Set a custom label for this view's tab in the picker navigation.
   * @deprecated Google marks this as deprecated but provides no
   * replacement for individual view labels. Still functional.
   */
  setLabel(label: string): DocsViewBuilder;
}

export interface PickerNamespace {
  readonly PickerBuilder: new () => PickerBuilder;
  readonly DocsView: new (viewId?: unknown) => DocsViewBuilder;
  readonly ViewId: { readonly DOCS: unknown };
  readonly DocsViewMode: {
    /** Grid layout with thumbnail previews. */
    readonly GRID: unknown;
    /** List layout — no thumbnails, works with drive.file scope. */
    readonly LIST: unknown;
  };
  readonly Action: {
    readonly PICKED: 'picked';
    readonly CANCEL: 'cancel';
    readonly LOADED: 'loaded';
  };
  readonly Feature: {
    readonly SUPPORT_DRIVES: 'sdr';
  };
}

export interface GoogleGlobal {
  readonly picker: PickerNamespace;
}

/**
 * Narrow accessor — throws if the picker library hasn't loaded yet.
 * Callers should only invoke this after `useGoogleApi` reports
 * `ready: true`. Keeps the `unknown`-cast on `window` localised.
 */
export function getGooglePicker(): PickerNamespace {
  const w = window as unknown as { google?: GoogleGlobal };
  const picker = w.google?.picker;
  if (!picker) {
    throw new Error('google.picker is not loaded');
  }
  return picker;
}
