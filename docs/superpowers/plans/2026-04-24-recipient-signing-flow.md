# Recipient Signing Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a public, no-account recipient signing surface at `/sign/:envelopeId` wired end-to-end to the existing Nest `/sign/*` endpoints.

**Architecture:** A new `signApiClient` (axios, cookie-based, no Supabase interceptor) talks to the Nest API. A new `features/signing/` feature folder exposes react-query hooks + a `SigningSessionProvider`. Six new public routes drive six new L4 pages that compose seven new L2 core components.

**Tech Stack:** React 18 + TypeScript strict · styled-components 6 · react-router 7 · axios 1 · @tanstack/react-query 5 · Vitest + Testing Library + vitest-axe · Storybook 8.

**Spec:** `docs/superpowers/specs/2026-04-24-recipient-signing-flow-design.md`

**Conventions (non-negotiable):**
- Every new component is a 6-file bundle: `Name.tsx`, `Name.types.ts`, `Name.styles.ts`, `Name.test.tsx`, `Name.stories.tsx`, `index.ts`. `forwardRef` + `displayName`. Named exports only.
- Use theme tokens (`theme.color.*`, `theme.space.*`, `theme.radius.*`). **Never** hex literals in `*.styles.ts` — lint will reject them.
- No default exports (`import/no-default-export` is `error`).
- Function components only (`react/function-component-definition`).
- `exactOptionalPropertyTypes: true` — spread optional props with `...(x ? { x } : {})`.
- Tests: `renderWithTheme` from `src/test/renderWithTheme.tsx`, `axe` from `vitest-axe`, `userEvent` from `@testing-library/user-event`.
- After each task's last step, run: `pnpm --filter web test && pnpm --filter web lint --max-warnings=0 && pnpm --filter web typecheck` — all three green before commit.

---

## File Structure

**New — library infra:**
- `apps/web/src/lib/api/signApiClient.ts` — axios instance, cookies, shared `ApiError`.

**New — feature folder:**
- `apps/web/src/features/signing/signingApi.ts` — wire-level functions.
- `apps/web/src/features/signing/useSigning.ts` — react-query hooks.
- `apps/web/src/features/signing/session.tsx` — `SigningSessionProvider` + `useSigningSession`.
- `apps/web/src/features/signing/doneSnapshot.ts` — `sessionStorage` helpers for done/declined handoff.
- `apps/web/src/features/signing/index.ts` — barrel.

**New — L2 components** (each a 6-file bundle under `apps/web/src/components/<Name>/`):
- `RecipientHeader`, `DocumentPageCanvas`, `SignatureField`, `SignatureCapture`, `FieldInputDrawer`, `ProgressBar`, `ReviewList`.

**New — L4 pages** (each under `apps/web/src/pages/<Name>/`):
- `SigningEntryPage`, `SigningPrepPage`, `SigningFillPage`, `SigningReviewPage`, `SigningDonePage`, `SigningDeclinedPage`.

**New — route guard:**
- `apps/web/src/layout/RequireSignerSession.tsx`.

**Modify:**
- `apps/web/src/AppRoutes.tsx` — add the six public routes + guard.
- `apps/web/.eslintrc.cjs` — extend L1/L2 zones for the new L2 components.
- `apps/web/src/components/EmailCard/EmailCard.stories.tsx` — add a `SigningRequest` story.

---

## Task 1: Scaffold `signApiClient` (axios, cookies, no Supabase)

**Files:**
- Create: `apps/web/src/lib/api/signApiClient.ts`
- Create: `apps/web/src/lib/api/signApiClient.test.ts`

- [ ] **Step 1: Write the failing test**

`apps/web/src/lib/api/signApiClient.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { signApiClient } from './signApiClient';

describe('signApiClient', () => {
  it('sends credentials (cookies) with every request', () => {
    expect(signApiClient.defaults.withCredentials).toBe(true);
  });

  it('uses the VITE_API_BASE_URL as its baseURL', () => {
    expect(signApiClient.defaults.baseURL).toBe(import.meta.env.VITE_API_BASE_URL);
  });

  it('does NOT set an Authorization header by default', () => {
    const headers = signApiClient.defaults.headers.common as Record<string, unknown>;
    expect(headers.Authorization).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test -- signApiClient`
Expected: `Cannot find module './signApiClient'`.

- [ ] **Step 3: Write minimal implementation**

`apps/web/src/lib/api/signApiClient.ts`:

```ts
import axios from 'axios';
import type { AxiosError, AxiosInstance } from 'axios';

/**
 * Axios instance for the signer-facing `/sign/*` routes.
 *
 * Unlike the shared `apiClient`, this one:
 *  - sets `withCredentials: true` so the browser includes the HttpOnly
 *    `seald_sign` cookie automatically on every request, and
 *  - has NO request interceptor — Supabase auth is irrelevant on the
 *    signer surface.
 *
 * A response interceptor mirrors the apiClient one so callers get a
 * consistent `ApiError` (`status` + readable `message`) to catch.
 */
const BASE = import.meta.env.VITE_API_BASE_URL as string | undefined;
if (!BASE) {
  throw new Error('Missing VITE_API_BASE_URL');
}

export const signApiClient: AxiosInstance = axios.create({
  baseURL: BASE,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

export interface ApiError extends Error {
  status?: number;
}

function messageFromAxiosError(err: AxiosError): string {
  const body = err.response?.data as
    | { readonly message?: string | ReadonlyArray<string> }
    | undefined;
  if (body?.message) {
    return Array.isArray(body.message) ? body.message.join(', ') : String(body.message);
  }
  return err.response?.statusText ?? err.message ?? 'Request failed';
}

signApiClient.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (axios.isAxiosError(error)) {
      const wrapped: ApiError = new Error(messageFromAxiosError(error));
      if (error.response?.status !== undefined) {
        wrapped.status = error.response.status;
      }
      throw wrapped;
    }
    throw error;
  },
);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter web test -- signApiClient`
Expected: 3 passing.

- [ ] **Step 5: Run quality gates**

Run: `pnpm --filter web lint --max-warnings=0 && pnpm --filter web typecheck`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/api/signApiClient.ts apps/web/src/lib/api/signApiClient.test.ts
git commit -m "feat(web): add signApiClient (cookie-based axios for /sign/*)"
```

---

## Task 2: `signingApi.ts` — typed wire-level functions

**Files:**
- Create: `apps/web/src/features/signing/signingApi.ts`
- Create: `apps/web/src/features/signing/signingApi.test.ts`

- [ ] **Step 1: Write the failing test**

