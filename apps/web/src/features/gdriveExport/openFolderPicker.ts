import {
  getGooglePicker,
  type PickerCallbackData,
} from '@/components/drive-picker/google-picker-types';
import type { PickerCredentials } from '@/components/drive-picker/pickerCredentialsApi';

/**
 * One-shot loader for the Google API JS bundle + the `picker`
 * sub-library. Mirrors `useGoogleApi`'s module-scoped Promise so the
 * picker (import flow or export flow) shares a single network fetch.
 * Exported separately from the React hook because the export flow opens
 * the picker imperatively from a click handler, not declaratively.
 */
const GAPI_SRC = 'https://apis.google.com/js/api.js';
const SCRIPT_DOM_ID = 'gapi-loader';

interface GapiGlobal {
  load(name: 'picker', cfg: { callback: () => void }): void;
}

let inFlight: Promise<void> | null = null;

function readGapi(): GapiGlobal | undefined {
  return (window as unknown as { gapi?: GapiGlobal }).gapi;
}

export function loadGooglePicker(): Promise<void> {
  if (inFlight) return inFlight;
  inFlight = new Promise<void>((resolve, reject) => {
    const existing = document.getElementById(SCRIPT_DOM_ID) as HTMLScriptElement | null;
    const finish = (): void => {
      const gapi = readGapi();
      if (!gapi) {
        reject(new Error('gapi global missing after script load'));
        return;
      }
      gapi.load('picker', { callback: () => resolve() });
    };
    if (existing && readGapi()) {
      finish();
      return;
    }
    const script = existing ?? document.createElement('script');
    if (!existing) {
      script.id = SCRIPT_DOM_ID;
      script.src = GAPI_SRC;
      script.async = true;
      script.defer = true;
    }
    script.addEventListener('load', finish, { once: true });
    script.addEventListener('error', () => reject(new Error(`Failed to load ${GAPI_SRC}`)), {
      once: true,
    });
    if (!existing) document.head.appendChild(script);
  });
  return inFlight;
}

/** Test-only — clear the cached loader Promise + script tag. */
export function __resetFolderPickerLoaderForTests(): void {
  inFlight = null;
  document.getElementById(SCRIPT_DOM_ID)?.remove();
}

export interface PickedFolder {
  readonly id: string;
  readonly name: string;
}

export interface OpenFolderPickerOptions {
  /** Open the picker rooted at this folder id if provided. */
  readonly parentFolderId?: string | null;
  readonly title?: string;
}

/**
 * Loads the picker library, builds a folder-selection picker, and
 * resolves with the picked folder (or `null` if the user canceled).
 * Factored out of the page so the page test can mock this single
 * function instead of stubbing all of `google.picker`.
 */
export async function openFolderPicker(
  creds: PickerCredentials,
  opts: OpenFolderPickerOptions = {},
): Promise<PickedFolder | null> {
  await loadGooglePicker();
  const picker = getGooglePicker();
  return new Promise<PickedFolder | null>((resolve) => {
    let settled = false;
    const settle = (value: PickedFolder | null): void => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const folderView = new picker.DocsView(picker.ViewId.FOLDERS)
      .setSelectFolderEnabled(true)
      .setIncludeFolders(true);
    const builder = new picker.PickerBuilder()
      .setOAuthToken(creds.accessToken)
      .setDeveloperKey(creds.developerKey)
      .setAppId(creds.appId)
      .setOrigin(window.location.origin)
      .enableFeature(picker.Feature.SUPPORT_DRIVES)
      .setTitle(opts.title ?? 'Choose a folder to save to')
      .addView(folderView)
      .setCallback((data: PickerCallbackData) => {
        if (data.action === picker.Action.PICKED) {
          const doc = data.docs?.[0];
          settle(doc ? { id: doc.id, name: doc.name } : null);
        } else if (data.action === picker.Action.CANCEL) {
          settle(null);
        }
      });
    if (opts.parentFolderId) builder.setParent(opts.parentFolderId);
    builder.build().setVisible(true);
  });
}
