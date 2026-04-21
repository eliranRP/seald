# Layer boundaries

The Seald component library is organised into strict layers. A component in
layer `Ln` may only import from layers `L0..Ln` plus same-layer siblings and
the shared utilities (`src/lib/**`, `src/types/**`, `src/test/**`). Imports
from higher layers are forbidden.

| Layer | Purpose    | Paths                                                                        |
| ----- | ---------- | ---------------------------------------------------------------------------- |
| L0    | tokens     | `src/styles/**`                                                              |
| L1    | primitives | `src/components/{Badge,Button,Avatar,Icon,TextField,DocThumb,SignatureMark}` |
| L2    | domain     | `src/components/{StatusBadge,SignatureField,SignerRow}`                      |
| L3    | widgets    | `src/components/{SignaturePad}`                                              |
| L4    | providers  | (none yet)                                                                   |

Enforcement is automated in ESLint via the `import/no-restricted-paths` rule;
see the `rules['import/no-restricted-paths']` block in `.eslintrc.cjs`. A
violation is reported as a lint error by `pnpm lint`.
