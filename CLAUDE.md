# CLAUDE.md — repo conventions for AI assistants

This file is the contract between the working repo and any AI assistant
(Claude Code, etc.) editing it. Human contributors are welcome to read and
ignore the AI-specific sections.

## Branch + push conventions

- Default branch: **`main`**. Day-to-day commits go directly to `main`.
- The repo also has a `develop` branch, but it has fallen behind — treat
  `main` as the source of truth.
- Direct push to `main` is allowed for committers; CI is the gate.

## CI gates (`.github/workflows/ci.yml`)

Every push to `main` (and every PR) runs five jobs:

| Job | What it runs |
|---|---|
| `install` | `pnpm install --frozen-lockfile` |
| `lint` | `pnpm -r typecheck` + `pnpm -r lint` |
| `unit` | `pnpm --filter api test` (jest) |
| `web` | `pnpm --filter web test` (vitest) |
| `e2e` | `pnpm --filter api test:e2e` (jest e2e, includes PAdES) |

Doc-only changes (`**/*.md`, `docs/**`, `Design-Guide/**`, LICENSE,
.gitignore, .editorconfig) skip CI via `paths-ignore`.

Every push is followed by an automated CI validator (see "Standing rules
for AI assistants" below). Local pre-merge gate:

```sh
pnpm -r typecheck && pnpm -r lint && pnpm --filter api test && pnpm --filter web test
```

## Code conventions

### React + TypeScript
The [`react-best-practices` skill](~/.claude/skills/react-best-practices/SKILL.md)
distills the canonical sources (Vercel, react.dev, TS handbook, Packt patterns,
bulletproof-react, FSD) into numbered rules (1.1–4.6). Every commit touching
React/TS should respect them, especially:

- **1.6** Path alias `@/*` → `apps/web/src/*` over deep relative imports.
- **2.4** `useMemo`/`useCallback` only with a measured perf problem.
- **2.5** `Suspense` + ErrorBoundary around lazy/async data.
- **3.1** Strict tsconfig: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`.
- **3.2** No `any`, no `Function` — `unknown` + narrowing instead.
- **4.3** No array index as `key` for reorderable lists.
- **4.4** One responsibility per `useEffect`.
- **4.6** Tests query by accessible role/name; testid only as last resort.

### Email HTML
The [`gmail-email-html` skill](~/.claude/skills/gmail-email-html/SKILL.md)
covers Gmail/Outlook quirks. Inline visual styles, defeat the auto-linker,
preview every change in real Gmail before committing.

### Commit messages
Follow conventional commits: `type(scope): subject` (e.g.
`fix(audit): refined event icons`, `refactor(api): tighten TS hygiene`).
Body should explain *why* and reference the rule id when the change is
skill-driven (e.g. `(rule 4.4)`).

## Standing rules for AI assistants

These are persisted as memory under
`~/.claude/projects/-Users-eliranazulay-Documents-projects-seald/memory/`
and apply to every session.

### Always validate CI after every push (in background)

After every `git push`, spawn a `general-purpose` subagent with
`run_in_background: true` to:
1. List GH Actions runs for the new HEAD.
2. Wait for each to reach `completed`.
3. If any fail, fetch `gh run view <id> --log-failed`, fix the root cause,
   commit, re-push, re-validate. Max 3 iterations.

Do NOT block the main thread waiting for CI. The harness delivers the
validator's completion notification automatically.

### Never amend / never `--no-verify` / never `--force`

If a pre-commit hook fails: fix the underlying issue, re-stage, create a
NEW commit. Don't bypass.

### Phase 3 deferrals

All five MVP deferrals were resolved on 2026-04-24. See
`memory/project_phase3_mvp_deferrals.md` before touching PAdES/TSA/
migrations/Terraform.

## Repo layout

```
apps/
  api/      Nest.js API (jest)
  web/      React + Vite + Vitest SPA
packages/
  shared/   Cross-package types and helpers
deploy/
  Caddyfile, terraform/, docker-compose.yml
.github/workflows/
  ci.yml, deploy.yml, deploy-web.yml, docker.yml, terraform.yml
```

Path alias `@/*` applies to `apps/web/src/*` only (configured in
`apps/web/tsconfig.json` + `apps/web/vite.config.ts`).
