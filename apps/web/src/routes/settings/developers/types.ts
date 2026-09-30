import type { ApiKeyApprovalNotify, ApiKeyExpiryDays, ApiKeyScope } from 'shared';

/** A live key as the Developers page renders it. Revoked rows are omitted. */
export interface ApiKeyListItem {
  readonly id: string;
  readonly name: string;
  readonly prefix: string;
  readonly scopes: readonly ApiKeyScope[];
  readonly require_owner_approval: boolean;
  readonly allow_new_recipients: boolean;
  readonly always_require_signin: boolean;
  readonly approval_notify: ApiKeyApprovalNotify;
  readonly last_used_at: string | null;
  readonly expires_at: string | null;
}

export interface CreateKeyInput {
  readonly name?: string;
  readonly scopes?: readonly ApiKeyScope[];
  readonly expires_at?: string;
  readonly always_require_signin?: boolean;
}

export interface PatchKeyInput {
  readonly require_owner_approval?: boolean;
  readonly allow_new_recipients?: boolean;
  readonly always_require_signin?: boolean;
  readonly approval_notify?: ApiKeyApprovalNotify;
}

export interface DevelopersKeysScreenProps {
  readonly layout: 'desktop' | 'phone';
  readonly keys: readonly ApiKeyListItem[];
  readonly busy?: boolean | undefined;
  readonly notice?: string | null | undefined;
  readonly revealedSecret?: string | null | undefined;
  readonly now?: number | undefined;
  readonly sendLoginFresh?: boolean | undefined;
  readonly onCreate: (input: CreateKeyInput) => void;
  readonly onRevoke: (id: string) => void;
  readonly onPatch: (id: string, patch: PatchKeyInput) => void;
  readonly onDismissSecret: () => void;
  readonly onNeedFreshLogin: () => void;
}

export type { ApiKeyExpiryDays };
