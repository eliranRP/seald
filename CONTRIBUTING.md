# Contributing to Seald

Thanks for contributing. This document is the short, concrete onboarding guide
for the Phase-1 component library. Everything below reflects what is actually
configured in this repo today.

## Prerequisites

- Node **>=20** (see `engines.node` in `package.json`)
- pnpm **>=9** — the repo pins `pnpm@9.12.0` via the `packageManager` field in
  `package.json`; Corepack will pick it up automatically.
- Git (hooks are managed by Husky).

## Setup

```bash
pnpm install
```

The `prepare` script wires up Husky on install.

## Development commands

All scripts live in `package.json`. The important ones:

| Command                | What it does                                                         |
| ---------------------- | -------------------------------------------------------------------- |
| `pnpm dev`             | Run the Vite dev server against `index.html` / `src/main.tsx`.       |
| `pnpm storybook`       | Run Storybook on port 6006 for component development and docs.       |
| `pnpm build-storybook` | Produce a static Storybook build in `storybook-static/`.             |
| `pnpm typecheck`       | Run `tsc --noEmit` against `tsconfig.json` and `tsconfig.node.json`. |
| `pnpm lint`            | Run ESLint across the repo with `--max-warnings=0`.                  |
| `pnpm lint:fix`        | Same as `lint` with `--fix`.                                         |
| `pnpm format`          | Run Prettier on the whole repo.                                      |
| `pnpm test`            | Run the vitest suite once (jsdom environment).                       |
| `pnpm test:watch`      | Run vitest in watch mode.                                            |
| `pnpm build`           | Typecheck both tsconfigs, then `vite build`.                         |
| `pnpm preview`         | Preview the production build.                                        |

## Project layers

The library is organised into strict layers. A component in `Ln` may import
from `L0..Ln`, same-layer siblings, and the shared utilities in `src/lib/**`,
`src/types/**`, and `src/test/**`. **Lower layers must not import from higher
layers.**

| Layer | Purpose    | Paths                                                                        |
| ----- | ---------- | ---------------------------------------------------------------------------- |
| L0    | tokens     | `src/styles/**`                                                              |
| L1    | primitives | `src/components/{Badge,Button,Avatar,Icon,TextField,DocThumb,SignatureMark}` |
| L2    | domain     | `src/components/{StatusBadge,SignatureField,SignerRow}`                      |
| L3    | widgets    | `src/components/{SignaturePad}`                                              |
| L4    | providers  | (none yet)                                                                   |

Full description: [`docs/layers.md`](docs/layers.md). Enforcement is automated
via the `import/no-restricted-paths` rule in `.eslintrc.cjs`; violations fail
`pnpm lint`.

## Component folder convention

Every component lives in its own folder under `src/components/<Name>/` with
these files (see `src/components/StatusBadge/` for a canonical example):

- `<Name>.tsx` — component implementation; exports the component.
- `<Name>.types.ts` — the `Props` interface and any exported tone / variant
  string-literal unions, all with `readonly` fields.
- `<Name>.styles.ts` — `styled-components` definitions. Read tokens from the
  theme; **no hex literals** (enforced by `no-restricted-syntax` in the
  `*.styles.ts` override).
- `<Name>.test.tsx` — vitest + Testing Library, rendering via the
  `renderWithTheme` helper.
- `<Name>.stories.tsx` — Storybook stories (see below for title conventions).
- `index.ts` — barrel that re-exports the component and its prop types.

## Code style (non-negotiables)

These are enforced by `tsconfig.json` and `.eslintrc.cjs`; reviewers do not
make exceptions.

- **TypeScript strict mode** — `strict`, `noUncheckedIndexedAccess`,
  `exactOptionalPropertyTypes`, `noImplicitOverride`,
  `noFallthroughCasesInSwitch`, `noUnusedLocals`, `noUnusedParameters` are all
  on. Because `exactOptionalPropertyTypes` is on, write genuinely-optional
  props as `prop?: T | undefined` rather than `prop?: T`.
- **`readonly` on every prop** in `*.types.ts` files.
- **`forwardRef` arrow form + explicit `displayName`** for any component that
  needs a ref. Example: `export const Badge = forwardRef<…>((…)=>…);` then
  `Badge.displayName = 'Badge';`.
