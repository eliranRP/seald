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
      .setOrigin(window.location.origin);

    // 2026-05-04 — single DocsView with comma-joined MIME types
    // instead of one view per MIME. Reasons:
    //   1. The picker labels each tab from its ViewId; passing
    //      ViewId.DOCS three times rendered three identical
    //      "Google Drive" tabs in prod.
    //   2. setMimeTypes accepts a comma-separated list per
    //      Google's Picker API ref:
    //      https://developers.google.com/drive/picker/reference#docs-view
    //   3. setIncludeFolders(true) re-enables folder navigation,
    //      which was lost because every per-MIME view filtered
    //      folders out (folders have application/vnd.google-apps.folder).
    //      setSelectFolderEnabled(false) keeps "Select" disabled
    //      until the user clicks an actual file.
    //
    // KNOWN ISSUE — Google-side: the modular picker's thumbnail
    // requests to lh3.googleusercontent.com return without a
    // Cross-Origin-Resource-Policy header, so Chrome's ORB blocks
    // them with net::ERR_BLOCKED_BY_ORB. The picker still works
    // for selection — only the thumbnail previews stay grey. Track:
    // https://issuetracker.google.com (modular picker thumbnails).
    const view = new picker.DocsView(picker.ViewId.DOCS)
      .setMimeTypes(MIMES_FOR_FILTER[mimeFilter].join(','))
      .setIncludeFolders(true)
      .setSelectFolderEnabled(false);
    builder.addView(view);

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
