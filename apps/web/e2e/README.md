# Web e2e suite

Playwright + cucumber BDD tests for the seald SPA. Source layout:

```
e2e/
  features/        Gherkin .feature files (one per flow)
  steps/           Step definitions, one file per feature
  pages/           Page Object Models — accessible-role selectors
  fixtures/        Composed Playwright fixtures (timeline, mocks, seeds)
  signing-flow.spec.ts  Hand-written end-to-end probe (not BDD)
```

## Running locally

```sh
# Single run (auto-starts Vite dev server on 127.0.0.1:5173).
pnpm --filter web exec playwright test --project chromium-bdd

# UI mode for visual debugging.
pnpm --filter web e2e:ui

# A single scenario, repeated for stability checking.
pnpm --filter web exec playwright test --project chromium-bdd \
  --grep "Returning user signs in" --repeat-each=5 --workers=1
```

The Playwright config defines two projects:

- `chromium` — the hand-written `*.spec.ts` files under `e2e/`.
- `chromium-bdd` — the generated specs under `e2e/.bdd/` produced by
  `bddgen test` (run automatically before `playwright test`).

Generate the BDD specs ahead of time without running:

```sh
pnpm --filter web bdd:gen
```

## Adding a new scenario

1. Drop a new `.feature` under `e2e/features/`.
2. Implement matching steps in `e2e/steps/<name>.steps.ts`. Steps import
   from `../fixtures/test`, then `createBdd(test)` for `Given/When/Then`.
3. Selectors live in `e2e/pages/<Name>Page.ts` — use accessible roles
   (`getByRole('textbox', { name: /email/i })` etc.) per react-best-
   practices rule 4.6.
4. If the scenario needs a stubbed API, register the handler in the step
   via `mockedApi.on(method, urlPattern, response)`. Use `override()`
   when a per-scenario response should replace one a fixture installed.
5. Mark new scenarios `@smoke` or `@regression` so the CI gate filters
   them appropriately.

## Fixture composition

Steps receive these fixtures by destructuring the test arg:

| Fixture          | Provides                                                                                                                                                                                                                                    |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mockedApi`      | `MockedApi.on(...)` / `override(...)` / `reset()` — single `page.route()` interceptor for `/api/*`, `/sign/start \| me \| accept-terms \| fields \| signature \| submit \| decline \| pdf`, Supabase `*/auth/v1/*`, and `/pdf-fixture.pdf`. |
| `fixedNow`       | Freezes `Date.now()`, `new Date()`, and `performance.now()` to `2026-04-25T10:00:00Z` via `addInitScript`.                                                                                                                                  |
| `seededUser`     | `signInAs(user)` seeds a Supabase v2 session under the `sb-127-auth-token` storage key (derived from the test Supabase URL). Default user is `alice@example.com`.                                                                           |
| `signedEnvelope` | Pre-stubs every signing-API endpoint for a sealed envelope. Variants: `'happy' \| 'declined' \| 'expired' \| 'burned'`.                                                                                                                     |
| `<Name>Page`     | One Page Object per page, exposing accessible-role-based actions.                                                                                                                                                                           |

Composition order at runtime:

1. `page` (Playwright) — clean per-scenario context.
2. `fixedNow` — installs Date overrides via `addInitScript` so they land
   before any app code runs.
3. `mockedApi` — installs the `page.route()` interceptor.
4. `seededUser` (only when called) — writes Supabase session into
   `localStorage` via `addInitScript`.
5. `signedEnvelope` (only when called) — registers the signing mocks.
6. Page Objects — bare wrappers around `page`.

## Mock URL design

The `MockedApi` route filter is anchored on the **host** part of every URL
to avoid intercepting Vite's source-file requests like
`/src/lib/api/queryClient.ts` (which contains the substring `/api/`).

```
/^https?:\/\/[^/]+(\/api\/|\/sign\/(start|me|accept-terms|fields|signature|submit|decline|pdf)|\/auth\/v1\/|\/pdf-fixture\.pdf$)/
```

The `/sign/*` family is restricted to the actual signer-API endpoints —
**not** SPA route navigations like `GET /sign/<envelopeId>`.

## Debugging a failing scenario

1. Run with `--reporter=list` and look at the failing step.
2. Check `playwright-report/` for the HTML report (or `test-results/`
   for video + screenshot per failed test).
3. Add temporary instrumentation to the step:
   ```ts
   page.on('console', (m) => console.log('CONSOLE', m.type(), m.text()));
   page.on('response', async (r) => {
     if (r.status() >= 400) console.log('RESP', r.status(), r.url());
   });
   ```
   A 4xx response from the mock indicates a missing handler (the URL
   isn't on `MockedApi`'s registered list and falls through to the
   default 404).

## Currently quarantined scenarios

These remain `@fixme` because they require product changes, not test
changes:

| Feature                 | Reason                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sender-cancel.feature` | The product has **no in-flight envelope cancel**. `EnvelopeDetailPage` only exposes Withdraw for `draft` envelopes (see comment at line 305: "the backend currently supports `deleteDraft` but has no sent-envelope cancel"). The scenario asserts a feature that doesn't ship.                                                                                                                                                                      |
| `sender-create.feature` | The full sender flow (upload → analyze PDF → CreateSignatureRequestDialog → DocumentPage editor → drag signature field onto canvas → /envelopes API send) requires a real parseable PDF fixture and accurate drag-and-drop coordinates. The stub PDF `%PDF-1.4...` doesn't parse via pdf.js, so the editor canvas never reaches an interactive state. Needs a real PDF fixture committed to the repo OR a product hook to skip the editor for tests. |

Re-enable each by removing the `@fixme` tag once the underlying product
gap is closed.