`apps/web/src/features/signing/signingApi.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  startSession,
  getMe,
  acceptTerms,
  fillField,
  uploadSignature,
  submit,
  decline,
  getPdfUrl,
} from './signingApi';

vi.mock('../../lib/api/signApiClient', () => ({
  signApiClient: {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
    defaults: { baseURL: 'http://test' },
  },
}));

import { signApiClient } from '../../lib/api/signApiClient';
const mocked = signApiClient as unknown as {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  mocked.get.mockReset();
  mocked.post.mockReset();
});

describe('signingApi', () => {
  it('startSession POSTs /sign/start and returns the parsed body', async () => {
    mocked.post.mockResolvedValueOnce({
      data: { envelope_id: 'env1', signer_id: 's1', requires_tc_accept: true },
    });
    const out = await startSession({ envelope_id: 'env1', token: 'tok' });
    expect(mocked.post).toHaveBeenCalledWith('/sign/start', {
      envelope_id: 'env1',
      token: 'tok',
    }, {});
    expect(out).toEqual({ envelope_id: 'env1', signer_id: 's1', requires_tc_accept: true });
  });

  it('getMe GETs /sign/me', async () => {
    mocked.get.mockResolvedValueOnce({ data: { envelope: {}, signer: {}, fields: [], other_signers: [] } });
    await getMe();
    expect(mocked.get).toHaveBeenCalledWith('/sign/me', {});
  });

  it('acceptTerms POSTs /sign/accept-terms', async () => {
    mocked.post.mockResolvedValueOnce({ data: null });
    await acceptTerms();
    expect(mocked.post).toHaveBeenCalledWith('/sign/accept-terms', undefined, {});
  });

  it('fillField POSTs /sign/fields/:id with a value_text body', async () => {
    mocked.post.mockResolvedValueOnce({ data: { id: 'f1' } });
    await fillField('f1', { value_text: 'hello' });
    expect(mocked.post).toHaveBeenCalledWith('/sign/fields/f1', { value_text: 'hello' }, {});
  });

  it('fillField POSTs with value_boolean for checkboxes', async () => {
    mocked.post.mockResolvedValueOnce({ data: { id: 'f2' } });
    await fillField('f2', { value_boolean: true });
    expect(mocked.post).toHaveBeenCalledWith('/sign/fields/f2', { value_boolean: true }, {});
  });

  it('uploadSignature POSTs multipart to /sign/signature', async () => {
    mocked.post.mockResolvedValueOnce({ data: { id: 's1' } });
    const blob = new Blob(['x'], { type: 'image/png' });
    await uploadSignature({ blob, format: 'typed' });
    const [url, body, config] = mocked.post.mock.calls[0]!;
    expect(url).toBe('/sign/signature');
    expect(body).toBeInstanceOf(FormData);
    expect((body as FormData).get('format')).toBe('typed');
    expect((body as FormData).get('image')).toBeInstanceOf(Blob);
    expect(config).toMatchObject({ headers: { 'Content-Type': 'multipart/form-data' } });
  });

  it('submit POSTs /sign/submit', async () => {
    mocked.post.mockResolvedValueOnce({ data: { status: 'submitted', envelope_status: 'sealing' } });
    const out = await submit();
    expect(mocked.post).toHaveBeenCalledWith('/sign/submit', undefined, {});
    expect(out).toEqual({ status: 'submitted', envelope_status: 'sealing' });
  });

  it('decline POSTs /sign/decline with an optional reason', async () => {
    mocked.post.mockResolvedValueOnce({ data: { status: 'declined', envelope_status: 'declined' } });
    await decline('no thanks');
    expect(mocked.post).toHaveBeenCalledWith('/sign/decline', { reason: 'no thanks' }, {});
  });

  it('getPdfUrl returns the absolute /sign/pdf URL relative to the baseURL', () => {
    expect(getPdfUrl()).toBe('http://test/sign/pdf');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test -- signingApi`
Expected: Cannot resolve `./signingApi`.

- [ ] **Step 3: Write minimal implementation**

`apps/web/src/features/signing/signingApi.ts`:

```ts
import type { AxiosRequestConfig } from 'axios';
import { signApiClient } from '../../lib/api/signApiClient';

/* ---------------- Wire-level types (mirror the Nest responses) ---------------- */

export type SignerRole = 'proposer' | 'signatory' | 'validator' | 'witness';
export type SignerUiStatus = 'awaiting' | 'viewing' | 'completed' | 'declined';
export type FieldKind = 'signature' | 'initials' | 'date' | 'text' | 'checkbox' | 'email';
export type SignatureFormat = 'drawn' | 'typed' | 'upload';

export interface SignMeEnvelope {
  readonly id: string;
  readonly title: string;
  readonly short_code: string;
  readonly status: string;
  readonly original_pages: number | null;
  readonly expires_at: string;
  readonly tc_version: string;
  readonly privacy_version: string;
}
export interface SignMeSigner {
  readonly id: string;
  readonly email: string;
  readonly name: string;
  readonly color: string;
  readonly role: SignerRole;
  readonly status: SignerUiStatus;
  readonly viewed_at: string | null;
  readonly tc_accepted_at: string | null;
  readonly signed_at: string | null;
  readonly declined_at: string | null;
}
export interface SignMeField {
  readonly id: string;
  readonly signer_id: string;
  readonly kind: FieldKind;
  readonly page: number;
  readonly x: number;
  readonly y: number;
  readonly width?: number | null;
  readonly height?: number | null;
  readonly required: boolean;
  readonly link_id?: string | null;
  readonly value_text?: string | null;
  readonly value_boolean?: boolean | null;
  readonly filled_at?: string | null;
}
export interface SignMeOtherSigner {
  readonly id: string;
  readonly status: SignerUiStatus;
  readonly name_masked: string;
}
export interface SignMeResponse {
  readonly envelope: SignMeEnvelope;
  readonly signer: SignMeSigner;
  readonly fields: ReadonlyArray<SignMeField>;
  readonly other_signers: ReadonlyArray<SignMeOtherSigner>;
}

export interface StartSessionInput {
  readonly envelope_id: string;
  readonly token: string;
}
export interface StartSessionResponse {
  readonly envelope_id: string;
  readonly signer_id: string;
  readonly requires_tc_accept: boolean;
}

export type FillValue =
  | { readonly value_text: string }
  | { readonly value_boolean: boolean };

export interface SignatureInput {
  readonly blob: Blob;
  readonly format: SignatureFormat;
  readonly font?: string;
  readonly stroke_count?: number;
  readonly source_filename?: string;
}

export interface SubmitResponse {
  readonly status: 'submitted';
  readonly envelope_status: string;
}
export interface DeclineResponse {
  readonly status: 'declined';
  readonly envelope_status: string;
}

/* ---------------- Wire functions ---------------- */

function configWithSignal(signal?: AbortSignal): AxiosRequestConfig {
  return signal ? { signal } : {};
}

export async function startSession(
  input: StartSessionInput,
  signal?: AbortSignal,
): Promise<StartSessionResponse> {
  const { data } = await signApiClient.post<StartSessionResponse>(
    '/sign/start',
    input,
    configWithSignal(signal),
  );
  return data;
}

export async function getMe(signal?: AbortSignal): Promise<SignMeResponse> {
  const { data } = await signApiClient.get<SignMeResponse>('/sign/me', configWithSignal(signal));
  return data;
}

export async function acceptTerms(signal?: AbortSignal): Promise<void> {
  await signApiClient.post('/sign/accept-terms', undefined, configWithSignal(signal));
}

export async function fillField(
  fieldId: string,
  value: FillValue,
  signal?: AbortSignal,
): Promise<SignMeField> {
  const { data } = await signApiClient.post<SignMeField>(
    `/sign/fields/${fieldId}`,
    value,
    configWithSignal(signal),
  );
  return data;
}

export async function uploadSignature(
  input: SignatureInput,
  signal?: AbortSignal,
): Promise<SignMeSigner> {
  const fd = new FormData();
  fd.append('image', input.blob, input.source_filename ?? 'signature.png');
  fd.append('format', input.format);
  if (input.font !== undefined) fd.append('font', input.font);
  if (input.stroke_count !== undefined) fd.append('stroke_count', String(input.stroke_count));
  if (input.source_filename !== undefined) fd.append('source_filename', input.source_filename);

  const config: AxiosRequestConfig = {
    headers: { 'Content-Type': 'multipart/form-data' },
    ...(signal ? { signal } : {}),
  };
  const { data } = await signApiClient.post<SignMeSigner>('/sign/signature', fd, config);
  return data;
}

export async function submit(signal?: AbortSignal): Promise<SubmitResponse> {
  const { data } = await signApiClient.post<SubmitResponse>(
    '/sign/submit',
    undefined,
    configWithSignal(signal),
  );
  return data;
}

export async function decline(reason?: string, signal?: AbortSignal): Promise<DeclineResponse> {
  const body = reason !== undefined ? { reason } : undefined;
  const { data } = await signApiClient.post<DeclineResponse>(
    '/sign/decline',
    body,
    configWithSignal(signal),
  );
  return data;
}

export function getPdfUrl(): string {
  return `${signApiClient.defaults.baseURL}/sign/pdf`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter web test -- signingApi`
