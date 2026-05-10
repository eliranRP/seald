import { useEffect, useRef, useState } from 'react';
import type { JSX } from 'react';
import { createPortal } from 'react-dom';
import { Backdrop } from './DrivePicker.styles';
import type { DriveFile, DrivePickerProps, DriveMimeFilter } from './DrivePicker.types';
import { fetchPickerCredentials, type PickerCredentials } from './pickerCredentialsApi';
import { useGoogleApi } from './useGoogleApi';
import { getGooglePicker, type PickerInstance } from './google-picker-types';
import { LoadFailedState, LoadingOverlay, NotConfiguredState } from './states';

/**
 * Reusable Drive-picker modal built on top of Google's official
 * `google.picker.PickerBuilder`. Switching off our custom file-list UI
 * was Path A of the Phase 2 fix for the empty-Drive bug — Google's
 * picker grants per-file access at click time and works fully within
 * the `drive.file` OAuth scope (which couldn't enumerate the user's
 * library at all). See `CLAUDE.md` › "Google Drive integration env
 * vars" for the supporting backend contract.
 *
 * Public API is preserved from PR 1 / 2a so the existing UploadRoute
 * and UseTemplatePage consumers don't change.
 */

const MIMES_FOR_FILTER: Record<DriveMimeFilter, ReadonlyArray<string>> = {
  pdf: ['application/pdf'],
  doc: ['application/vnd.google-apps.document'],
  docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  all: [
    'application/pdf',
    'application/vnd.google-apps.document',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ],
};

interface ApiErrorLike {
  readonly status?: number;
}

function readStatus(err: unknown): number | undefined {
  if (err && typeof err === 'object' && 'status' in err) {
    const s = (err as ApiErrorLike).status;
    return typeof s === 'number' ? s : undefined;
  }
  return undefined;
}

type CredentialsState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly creds: PickerCredentials }
  | { readonly kind: 'not-configured' }
  | { readonly kind: 'failed' };

