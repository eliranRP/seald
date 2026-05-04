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
}

export interface PickerNamespace {
  readonly PickerBuilder: new () => PickerBuilder;
  readonly DocsView: new (viewId?: unknown) => DocsViewBuilder;
  readonly ViewId: { readonly DOCS: unknown };
  readonly Action: {
    readonly PICKED: 'picked';
    readonly CANCEL: 'cancel';
    readonly LOADED: 'loaded';
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