Expected: 9 passing.

- [ ] **Step 5: Quality gates + commit**

```bash
pnpm --filter web lint --max-warnings=0 && pnpm --filter web typecheck
git add apps/web/src/features/signing/signingApi.ts apps/web/src/features/signing/signingApi.test.ts
git commit -m "feat(web): signing API wire functions"
```

---

## Task 3: React-Query hooks + done-snapshot helper

**Files:**
- Create: `apps/web/src/features/signing/doneSnapshot.ts`
- Create: `apps/web/src/features/signing/useSigning.ts`
- Create: `apps/web/src/features/signing/useSigning.test.tsx`

- [ ] **Step 1: Write the done-snapshot helper**

`apps/web/src/features/signing/doneSnapshot.ts`:

```ts
/**
 * sessionStorage-backed handoff for the Done / Declined pages. Once
 * `/sign/submit` or `/sign/decline` fires, the server clears the session
 * cookie, so we can no longer call `/sign/me`. The mutation handlers stash
 * the copy they'll need to render the terminal page here, before navigating.
 */
export interface DoneSnapshot {
  readonly kind: 'submitted' | 'declined';
  readonly envelope_id: string;
  readonly title: string;
  readonly sender_name: string | null;
  readonly recipient_email: string;
  readonly timestamp: string;
}

const KEY = 'sealed.sign.last';

export function writeDoneSnapshot(snapshot: DoneSnapshot): void {
  if (typeof window === 'undefined') return;
  window.sessionStorage.setItem(KEY, JSON.stringify(snapshot));
}

export function readDoneSnapshot(envelope_id: string): DoneSnapshot | null {
  if (typeof window === 'undefined') return null;
  const raw = window.sessionStorage.getItem(KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as DoneSnapshot;
    return parsed.envelope_id === envelope_id ? parsed : null;
  } catch {
    return null;
  }
}

export function clearDoneSnapshot(): void {
  if (typeof window === 'undefined') return;
  window.sessionStorage.removeItem(KEY);
}
```

- [ ] **Step 2: Write the failing test for hooks**

`apps/web/src/features/signing/useSigning.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReactNode } from 'react';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('./signingApi', () => ({
  startSession: vi.fn(),
  getMe: vi.fn(),
  acceptTerms: vi.fn(),
  fillField: vi.fn(),
  uploadSignature: vi.fn(),
  submit: vi.fn(),
  decline: vi.fn(),
  getPdfUrl: () => 'http://test/sign/pdf',
}));

import * as api from './signingApi';
import {
  SIGN_ME_KEY,
  useSignMeQuery,
  useFillFieldMutation,
  useSubmitMutation,
  useDeclineMutation,
} from './useSigning';
import { readDoneSnapshot } from './doneSnapshot';

const ENV_ID = 'env-123';
const FIELD: api.SignMeField = {
  id: 'f1',
  signer_id: 's1',
  kind: 'text',
  page: 1,
  x: 0.1,
  y: 0.1,
  required: true,
  value_text: null,
  filled_at: null,
};
const ME: api.SignMeResponse = {
  envelope: {
    id: ENV_ID,
    title: 'MSA',
    short_code: 'DOC-ABCD-1234',
    status: 'awaiting_others',
    original_pages: 1,
    expires_at: '2030-01-01T00:00:00.000Z',
    tc_version: 'v1',
    privacy_version: 'v1',
  },
  signer: {
    id: 's1',
    email: 'maya@example.com',
    name: 'Maya Raskin',
    color: '#10B981',
    role: 'signatory',
    status: 'viewing',
    viewed_at: null,
    tc_accepted_at: null,
    signed_at: null,
    declined_at: null,
  },
  fields: [FIELD],
  other_signers: [],
};

function wrap(qc: QueryClient) {
  return ({ children }: { readonly children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

function freshClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });
}

beforeEach(() => {
  (api.getMe as ReturnType<typeof vi.fn>).mockReset();
  (api.fillField as ReturnType<typeof vi.fn>).mockReset();
  (api.submit as ReturnType<typeof vi.fn>).mockReset();
  (api.decline as ReturnType<typeof vi.fn>).mockReset();
  window.sessionStorage.clear();
});

describe('useSignMeQuery', () => {
  it('calls getMe and returns the typed response', async () => {
    (api.getMe as ReturnType<typeof vi.fn>).mockResolvedValueOnce(ME);
    const qc = freshClient();
    const { result } = renderHook(() => useSignMeQuery(ENV_ID, true), { wrapper: wrap(qc) });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data).toEqual(ME);
    expect(api.getMe).toHaveBeenCalledTimes(1);
  });

  it('uses SIGN_ME_KEY(envelopeId) as the queryKey', () => {
    expect(SIGN_ME_KEY('abc')).toEqual(['sign', 'me', 'abc']);
  });
});

describe('useFillFieldMutation', () => {
  it('optimistically patches the cached sign.me field', async () => {
    (api.getMe as ReturnType<typeof vi.fn>).mockResolvedValueOnce(ME);
    (api.fillField as ReturnType<typeof vi.fn>).mockImplementation(
      () => new Promise(() => {}), // never resolves — we only care about the optimistic state
    );
    const qc = freshClient();
    const { result: q } = renderHook(() => useSignMeQuery(ENV_ID, true), { wrapper: wrap(qc) });
    await waitFor(() => expect(q.current.data).toBeDefined());

    const { result: m } = renderHook(() => useFillFieldMutation(ENV_ID), { wrapper: wrap(qc) });
    act(() => {
      m.current.mutate({ field_id: 'f1', value: { value_text: 'hello' } });
    });

    await waitFor(() => {
      const next = qc.getQueryData<api.SignMeResponse>(SIGN_ME_KEY(ENV_ID));
      expect(next?.fields[0]?.value_text).toBe('hello');
    });
  });

  it('rolls back the cache when the mutation rejects', async () => {
    (api.getMe as ReturnType<typeof vi.fn>).mockResolvedValueOnce(ME);
    (api.fillField as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('boom'));
    const qc = freshClient();
    const { result: q } = renderHook(() => useSignMeQuery(ENV_ID, true), { wrapper: wrap(qc) });
    await waitFor(() => expect(q.current.data).toBeDefined());

    const { result: m } = renderHook(() => useFillFieldMutation(ENV_ID), { wrapper: wrap(qc) });
    await act(async () => {
      try {
        await m.current.mutateAsync({ field_id: 'f1', value: { value_text: 'nope' } });
      } catch {
        /* expected */
      }
    });

    const after = qc.getQueryData<api.SignMeResponse>(SIGN_ME_KEY(ENV_ID));
    expect(after?.fields[0]?.value_text).toBeNull();
  });
});

describe('useSubmitMutation', () => {
  it('writes a submitted snapshot to sessionStorage on success', async () => {
    (api.getMe as ReturnType<typeof vi.fn>).mockResolvedValueOnce(ME);
    (api.submit as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      status: 'submitted',
      envelope_status: 'sealing',
    });
    const qc = freshClient();
    const { result: q } = renderHook(() => useSignMeQuery(ENV_ID, true), { wrapper: wrap(qc) });
    await waitFor(() => expect(q.current.data).toBeDefined());

    const { result: m } = renderHook(
      () => useSubmitMutation(ENV_ID, { senderName: 'Eliran Azulay' }),
      { wrapper: wrap(qc) },
    );
    await act(async () => {
      await m.current.mutateAsync();
    });

    const snap = readDoneSnapshot(ENV_ID);
    expect(snap?.kind).toBe('submitted');
    expect(snap?.title).toBe('MSA');
    expect(snap?.recipient_email).toBe('maya@example.com');
    expect(snap?.sender_name).toBe('Eliran Azulay');
  });
});

describe('useDeclineMutation', () => {
  it('writes a declined snapshot to sessionStorage on success', async () => {
    (api.getMe as ReturnType<typeof vi.fn>).mockResolvedValueOnce(ME);
    (api.decline as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      status: 'declined',
      envelope_status: 'declined',
    });
    const qc = freshClient();
    const { result: q } = renderHook(() => useSignMeQuery(ENV_ID, true), { wrapper: wrap(qc) });
    await waitFor(() => expect(q.current.data).toBeDefined());

    const { result: m } = renderHook(() => useDeclineMutation(ENV_ID, { senderName: null }), {
      wrapper: wrap(qc),
    });
    await act(async () => {
      await m.current.mutateAsync('nope');
    });

    const snap = readDoneSnapshot(ENV_ID);
    expect(snap?.kind).toBe('declined');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter web test -- useSigning`