- **Do not use `FC` / `VFC` / `FunctionComponent`** (including the `React.`
  qualified forms) — declare props explicitly on the function signature.
  Enforced by `no-restricted-syntax`.
- **Spread `{...rest}` BEFORE component-owned attributes** (e.g. a11y
  attributes, `data-*`) so the component's own wiring wins.
- **Named exports only** — `import/no-default-export` is `error` (with a
  narrow override for `*.test.*`, `*.stories.*`, `vite.config.ts`, and
  `.storybook/main.ts`).
- **`import type` for types** — `@typescript-eslint/consistent-type-imports`
  is `error`.
- **No `eslint-disable` comments.** No non-null assertions (`!`). No
  `as unknown as`. No nested ternaries. No hex colors in `*.styles.ts` (the
  config bans both `#abc` literals and hex in template strings).
- **Function-component declaration style** — named components must be
  function declarations; unnamed (inline) components must be arrow functions
  (`react/function-component-definition`).
- **`styled-components` transient `$props`** — prop names consumed only by
  styling must start with `$` (e.g. `$tone`, `$size`) so they are not
  forwarded to the DOM.
- **Theme tokens only.** Read from the theme defined in `src/styles/theme.ts`:
  `theme.space[N]`, `theme.radius.{xs,sm,md,lg,xl,'2xl',pill}`,
  `theme.color.ink[900]`, `theme.color.fg[1..4]`, `theme.color.bg.surface`,
  `theme.color.border.{1,2,focus}`, `theme.shadow.*`, `theme.motion.*`,
  `theme.font.*`, `theme.z.*`.

## Testing

- Runner: **vitest** in `jsdom` (`"environment": "jsdom"` via the test types
  wired in `tsconfig.json`, with setup in `src/test/setup.ts`).
- Library: **@testing-library/react** + **@testing-library/jest-dom** +
  **@testing-library/user-event**.
- Always render with the theme via `renderWithTheme` from
  `src/test/renderWithTheme.tsx` so `styled-components` receives the theme.
- Accessibility assertions use **vitest-axe** (typed via
  `src/test/vitest-axe.d.ts`).
- Run a single test file:

  ```bash
  pnpm test -- src/components/StatusBadge/StatusBadge.test.tsx
  ```

- Run in watch mode while iterating:

  ```bash
  pnpm test:watch
  ```

## Storybook

- Each component has a `<Name>.stories.tsx`.
- Titles are prefixed by layer: `L1/<Name>` for primitives, `L2/<Name>` for
  domain components, `L3/<Name>` for widgets (see
  `src/components/*/*.stories.tsx`).
- Tags include `autodocs` and the matching layer tag:
  `tags: ['autodocs', 'layer-1' | 'layer-2' | 'layer-3']`.
- Stories import from the component's folder, not from sibling layers, so
  they do not leak cross-layer dependencies.

## Commit convention

Use **Conventional Commits**. Common prefixes in this repo: `feat:`, `fix:`,
`chore:`, `docs:`, `refactor:`, `test:`, `style:`. Keep each commit focused
on one logical change; prefer multiple small commits over one large one.

Husky runs a pre-commit hook (`.husky/pre-commit`) that executes
`pnpm exec lint-staged` (ESLint + Prettier on staged files, per
`.lintstagedrc.json`) followed by `pnpm exec tsc --noEmit`. Do not bypass
these hooks.

## Pull request checklist

Before opening a PR, confirm:

- [ ] `pnpm typecheck` is clean.
- [ ] `pnpm lint` is clean (we run with `--max-warnings=0`).
- [ ] `pnpm test` is green.
- [ ] No higher-layer imports — your changes still satisfy
      `import/no-restricted-paths`.
- [ ] Every new or changed component has an updated `*.test.tsx` and a
      Storybook story in the correct `L*/<Name>` namespace with the matching
      `layer-N` tag.
- [ ] Accessibility checks (`vitest-axe`) cover new interactive surfaces.
- [ ] No `eslint-disable`, no hex literals in `*.styles.ts`, no non-null `!`,
      no `as unknown as`, no nested ternaries.
- [ ] Theme tokens are used for every color / space / radius / shadow value.
