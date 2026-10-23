import type { PatchAccessAuthRequest, SignerAuthMethod } from 'shared';

/** Per-recipient choice: follow the envelope setting, or force it on or off. */
export type AccessAuthOverride = 'inherit' | 'on' | 'off';

export interface SignerAccessAuth {
  readonly access: AccessAuthOverride;
  readonly action: AccessAuthOverride;
}

/**
 * Sender choice for the emailed one-time code (WP-11). `access` asks for a
 * code before a signer opens the document; `action` asks for a fresh one
 * right before they submit. `overrides` is keyed by the local signer id.
 */
export interface AccessAuthValue {
  readonly access: boolean;
  readonly action: boolean;
  readonly overrides: Readonly<Record<string, SignerAccessAuth>>;
}

export const DEFAULT_ACCESS_AUTH: AccessAuthValue = { access: false, action: false, overrides: {} };

const INHERIT: SignerAccessAuth = { access: 'inherit', action: 'inherit' };

export function overrideOf(value: AccessAuthValue, signerId: string): SignerAccessAuth {
  return value.overrides[signerId] ?? INHERIT;
}

/** Drops overrides for signers that were removed, so a stale row is never sent. */
export function reconcileAccessAuth(
  value: AccessAuthValue,
  signerIds: ReadonlyArray<string>,
): AccessAuthValue {
  const keep = new Set(signerIds);
  const keys = Object.keys(value.overrides);
  if (keys.every((k) => keep.has(k))) return value;
  const overrides: Record<string, SignerAccessAuth> = {};
  for (const k of keys) {
    const o = value.overrides[k];
    if (keep.has(k) && o !== undefined) overrides[k] = o;
  }
  return { ...value, overrides };
}

export function setOverride(
  value: AccessAuthValue,
  signerId: string,
  patch: Partial<SignerAccessAuth>,
): AccessAuthValue {
  const next = { ...overrideOf(value, signerId), ...patch };
  const overrides: Record<string, SignerAccessAuth> = { ...value.overrides };
  if (next.access === 'inherit' && next.action === 'inherit') delete overrides[signerId];
  else overrides[signerId] = next;
  return { ...value, overrides };
}

/** True when the value changes nothing, so no request is needed. */
export function isDefaultAccessAuth(value: AccessAuthValue): boolean {
  return !value.access && !value.action && Object.keys(value.overrides).length === 0;
}

const method = (on: boolean): SignerAuthMethod => (on ? 'email_otp' : 'none');

function overrideMethod(o: AccessAuthOverride): SignerAuthMethod | null {
  if (o === 'inherit') return null;
  return method(o === 'on');
}

/**
 * Body for `PATCH /envelopes/:id/access-auth`, or null when nothing was
 * chosen (the default send makes no extra request). `serverIds` maps the
 * local signer ids to the ids the API assigned.
 */
export function toAccessAuthRequest(
  value: AccessAuthValue,
  serverIds: ReadonlyMap<string, string>,
): PatchAccessAuthRequest | null {
  if (isDefaultAccessAuth(value)) return null;
  const signers: NonNullable<PatchAccessAuthRequest['signers']> = [];
  for (const [localId, o] of Object.entries(value.overrides)) {
    const signerId = serverIds.get(localId);
    if (signerId === undefined) continue;
    signers.push({
      signer_id: signerId,
      access_auth: overrideMethod(o.access),
      action_auth: overrideMethod(o.action),
    });
  }
  return {
    access_auth: method(value.access),
    action_auth: method(value.action),
    ...(signers.length > 0 ? { signers } : {}),
  };
}
