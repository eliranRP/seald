# Self-hosted fonts

The landing page references the following families from `globals.css` via
`@font-face`. To stay off the Google Fonts CDN (per design-guide rule and
to avoid third-party DNS / GDPR friction) the variable WOFF2 files must
live in this directory:

| File                            | Family         | Weight axis | License |
| ------------------------------- | -------------- | ----------- | ------- |
| `inter-variable.woff2`          | Inter          | 400–700     | OFL 1.1 |
| `source-serif-4-variable.woff2` | Source Serif 4 | 400–600     | OFL 1.1 |
| `caveat-variable.woff2`         | Caveat         | 500–700     | OFL 1.1 |
| `jetbrains-mono-variable.woff2` | JetBrains Mono | 400–500     | OFL 1.1 |

## Where to get them

Each family ships a variable WOFF2 from the upstream repos:

- Inter — https://github.com/rsms/inter/releases (file `Inter-roman.var.woff2`, rename)
- Source Serif 4 — https://github.com/adobe-fonts/source-serif/releases
  (file `SourceSerif4Variable-Roman.ttf.woff2`, rename)
- Caveat — https://github.com/googlefonts/caveat (build with `fontmake` or
  download `Caveat[wght].ttf` and convert via `pyftsubset`)
- JetBrains Mono — https://github.com/JetBrains/JetBrainsMono/releases
  (file `JetBrainsMono[wght].ttf`, convert to WOFF2)

If a family is missing at build time the page will fall back to the
system stack defined in `--font-sans` / `--font-serif` / `--font-mono`
in `src/styles/globals.css`. The page renders correctly without the
custom fonts; you'll just lose the editorial feel.
