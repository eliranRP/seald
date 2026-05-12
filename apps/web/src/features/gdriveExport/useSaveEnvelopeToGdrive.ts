import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { fetchPickerCredentials } from '@/components/drive-picker/pickerCredentialsApi';
import { apiClient, type ApiError } from '@/lib/api/apiClient';
import { envelopeKeys, saveEnvelopeToGdrive } from '@/features/envelopes';
import type { Envelope, EnvelopeGdriveSaveResult } from '@/features/envelopes';
import {
  GDRIVE_ACCOUNTS_KEY,
  type GDriveAccount,
} from '@/routes/settings/integrations/useGDriveAccounts';
import { connectGdriveViaPopup } from './connectGdriveViaPopup';
import { openFolderPicker } from './openFolderPicker';

/**
 * Outcome of a "Save to Google Drive" run. The page maps each variant to
 * a toast (and, for `connect-needed` / `reconnect-needed`, an inline
 * action that re-runs the flow after the OAuth popup).
 */
export type SaveEnvelopeToGdriveOutcome =
  | { readonly kind: 'saved'; readonly result: EnvelopeGdriveSaveResult }
  | { readonly kind: 'partial'; readonly result: EnvelopeGdriveSaveResult }
  | { readonly kind: 'canceled' } // user dismissed the folder picker
  | { readonly kind: 'connect-needed' } // OAuth popup didn't complete / no account
  | { readonly kind: 'reconnect-needed' } // token revoked → reconnect
  | { readonly kind: 'not-sealed' }
  | { readonly kind: 'permission-denied' } // Drive refused the folder
  | { readonly kind: 'rate-limited'; readonly retryAfterSeconds: number }
  | { readonly kind: 'picker-not-configured' }
  | { readonly kind: 'error'; readonly message: string };

interface UseSaveEnvelopeToGdriveReturn {
  readonly inFlight: boolean;
  readonly save: (envelope: Envelope) => Promise<SaveEnvelopeToGdriveOutcome>;
}

async function listAccounts(): Promise<ReadonlyArray<GDriveAccount>> {
  const res = await apiClient.get<ReadonlyArray<GDriveAccount>>('/integrations/gdrive/accounts');
  return res.data;
}

function pickActiveAccount(accounts: ReadonlyArray<GDriveAccount>): GDriveAccount | null {
  if (accounts.length === 0) return null;
  return [...accounts].sort((a, b) => {
    const at = a.lastUsedAt ?? a.connectedAt;
    const bt = b.lastUsedAt ?? b.connectedAt;
    return bt.localeCompare(at);
  })[0]!;
}

function mapSaveError(err: ApiError): SaveEnvelopeToGdriveOutcome {
  switch (err.code) {
    case 'gdrive-not-connected':
      return { kind: 'connect-needed' };
    case 'token-expired':
      return { kind: 'reconnect-needed' };
    case 'permission-denied':
      return { kind: 'permission-denied' };
    case 'rate-limited':
      return { kind: 'rate-limited', retryAfterSeconds: err.retryAfter ?? 30 };
    default:
      break;
  }
  // No `code` — fall back to the message slug / status.
  if (err.status === 409 && /not[_-]sealed/.test(err.message)) return { kind: 'not-sealed' };
  if (err.status === 429) return { kind: 'rate-limited', retryAfterSeconds: err.retryAfter ?? 30 };
  return { kind: 'error', message: err.message };
}

/**
 * Orchestrates the whole "Save to Google Drive" click: ensure a
 * connected account (OAuth popup if needed), fetch picker credentials,
 * open the folder picker, POST the save, and invalidate the envelope
 * detail query on success. Returns a discriminated outcome the page maps
 * to UI; throws nothing the page needs to catch.
 */
export function useSaveEnvelopeToGdrive(): UseSaveEnvelopeToGdriveReturn {
  const qc = useQueryClient();
  const [inFlight, setInFlight] = useState(false);

  const save = useCallback(
    async (envelope: Envelope): Promise<SaveEnvelopeToGdriveOutcome> => {
      // 1) Make sure we have a connected account. The detail payload's
      //    `gdriveExport.connected` is the fast path; if it's false (or
      //    missing) try the OAuth popup, then re-confirm via the accounts
      //    endpoint.
      let accounts = await listAccounts().catch(() => [] as ReadonlyArray<GDriveAccount>);
      if (envelope.gdriveExport?.connected !== true || accounts.length === 0) {
        const connected = await connectGdriveViaPopup();
        if (connected) {
          await qc.invalidateQueries({ queryKey: GDRIVE_ACCOUNTS_KEY });
          await qc.invalidateQueries({ queryKey: envelopeKeys.detail(envelope.id) });
          accounts = await listAccounts().catch(() => [] as ReadonlyArray<GDriveAccount>);
        }
      }
      const account = pickActiveAccount(accounts);
      if (!account) return { kind: 'connect-needed' };

      setInFlight(true);
      try {
        // 2) Picker credentials (short-lived access token + dev key + app id).
        let creds;
        try {
          creds = await fetchPickerCredentials(account.id);
        } catch (err) {
          const e = err as ApiError;
          if (e.status === 503) return { kind: 'picker-not-configured' };
          if (e.status === 401) return { kind: 'reconnect-needed' };
          return { kind: 'error', message: e.message };
        }

        // 3) Folder picker — open inside last-used folder if known.
        const picked = await openFolderPicker(creds, {
          parentFolderId: envelope.gdriveExport?.lastFolder?.id ?? null,
        });
        if (!picked) return { kind: 'canceled' };

        // 4) Server-side upload.
        let result: EnvelopeGdriveSaveResult;
        try {
          result = await saveEnvelopeToGdrive(envelope.id, {
            folderId: picked.id,
            folderName: picked.name,
          });
        } catch (err) {
          return mapSaveError(err as ApiError);
        }
        await qc.invalidateQueries({ queryKey: envelopeKeys.detail(envelope.id) });
        return result.error !== undefined ? { kind: 'partial', result } : { kind: 'saved', result };
      } finally {
        setInFlight(false);
      }
    },
    [qc],
  );

  return { inFlight, save };
}