Expected: Cannot resolve `./useSigning`.

- [ ] **Step 4: Write the hooks**

`apps/web/src/features/signing/useSigning.ts`:

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as api from './signingApi';
import type {
  FillValue,
  SignMeField,
  SignMeResponse,
  SignMeSigner,
  SignatureInput,
} from './signingApi';
import { writeDoneSnapshot } from './doneSnapshot';

export const SIGN_ME_KEY = (envelopeId: string) => ['sign', 'me', envelopeId] as const;

/**
 * Single source of truth for the signer session. `enabled=false` lets
 * `RequireSignerSession` and page consumers hold off until the envelope id
 * has been parsed from the URL.
 */
export function useSignMeQuery(envelopeId: string, enabled: boolean) {
  return useQuery<SignMeResponse>({
    queryKey: SIGN_ME_KEY(envelopeId),
    queryFn: ({ signal }) => api.getMe(signal),
    enabled: enabled && Boolean(envelopeId),
    retry: 1,
  });
}

export function useStartSessionMutation() {
  return useMutation({
    mutationFn: (input: api.StartSessionInput) => api.startSession(input),
  });
}

export function useAcceptTermsMutation(envelopeId: string) {
  const qc = useQueryClient();
  return useMutation<void, Error, void, { readonly previous: SignMeResponse | undefined }>({
    mutationFn: () => api.acceptTerms(),
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: SIGN_ME_KEY(envelopeId) });
      const previous = qc.getQueryData<SignMeResponse>(SIGN_ME_KEY(envelopeId));
      if (previous) {
        qc.setQueryData<SignMeResponse>(SIGN_ME_KEY(envelopeId), {
          ...previous,
          signer: { ...previous.signer, tc_accepted_at: new Date().toISOString() },
        });
      }
      return { previous };
    },
    onError: (_err, _v, ctx) => {
      if (ctx?.previous) qc.setQueryData(SIGN_ME_KEY(envelopeId), ctx.previous);
    },
  });
}

export interface FillFieldArgs {
  readonly field_id: string;
  readonly value: FillValue;
}

export function useFillFieldMutation(envelopeId: string) {
  const qc = useQueryClient();
  return useMutation<SignMeField, Error, FillFieldArgs, { readonly previous: SignMeResponse | undefined }>({
    mutationFn: ({ field_id, value }) => api.fillField(field_id, value),
    onMutate: async ({ field_id, value }) => {
      await qc.cancelQueries({ queryKey: SIGN_ME_KEY(envelopeId) });
      const previous = qc.getQueryData<SignMeResponse>(SIGN_ME_KEY(envelopeId));
      if (previous) {
        qc.setQueryData<SignMeResponse>(SIGN_ME_KEY(envelopeId), {
          ...previous,
          fields: previous.fields.map((f) =>
            f.id === field_id
              ? {
                  ...f,
                  value_text: 'value_text' in value ? value.value_text : f.value_text ?? null,
                  value_boolean:
                    'value_boolean' in value ? value.value_boolean : f.value_boolean ?? null,
                  filled_at: new Date().toISOString(),
                }
              : f,
          ),
        });
      }
      return { previous };
    },
    onSuccess: (saved) => {
      const current = qc.getQueryData<SignMeResponse>(SIGN_ME_KEY(envelopeId));
      if (current) {
        qc.setQueryData<SignMeResponse>(SIGN_ME_KEY(envelopeId), {
          ...current,
          fields: current.fields.map((f) => (f.id === saved.id ? saved : f)),
        });
      }
    },
    onError: (_err, _args, ctx) => {
      if (ctx?.previous) qc.setQueryData(SIGN_ME_KEY(envelopeId), ctx.previous);
    },
  });
}

export interface SignatureMutationArgs {
  readonly field_id: string;
  readonly input: SignatureInput;
}

export function useSignatureMutation(envelopeId: string) {
  const qc = useQueryClient();
  return useMutation<SignMeSigner, Error, SignatureMutationArgs, { readonly previous: SignMeResponse | undefined }>({
    mutationFn: ({ input }) => api.uploadSignature(input),
    onMutate: async ({ field_id, input }) => {
      await qc.cancelQueries({ queryKey: SIGN_ME_KEY(envelopeId) });
      const previous = qc.getQueryData<SignMeResponse>(SIGN_ME_KEY(envelopeId));
      if (previous) {
        const previewUrl = URL.createObjectURL(input.blob);
        qc.setQueryData<SignMeResponse>(SIGN_ME_KEY(envelopeId), {
          ...previous,
          fields: previous.fields.map((f) =>
            f.id === field_id
              ? {
                  ...f,
                  value_text: previewUrl,
                  filled_at: new Date().toISOString(),
                }
              : f,
          ),
        });
      }
      return { previous };
    },
    onSuccess: (updatedSigner) => {
      const current = qc.getQueryData<SignMeResponse>(SIGN_ME_KEY(envelopeId));
      if (current) {
        qc.setQueryData<SignMeResponse>(SIGN_ME_KEY(envelopeId), {
          ...current,
          signer: updatedSigner,
        });
      }
    },
    onError: (_err, _args, ctx) => {
      if (ctx?.previous) qc.setQueryData(SIGN_ME_KEY(envelopeId), ctx.previous);
    },
  });
}

export interface TerminalMutationOptions {
  readonly senderName: string | null;
}

export function useSubmitMutation(envelopeId: string, opts: TerminalMutationOptions) {
  const qc = useQueryClient();
  return useMutation<api.SubmitResponse, Error, void>({
    mutationFn: () => api.submit(),
    onSuccess: () => {
      const me = qc.getQueryData<SignMeResponse>(SIGN_ME_KEY(envelopeId));
      writeDoneSnapshot({
        kind: 'submitted',
        envelope_id: envelopeId,
        title: me?.envelope.title ?? '',
        sender_name: opts.senderName,
        recipient_email: me?.signer.email ?? '',
        timestamp: new Date().toISOString(),
      });
      qc.removeQueries({ queryKey: SIGN_ME_KEY(envelopeId) });
    },
  });
}