export function DrivePicker(props: DrivePickerProps): JSX.Element | null {
  const { open, onClose, onPick, accountId, mimeFilter = 'all', onReconnect } = props;

  const [creds, setCreds] = useState<CredentialsState>({ kind: 'idle' });
  const gapi = useGoogleApi(open);
  const pickerRef = useRef<PickerInstance | null>(null);
  // Refs so the credential-fetch effect doesn't re-fire when the
  // caller passes new function identities for onClose / onReconnect.
  const onCloseRef = useRef(onClose);
  const onReconnectRef = useRef(onReconnect);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);
  useEffect(() => {
    onReconnectRef.current = onReconnect;
  }, [onReconnect]);

  // 1) Fetch picker credentials whenever the modal opens (rule 4.4 —
  //    one effect, one responsibility).
  useEffect(() => {
    if (!open) {
      setCreds({ kind: 'idle' });
      return;
    }
    let cancelled = false;
    setCreds({ kind: 'loading' });
    fetchPickerCredentials(accountId)
      .then((res) => {
        if (cancelled) return;
        setCreds({ kind: 'ready', creds: res });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const status = readStatus(err);
        if (status === 401) {
          onReconnectRef.current?.();
          onCloseRef.current();
          return;
        }
        if (status === 503) {
          setCreds({ kind: 'not-configured' });
          return;
        }
        // Any other error: surface as load-failed so the user sees a
        // retry option without us swallowing the failure silently.
        setCreds({ kind: 'failed' });
      });
    return () => {
      cancelled = true;
    };
  }, [open, accountId]);

  // 2) Build + show Google's picker once both credentials and the
  //    library are ready. Single-concern effect (rule 4.4).
  useEffect(() => {
    if (!open) return;
    if (creds.kind !== 'ready') return;
    if (!gapi.ready) return;

    const picker = getGooglePicker();
    const builder = new picker.PickerBuilder()
      .setOAuthToken(creds.creds.accessToken)
      .setDeveloperKey(creds.creds.developerKey)
      .setAppId(creds.creds.appId)
      // Required for cross-origin postMessage from the picker iframe
      // back to our SPA. Picker prod is at docs.google.com.
      .setOrigin(window.location.origin)
      // Required for the "Shared drives" tab below to actually list
      // shared-drive content. The DocsView flag alone is not enough —
      // Google requires the builder-level feature flag too.
      .enableFeature(picker.Feature.SUPPORT_DRIVES);

    // Four DocsViews with explicit labels to avoid duplicate tab names.
    // Using LIST mode since we only have the `drive.file` scope — thumbnails
    // require `drive.readonly` which is a RESTRICTED scope needing a paid CASA
    // audit. Tab order:
    //   1. My Drive       → setOwnedByMe(true)
    //   2. Starred        → setStarred(true)
    //   3. Shared with me → setOwnedByMe(false)
    //   4. Shared drives  → setEnableDrives(true)
    // Caveat on Starred: under the `drive.file` scope, the picker only
    // surfaces the intersection of (files Seald has previously touched
    // via the picker) ∩ (user-starred). Empty for new users; useful for
    // returning users who star their work documents. Includes starred
    // folders (navigable, not selectable) just like the other tabs.
    // All four apply the same MIME-type filter and keep
    // setIncludeFolders(true)/setSelectFolderEnabled(false).
    const mimes = MIMES_FOR_FILTER[mimeFilter].join(',');
    const listMode = picker.DocsViewMode.LIST;

    const myDriveView = new picker.DocsView(picker.ViewId.DOCS)
      .setOwnedByMe(true)
      .setLabel('My Drive')
      .setMode(listMode)
      .setMimeTypes(mimes)
      .setIncludeFolders(true)
      .setSelectFolderEnabled(false);
    builder.addView(myDriveView);

    const starredView = new picker.DocsView(picker.ViewId.DOCS)
      .setStarred(true)
      .setLabel('Starred')
      .setMode(listMode)
      .setMimeTypes(mimes)
      .setIncludeFolders(true)
      .setSelectFolderEnabled(false);
    builder.addView(starredView);

    const sharedWithMeView = new picker.DocsView(picker.ViewId.DOCS)
      .setOwnedByMe(false)
      .setLabel('Shared with me')
      .setMode(listMode)
      .setMimeTypes(mimes)
      .setIncludeFolders(true)
      .setSelectFolderEnabled(false);
    builder.addView(sharedWithMeView);

    const sharedDrivesView = new picker.DocsView(picker.ViewId.DOCS)
      .setEnableDrives(true)
      .setLabel('Shared drives')
      .setMode(listMode)
      .setMimeTypes(mimes)
      .setIncludeFolders(true)
      .setSelectFolderEnabled(false);
    builder.addView(sharedDrivesView);

    builder.setCallback((data) => {
      if (data.action === 'picked') {
        const doc = data.docs?.[0];
        if (doc) {
          const file: DriveFile = {
            id: doc.id,
            name: doc.name,
            mimeType: doc.mimeType,
          };
          onPick(file);
        }
        onCloseRef.current();
      } else if (data.action === 'cancel') {
        onCloseRef.current();
      }
    });

    const instance = builder.build();
    pickerRef.current = instance;
    instance.setVisible(true);

    return () => {
      try {
        pickerRef.current?.setVisible(false);
        pickerRef.current?.dispose?.();
      } finally {
        pickerRef.current = null;
      }
    };
  }, [open, creds, gapi.ready, mimeFilter, onPick]);

  if (!open) return null;
  if (typeof document === 'undefined') return null;

  let body: JSX.Element;
  if (creds.kind === 'not-configured') {
    body = <NotConfiguredState onClose={onClose} />;
  } else if (gapi.error || creds.kind === 'failed') {
    body = <LoadFailedState onRetry={gapi.retry} onClose={onClose} />;
  } else {
    // Loading: covers credentials in-flight, gapi script loading, and
    // the brief gap between picker.build() and Google's iframe taking
    // over the viewport. Once Google's picker is visible it sits above
    // this overlay.
    body = <LoadingOverlay />;
  }

  return createPortal(<Backdrop role="presentation">{body}</Backdrop>, document.body);
}
