import type { ApiKeyScope } from 'shared';

/** A key the Developers page renders. Revoked rows are omitted. */
export interface ApiKeyListItem {
  readonly id: string;
  readonly name: string;
  readonly prefix: string;
  readonly scopes: readonly ApiKeyScope[];
  readonly last_used_at: string | null;
  readonly expires_at: string | null;
}

export interface CreateKeyInput {
  readonly name?: string;
  readonly scopes?: readonly ApiKeyScope[];
  readonly expires_at?: string;
  readonly always_require_signin?: boolean;
}

export type KeysScreenStatus = 'loading' | 'ready' | 'error';

export interface DevelopersKeysScreenProps {
  readonly layout: 'desktop' | 'phone';
  readonly keys: readonly ApiKeyListItem[];
  readonly status?: KeysScreenStatus | undefined;
  readonly creating?: boolean | undefined;
  readonly notice?: string | null | undefined;
  readonly toast?: string | null | undefined;
  readonly revealedSecret?: string | null | undefined;
  readonly now?: number | undefined;
  readonly initialAdvanced?: boolean | undefined;
  readonly revokeOpen?: boolean | undefined;
  readonly onCreate: (input: CreateKeyInput) => void;
  readonly onRevoke: (id: string) => void;
  readonly onDismissSecret: () => void;
  readonly onRetry?: (() => void) | undefined;
}