export function useDeclineMutation(envelopeId: string, opts: TerminalMutationOptions) {
  const qc = useQueryClient();
  return useMutation<api.DeclineResponse, Error, string | undefined>({
    mutationFn: (reason) => api.decline(reason),
    onSuccess: () => {
      const me = qc.getQueryData<SignMeResponse>(SIGN_ME_KEY(envelopeId));
      writeDoneSnapshot({
        kind: 'declined',
        envelope_id: envelopeId,
        title: me?.envelope.title ?? '',
        sender_name: opts.senderName,
        recipient_email: me?.signer.email ?? '',
        timestamp: new Date().toISOString(),
      });
      qc.removeQueries({ queryKey: SIGN_ME_KEY(envelopeId) });
    },
  });
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter web test -- useSigning`
Expected: 6 passing.

- [ ] **Step 6: Quality gates + commit**

```bash
pnpm --filter web lint --max-warnings=0 && pnpm --filter web typecheck
git add apps/web/src/features/signing/doneSnapshot.ts apps/web/src/features/signing/useSigning.ts apps/web/src/features/signing/useSigning.test.tsx
git commit -m "feat(web): signing React-Query hooks + done snapshot"
```

---

## Task 4: `SigningSessionProvider` + `index.ts` barrel

**Files:**
- Create: `apps/web/src/features/signing/session.tsx`
- Create: `apps/web/src/features/signing/session.test.tsx`
- Create: `apps/web/src/features/signing/index.ts`

- [ ] **Step 1: Write the failing test**

`apps/web/src/features/signing/session.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('./signingApi', () => ({
  getMe: vi.fn(),
  fillField: vi.fn(),
  uploadSignature: vi.fn(),
  acceptTerms: vi.fn(),
  submit: vi.fn(),
  decline: vi.fn(),
  startSession: vi.fn(),
  getPdfUrl: () => 'http://test/sign/pdf',
}));

import * as api from './signingApi';
import { SigningSessionProvider, useSigningSession } from './session';

const ENV_ID = 'env-123';
const BASE_ME: api.SignMeResponse = {
  envelope: {
    id: ENV_ID, title: 'MSA', short_code: 'DOC-ABCD-1234', status: 'awaiting_others',
    original_pages: 1, expires_at: '2030-01-01T00:00:00.000Z',
    tc_version: 'v1', privacy_version: 'v1',
  },
  signer: {
    id: 's1', email: 'maya@example.com', name: 'Maya Raskin', color: '#10B981',
    role: 'signatory', status: 'viewing',
    viewed_at: null, tc_accepted_at: null, signed_at: null, declined_at: null,
  },
  fields: [
    { id: 'f1', signer_id: 's1', kind: 'text',     page: 1, x: 0, y: 0, required: true,  value_text: null,       filled_at: null },
    { id: 'f2', signer_id: 's1', kind: 'text',     page: 1, x: 0, y: 0, required: true,  value_text: 'done',     filled_at: '2026-04-24T00:00:00Z' },
    { id: 'f3', signer_id: 's1', kind: 'checkbox', page: 2, x: 0, y: 0, required: false, value_boolean: null,    filled_at: null },
  ],
  other_signers: [],
};

function wrap(qc: QueryClient) {
  return ({ children }: { readonly children: ReactNode }) => (
    <QueryClientProvider client={qc}>
      <SigningSessionProvider envelopeId={ENV_ID} senderName="Eliran Azulay">
        {children}
      </SigningSessionProvider>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  (api.getMe as ReturnType<typeof vi.fn>).mockReset();
  window.sessionStorage.clear();
});

describe('SigningSessionProvider', () => {
  it('derives completedRequired / requiredCount / nextField from fields', async () => {
    (api.getMe as ReturnType<typeof vi.fn>).mockResolvedValueOnce(BASE_ME);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    const { result } = renderHook(() => useSigningSession(), { wrapper: wrap(qc) });
    await waitFor(() => expect(result.current.envelope).toBeDefined());

    expect(result.current.requiredCount).toBe(2);
    expect(result.current.completedRequired).toBe(1);
    expect(result.current.allRequiredFilled).toBe(false);
    expect(result.current.nextField?.id).toBe('f1');
  });

  it('throws when used outside the provider', () => {
    const qc = new QueryClient();
    const bareWrap = ({ children }: { readonly children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
    expect(() =>
      renderHook(() => useSigningSession(), { wrapper: bareWrap }),
    ).toThrow(/useSigningSession/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test -- session.test`
Expected: Cannot resolve `./session`.

- [ ] **Step 3: Write the provider**

`apps/web/src/features/signing/session.tsx`:

```tsx
import { createContext, useContext, useMemo } from 'react';
import type { ReactNode } from 'react';
import {
  useAcceptTermsMutation,
  useDeclineMutation,
  useFillFieldMutation,
  useSignMeQuery,
  useSignatureMutation,
  useSubmitMutation,
} from './useSigning';
import type {
  FillValue,
  SignMeEnvelope,
  SignMeField,
  SignMeOtherSigner,
  SignMeSigner,
  SignatureInput,
} from './signingApi';

export interface SigningSessionValue {
  readonly loading: boolean;
  readonly error: Error | null;
  readonly envelope: SignMeEnvelope | null;
  readonly signer: SignMeSigner | null;
  readonly fields: ReadonlyArray<SignMeField>;
  readonly otherSigners: ReadonlyArray<SignMeOtherSigner>;
  readonly completedRequired: number;
  readonly requiredCount: number;
  readonly nextField: SignMeField | null;
  readonly allRequiredFilled: boolean;
  readonly fillField: (field_id: string, value: FillValue) => Promise<void>;
  readonly setSignature: (field_id: string, input: SignatureInput) => Promise<void>;
  readonly acceptTerms: () => Promise<void>;
  readonly submit: () => Promise<void>;
  readonly decline: (reason?: string) => Promise<void>;
}

const Ctx = createContext<SigningSessionValue | null>(null);

export interface SigningSessionProviderProps {
  readonly envelopeId: string;
  readonly senderName: string | null;
  readonly children: ReactNode;
}

function fieldIsFilled(f: SignMeField): boolean {
  if (f.kind === 'checkbox') return f.value_boolean === true;
  return Boolean(f.value_text);
}

export function SigningSessionProvider(props: SigningSessionProviderProps) {
  const { envelopeId, senderName, children } = props;

  const q = useSignMeQuery(envelopeId, true);
  const fill = useFillFieldMutation(envelopeId);
  const sig = useSignatureMutation(envelopeId);
  const terms = useAcceptTermsMutation(envelopeId);
  const submitMut = useSubmitMutation(envelopeId, { senderName });
  const declineMut = useDeclineMutation(envelopeId, { senderName });

  const value = useMemo<SigningSessionValue>(() => {
    const fields = q.data?.fields ?? [];
    const required = fields.filter((f) => f.required);
    const completed = required.filter(fieldIsFilled);
    const next = required.find((f) => !fieldIsFilled(f)) ?? null;

    return {
      loading: q.isPending,
      error: q.error ?? null,
      envelope: q.data?.envelope ?? null,
      signer: q.data?.signer ?? null,
      fields,
      otherSigners: q.data?.other_signers ?? [],
      requiredCount: required.length,
      completedRequired: completed.length,
      nextField: next,
      allRequiredFilled: required.length > 0 && next === null,
      fillField: async (field_id, val) => {
        await fill.mutateAsync({ field_id, value: val });
      },
      setSignature: async (field_id, input) => {
        await sig.mutateAsync({ field_id, input });
      },
      acceptTerms: async () => {
        await terms.mutateAsync();
      },
      submit: async () => {
        await submitMut.mutateAsync();
      },
      decline: async (reason) => {
        await declineMut.mutateAsync(reason);
      },
    };
  }, [q.data, q.isPending, q.error, fill, sig, terms, submitMut, declineMut]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSigningSession(): SigningSessionValue {
  const v = useContext(Ctx);
  if (!v) {
    throw new Error('useSigningSession must be called inside <SigningSessionProvider>');
  }
  return v;
}
```

- [ ] **Step 4: Write the barrel**

`apps/web/src/features/signing/index.ts`:

```ts
export {
  SIGN_ME_KEY,
  useSignMeQuery,
  useStartSessionMutation,
  useAcceptTermsMutation,
  useFillFieldMutation,
  useSignatureMutation,
  useSubmitMutation,
  useDeclineMutation,
} from './useSigning';
export type { FillFieldArgs, SignatureMutationArgs, TerminalMutationOptions } from './useSigning';
export { SigningSessionProvider, useSigningSession } from './session';
export type { SigningSessionValue, SigningSessionProviderProps } from './session';
export {
  startSession,
  getMe,
  acceptTerms,
  fillField,
  uploadSignature,
  submit,
  decline,
  getPdfUrl,
} from './signingApi';
export type {
  FieldKind,
  FillValue,
  SignMeEnvelope,
  SignMeField,
  SignMeOtherSigner,
  SignMeResponse,
  SignMeSigner,
  SignatureFormat,
  SignatureInput,
  SignerRole,
  SignerUiStatus,
  StartSessionInput,
  StartSessionResponse,
  SubmitResponse,
  DeclineResponse,
} from './signingApi';
export { readDoneSnapshot, writeDoneSnapshot, clearDoneSnapshot } from './doneSnapshot';
export type { DoneSnapshot } from './doneSnapshot';
```

- [ ] **Step 5: Run tests + gates + commit**

```bash
pnpm --filter web test -- features/signing
pnpm --filter web lint --max-warnings=0 && pnpm --filter web typecheck
git add apps/web/src/features/signing/
git commit -m "feat(web): SigningSessionProvider + feature barrel"
```

---

---

## Production-readiness amendments (apply alongside the remaining tasks)

The spec was written against a demo-readiness bar. Shipping this to real recipients demands additional hardening that's baked into the remaining tasks below — listed here so reviewers see the intent in one place.

### 1. Strict isolation between sender + signer code

`features/signing/*`, `pages/Signing*`, and the new L2 components **must not** import from any Supabase-aware module. A dedicated ESLint zone enforces this:

- `./src/features/signing` and `./src/pages/Signing*` and the new L2 component folders may not import:
  - `./src/lib/supabase/*`
  - `./src/providers/AuthProvider`
  - `./src/providers/AppStateProvider`
  - `./src/features/contacts/*`
  - `./src/lib/api/apiClient` (they must use `signApiClient` only)

Enforced in Task 20.

### 2. Route-level code splitting

Each of the six `SigningXxxPage` modules is registered via `React.lazy` in `AppRoutes.tsx` and wrapped in `<Suspense fallback={<AuthLoadingScreen />}>`. Recipients download signer bundles without ever paying for the sender bundle's Supabase/react-pdf weight on initial page load. Covered in Task 19.

### 3. Real PDF rendering (promoted from out-of-scope)

The spec originally deferred `pdfjs-dist` integration. A production recipient flow cannot ship placeholder bars in the document canvas — the signer must see the actual contract. Task 8 now delivers a `PdfPageRenderer` variant of `DocumentPageCanvas` that:

- Fetches the PDF via a `GET /sign/pdf` XHR (follows the 302 to the signed URL) so the browser keeps the cookie-scoped request.
- Renders page-by-page with the existing `pdfjs-dist` setup already used by the sender editor.
- Uses absolute field coordinates scaled to the rendered page dimensions so `SignatureField` positioning matches what the sender placed.

### 4. Error boundary at the signer root

A dedicated `SigningErrorBoundary` wraps the `/sign/*` route tree. On render errors it sends the user to a generic "Something went wrong" screen with a "Reload" button — isolating signer failures from the sender app. Task 19.

### 5. Telemetry seam (no-op in dev)

The signer pages emit typed events through a tiny `useSignerTelemetry()` hook (module: `features/signing/telemetry.ts`). The default implementation is a no-op; a production build wires it to the observability provider. Events: `sign.link.opened`, `sign.session.started`, `sign.tc.accepted`, `sign.field.filled`, `sign.signature.uploaded`, `sign.submitted`, `sign.declined`, `sign.error`. Task 4 appendix (or dedicated Task 4b).

### 6. Hardened terminal-state handling

`useSubmitMutation` / `useDeclineMutation` **must** write the `DoneSnapshot` to sessionStorage **before** returning, and `removeQueries` the `SIGN_ME_KEY` so any stale render no longer holds a decrypted copy of the envelope. Already in Task 3 — verify during Task 19 integration.

### 7. URL token hygiene

The entry page calls `history.replaceState(null, '', /sign/${envelopeId}/prep)` **after** a successful `POST /sign/start` resolves. On error we still scrub `?t=` from the URL before rendering the error state, so browser back/refresh never replays a burned token. Task 13.

### 8. No `localStorage` for anything on the signer surface

The only client-side persistence is `sessionStorage` (cleared on tab close) for the done snapshot. `useMinDuration` / any hook that defaults to `localStorage` elsewhere in the app is **not** used under `features/signing/*`. Verified by the ESLint isolation zone.

### 9. Mobile-first layout verification

Each new L2 component ships with a Storybook `Mobile` story under a 375×812 viewport parameter. `FieldInputDrawer` and `SignatureCapture` (bottom sheets) render at that viewport without overflow — covered in Tasks 9 + 10.

### 10. Rate-limit + 410 / 401 UX polish

The entry page, fill page, and signature upload each surface specific messages for 429 (rate-limit), 410 (link burned), 401 (session lost). Covered as part of each page's task, not a separate task.

---

## Tasks 5–21 (condensed form — every task still TDD: write test → fail → implement → pass → quality gates → commit)

Conventions from the header apply to every task. Every new component ships the 6-file bundle and its ESLint zone entry (Task 20).

### Task 5 — `RecipientHeader` (L2)
**Path:** `apps/web/src/components/RecipientHeader/`
**Props:** `docTitle: string; docId: string; senderName?: string; stepLabel?: string; onExit?: () => void`
**Render:** sticky top bar 60px. Logo · vertical divider · title (ellipsis) + `From {sender} · {docId}` in mono · optional step chip (right-aligned pill) · optional exit button (X icon).
**Tests:** renders title + doc id; step chip conditional; onExit click; axe clean; ref forwards to `<header>`.
**Stories:** `Default`, `WithStep`, `WithExit`, `Mobile` (viewport 375×812).

### Task 6 — `ProgressBar` (L1; added to L1 zone)
**Path:** `apps/web/src/components/ProgressBar/`
**Props:** `value: number; max: number; label?: string; tone?: 'indigo' | 'success'`
**Render:** 6px rounded-pill track with filled bar. `role="progressbar"`, `aria-valuemin/max/now`, `aria-label` defaults to `"{value} of {max}"`.
**Tests:** aria values; tone color; axe clean; ref forwards.
**Stories:** `Default`, `Complete`, `SuccessTone`.

### Task 7 — `ReviewList` (L2)
**Path:** `apps/web/src/components/ReviewList/`
**Types:** `ReviewItem = { id: string; kind: FieldKind; label: string; page: number; valuePreview: ReactNode }`
**Props:** `items: ReadonlyArray<ReviewItem>`
**Render:** vertical list; each row: icon badge (indigo-50/700 circle) · `{label}` (semibold) + `Page {page}` (fg-3) · right-aligned `valuePreview` (max 200px, ellipsis for strings, raw node for `ReactNode` so signatures render via existing `SignatureMark`).
**Tests:** renders all items; per-kind icon (check against lucide icon name via `data-icon-kind`); axe clean.
**Stories:** `Default` (one of every kind including signature using `SignatureMark`).

### Task 8 — `DocumentPageCanvas` (L2)
**Path:** `apps/web/src/components/DocumentPageCanvas/`
**Files + variant split:** two top-level exports from `index.ts` — `DocumentPageCanvas` (placeholder) and `PdfPageRenderer` (pdfjs-dist).
**Props (shared):** `pageNum: number; totalPages: number; width?: number; children?: ReactNode`
**`DocumentPageCanvas` render:** white paper panel, `theme.shadow.paper`, default 560×740, heading placeholder bars (existing prototype style). `children` absolutely positioned.
**`PdfPageRenderer` props:** `pdfSrc: string; pageNum: number; totalPages: number; width?: number; children?: ReactNode; onLoadError?: (e: Error) => void`
**`PdfPageRenderer` behavior:** dynamically imports `pdfjs-dist` (keeps it out of the critical bundle); loads the PDF once at the container level via a shared `usePdfDocument(src)` hook (new: `apps/web/src/features/signing/usePdfDocument.ts`), renders via `<canvas>` at requested width; on load error calls `onLoadError` and renders a tasteful inline "PDF preview unavailable" banner + the placeholder variant so signing still works.
**Tests:** `DocumentPageCanvas` — renders children; `PdfPageRenderer` — uses a vi.mock of `pdfjs-dist` that returns a fake doc with `getPage` + `render`; verifies canvas context is called; verifies fallback to placeholder on error.
**Stories:** `DocumentPageCanvas/Default`, `DocumentPageCanvas/WithFields`, `PdfPageRenderer/Default` (inline tiny base64 PDF), `Mobile` variant (280 width).

### Task 9 — `SignatureField` (L2)
**Path:** `apps/web/src/components/SignatureField/`
**Types:** `FieldBoxKind = FieldKind | 'name'` (the wire contract doesn't include `name`; we treat wire-`text` + a `link_id === 'name'` convention as `name` in the UI — label/icon differ but data path is still `value_text`).
**Props:** `kind: FieldBoxKind; label: string; required: boolean; active: boolean; filled: boolean; value?: string | boolean; x: number; y: number; w: number; h: number; onClick: () => void`
**Render:** absolute-positioned `<button type="button">` — dashed border when empty, solid when filled; tone color derived from (filled | active | required-empty | optional-empty); renders the value per kind (signature → `SignatureMark` with `value` as name; initials → Caveat font; checkbox → 18px check; text/date/name/email → formatted string); empty state shows `Icon` + label + `*` if required; focus ring from `theme.shadow.focus`.
**Tests:** one test per (kind × tone) matrix (uses `describe.each`); click fires onClick; axe clean; ref forwards.
**Stories:** one story per kind (`Signature`, `Initial`, `Date`, `Text`, `Name`, `Email`, `Checkbox`) + `AllTones`.

### Task 10 — `SignatureCapture` (L2)
**Path:** `apps/web/src/components/SignatureCapture/`
**Types:** `SignatureCaptureResult = { blob: Blob; format: 'drawn' | 'typed' | 'upload'; font?: string; stroke_count?: number; source_filename?: string }`
**Props:** `kind: 'signature' | 'initial'; defaultName: string; onCancel: () => void; onApply: (r: SignatureCaptureResult) => void; open: boolean`
**Render:** bottom-sheet modal (fixed bottom, rounded-top 20px, ink-900 overlay). Tabs `type | draw | upload` (segmented control). Tab content:
- **type:** TextField (name / initials) + preview panel (Caveat font sample for initial, `SignatureMark` for signature) → on Apply, renders into an offscreen canvas → `canvas.toBlob('image/png')` → emits `{ blob, format: 'typed', font: 'Caveat' }`.
- **draw:** `<canvas>` with `onPointerDown/Move/Up` + touch-action: none; tracks stroke count; on Apply, converts canvas to blob → `{ blob, format: 'drawn', stroke_count: n }`.
- **upload:** `<input type="file" accept="image/png,image/jpeg">`; on choose, reads → sets preview → on Apply emits `{ blob, format: 'upload', source_filename }`.
Apply disabled unless content is present (name not empty / stroke_count > 0 / file chosen).
Footer: "Encrypted and audit-logged" left + Cancel/Apply right.
**Tests:** tab switching; `type` emits blob on Apply; `draw` tab responds to `pointerdown/move/up` and increments stroke count; `upload` tab accepts a file and previews; Apply disabled until valid; Cancel fires; axe clean at each tab; modal traps focus (roving focus via `focus-trap-react` if present — otherwise a minimal `useFocusTrap` hook inlined in `SignatureCapture`).
**Stories:** `Type`, `Draw`, `Upload`, `Initials`, `Mobile`.

### Task 11 — `FieldInputDrawer` (L2)
**Path:** `apps/web/src/components/FieldInputDrawer/`
**Props:** `open: boolean; label: string; kind: 'text' | 'email' | 'date' | 'name'; initialValue?: string; onCancel: () => void; onApply: (value: string) => void`
**Render:** bottom-sheet modal. One input (typed per `kind` — `email` uses `type="email"`, `date` uses `type="date"`, text/name use `type="text"`). Validates on Apply (non-empty; email regex for `email`; ISO date for `date`); Apply disabled otherwise; error text inline under input. Footer matches `SignatureCapture` for consistency.
**Tests:** per-kind render; validation gates Apply; invalid email shows error; Cancel fires; axe clean; focus moves to input on open.
**Stories:** `Text`, `Email`, `Date`, `Name`, `Mobile`.

### Task 12 — `RequireSignerSession` guard
**Path:** `apps/web/src/features/signing/RequireSignerSession.tsx` (kept inside the feature folder; imports `useSignMeQuery` directly).
**Render:** reads `useParams<{ envelopeId: string }>()`; calls `useSignMeQuery(envelopeId, true)`; while `isPending` → `AuthLoadingScreen`; on error with `status === 401 | 410` → `<Navigate to="/sign/{envelopeId}" replace />`; on error otherwise → throw (caught by `SigningErrorBoundary`); on success → `<Outlet />`.
**Tests:** mocks `useSignMeQuery` (via mocking `features/signing/useSigning`); verifies pending → spinner, 401 → Navigate to entry, success → Outlet.

### Task 13 — `SigningEntryPage` (L4)
**Path:** `apps/web/src/pages/SigningEntryPage/`
**Logic:** on mount — read `:envelopeId` + `?t` via `useParams` + `useSearchParams`. If token missing → render `InvalidLinkState` (with mailto). Otherwise call `useStartSessionMutation` once (guarded by a `useRef` so `StrictMode`'s double-invoke doesn't double-spend the token). On success:
```ts
window.history.replaceState(null, '', `/sign/${envelopeId}/prep`);
navigate(result.requires_tc_accept ? `/sign/${envelopeId}/prep` : `/sign/${envelopeId}/fill`);
```
On error — scrub `?t=` first via replaceState, then map status to copy (400 → Invalid, 401/410 → Link burned, 404 → Not found, 429 → Rate limit, else generic).
**States:** `Loading` (spinner), `InvalidLinkState`, `BurnedLinkState`, `NotFoundState`, `RateLimitState`, `GenericErrorState` — each is a compact centered card composed from the existing `AuthShell`-free `Card` primitive (we can reuse the same styled container pattern from `CheckEmailPage` — extract into `SigningErrorCard` component at the page level, not a core component).
**Tests:** happy path → `replaceState` called + `navigate` called; missing token → `InvalidLinkState`; 401 → `BurnedLinkState`; StrictMode double-mount doesn't call `startSession` twice.

### Task 14 — `SigningPrepPage` (L4)
**Path:** `apps/web/src/pages/SigningPrepPage/`
**Chrome:** `RecipientHeader` + centered 560px column (match design).
**Body:** hero heading ("You've been asked to sign {title}"), sender chip, identity card (avatar + name + email from `useSigningSession().signer`, "Not me?" button → `decline` with reason "not-recipient"), Consumer Disclosure checkbox, primary "Start signing" button disabled until checkbox ticked → calls `acceptTerms()` if `tc_accepted_at === null`, then `navigate('/sign/{envelopeId}/fill')`, "Decline this request" link.
**Tests:** checkbox gates button; start click calls acceptTerms only when needed; decline link opens confirm dialog + calls `decline('declined-on-prep')`.

### Task 15 — `SigningFillPage` (L4)
**Path:** `apps/web/src/pages/SigningFillPage/`
**Chrome:** `RecipientHeader` (step: `{completedRequired} of {requiredCount} fields`) + sticky action bar (`ProgressBar` + "Next: {field.label}" CTA / "Review & finish" when `allRequiredFilled`).
**Body:** vertical stack of `PdfPageRenderer` (one per page), each containing absolutely-positioned `SignatureField` children for that page's fields. Field click behavior:
- `checkbox` → toggle in place via `fillField(id, { value_boolean: !current })`.
- `signature` / `initials` → open `SignatureCapture`; on Apply → `setSignature(id, result)`.
- `text` / `email` / `date` / `name` → open `FieldInputDrawer`; on Apply → `fillField(id, { value_text: v })`.
Scroll-into-view for the next field when "Next" is clicked.
Decline link in the header's overflow (fallback: bottom-left anchor).
**Tests:** mocks `useSigningSession`; clicking a text field opens drawer; Apply calls `fillField`; clicking signature opens capture; `Next` CTA focuses+scrolls next unfilled field; `Review & finish` becomes primary when all required filled → navigates to `/review`.

### Task 16 — `SigningReviewPage` (L4)
**Path:** `apps/web/src/pages/SigningReviewPage/`
**Body:** heading, helper copy, `ReviewList` with one entry per filled field (render signature via `SignatureMark`; checkbox as `✓ Checked`; text/date as string), legal notice ("By clicking Sign and submit…"), Back / Sign-and-submit buttons. On submit: `useSubmitMutation` → on success `navigate('/sign/{envelopeId}/done')`; on error surface inline banner.
**Tests:** renders filled fields only; Back navigates to `/fill`; Submit click → provider's `submit()` → navigate to `/done`; error path shows banner.

### Task 17 — `SigningDonePage` (L4)
**Path:** `apps/web/src/pages/SigningDonePage/`
**Logic:** reads `readDoneSnapshot(envelopeId)`; if missing (user deep-linked) → `<Navigate to="/sign/{envelopeId}" replace />`.
**Body:** success icon, "Sealed." heading, "Your signature has been recorded. We've sent a signed copy to {email}" copy, Download / Audit trail buttons (Download → `window.location.href = getPdfUrl()`? — no: cookie is cleared. Instead, show disabled button with tooltip "Check your email for the signed copy"). Upsell card ("Keep this signed copy in your Sealed library") with email input + "Save my copy" button → `navigate('/signup?email=' + encodeURIComponent(email))` (wire-up to `/signup` route is already live from the auth spec).
**Tests:** renders snapshot fields; no snapshot → redirects to `/sign/{id}`; Save my copy → navigate with `?email=`.

### Task 18 — `SigningDeclinedPage` (L4)
**Path:** `apps/web/src/pages/SigningDeclinedPage/`
**Logic:** reads `readDoneSnapshot` (must be kind `declined`).
**Body:** neutral icon, "You declined this request." heading, "We've let {sender} know. No further action needed." copy, "Take me out" → navigate to `/` (RootLanding handles from there).
**Tests:** renders; missing snapshot → redirect.

### Task 19 — Wire routes + error boundary + lazy loading
**Modify:** `apps/web/src/AppRoutes.tsx`.
**Create:** `apps/web/src/features/signing/SigningErrorBoundary.tsx`.
**Changes:**
- Import six signer pages via `React.lazy`:
  ```ts
  const SigningEntryPage = lazy(() => import('./pages/SigningEntryPage').then(m => ({ default: m.SigningEntryPage })));
  // ... repeat for all six
  ```
- Wrap all `/sign/*` routes inside a `<Route element={<SigningRouteRoot />}>` whose component is:
  ```tsx
  function SigningRouteRoot() {
    return (
      <SigningErrorBoundary>
        <Suspense fallback={<AuthLoadingScreen />}>
          <Outlet />
        </Suspense>
      </SigningErrorBoundary>
    );
  }
  ```
- `RequireSignerSession` wraps `/prep`, `/fill`, `/review`. `/entry`, `/done`, `/declined` do not.
- `SigningErrorBoundary` is a class component with `componentDidCatch` → renders `GenericErrorState` (centered card with "Something went wrong" + Reload button) + logs via `useSignerTelemetry`'s non-hook export.
**Tests:** route-integration tests using mocked `signApiClient`:
- `/sign/env-1?t=good` → entry-page flow succeeds, URL stripped, lands on `/prep`.
- `/sign/env-1` (no `?t`) → InvalidLinkState.
- `/sign/env-1/fill` without session → RequireSignerSession redirects to `/sign/env-1`.
- Submit path: `/sign/env-1/review` + click Submit → done page with snapshot copy.
- Decline path analogous.

### Task 20 — ESLint L2 zones + signer-isolation zone + `EmailCard` story
**Modify:** `apps/web/.eslintrc.cjs`.
**Zones added:**
1. Every new L2 component folder added to the existing `L1 target` array — so L1 primitives still cannot import L2.
2. New **signer isolation zone**:
  ```js
  {
    target: [
      './src/features/signing',
      './src/pages/SigningEntryPage',
      './src/pages/SigningPrepPage',
      './src/pages/SigningFillPage',
      './src/pages/SigningReviewPage',
      './src/pages/SigningDonePage',
      './src/pages/SigningDeclinedPage',
      './src/components/RecipientHeader',
      './src/components/DocumentPageCanvas',
      './src/components/SignatureField',
      './src/components/SignatureCapture',
      './src/components/FieldInputDrawer',
      './src/components/ReviewList',
    ],
    from: [
      './src/lib/supabase',
      './src/providers/AuthProvider',
      './src/providers/AppStateProvider',
      './src/features/contacts',
      './src/lib/api/apiClient',
    ],
    message: 'Signer-surface code must not depend on sender/Supabase modules — use signApiClient + features/signing only.',
  },
  ```
**EmailCard story:** add `SigningRequest` to `apps/web/src/components/EmailCard/EmailCard.stories.tsx` rendering the inbox preview from the design prototype.

### Task 21 — Final pass
- Run `pnpm --filter web test && lint --max-warnings=0 && typecheck && build && build-storybook`.
- Spec coverage review: walk the design doc's "User-facing flow" table section by section — every route has a page, every page renders its specified content, every error branch has a state.
- Run `pnpm --filter web build -- --mode production` with `rollup-plugin-visualizer` (add as devDep if not present, via a `--with-visualizer` env flag the vite config reads); commit the chunk report to `docs/bundle/2026-04-24-recipient-flow.html` so we can track bundle delta.
- Run the flow end-to-end against the staging backend:
  1. Locally `pnpm --filter api start:dev`.
  2. Create a test envelope + signer + token via the existing sender endpoints (script: `apps/api/test/scripts/create-test-envelope.sh` — if missing, write one that calls `/envelopes` + `/envelopes/:id/upload` + `/envelopes/:id/signers` + `/envelopes/:id/fields` + `/envelopes/:id/send`).
  3. Capture the signer link from the `outbound_emails` table / Mailpit.
  4. Open the link in the browser; walk through prep → fill → review → submit.
  5. Verify the backend `envelope.status` reaches `sealing` and a PAdES job is enqueued.
- Commit: `feat(web): recipient signing flow — end-to-end`.

