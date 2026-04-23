---
name: sealed-design
description: Use this skill to generate well-branded interfaces and assets for Sealed, a digital document-signing product, either for production or throwaway prototypes/mocks/etc. Contains essential design guidelines, colors, type, fonts, assets, and UI kit components for prototyping.
user-invocable: true
---

Read the README.md file within this skill, and explore the other available files.

If creating visual artifacts (slides, mocks, throwaway prototypes, etc), copy assets out and create static HTML files for the user to view. If working on production code, you can copy assets and read the rules here to become an expert in designing with this brand.

If the user invokes this skill without any other guidance, ask them what they want to build or design, ask some questions, and act as an expert designer who outputs HTML artifacts _or_ production code, depending on the need.

## Quick orientation
- **Tokens** live in `colors_and_type.css`. Import it and apply `.sealed` to a root element, or just consume the CSS variables.
- **Logo & iconography** live in `assets/`. Use Lucide for icons (loaded from CDN).
- **UI kits** are in `ui_kits/` — `signing_app/` (2 layout variations), `dashboard/`, `mobile_app/`, `email/`. Each has an `index.html` demonstrating the assembled UI and JSX components for reuse.
- **Preview cards** in `preview/` are small specimens registered with the Design System tab — good reference for what each token looks like.

## Non-negotiables
- Serif (Source Serif 4) for H1/H2 and hero; sans (Inter) for UI and body.
- **No emoji anywhere.** No gradients except the subtle paper wash. No bouncy animations.
- Sentence case on all UI copy. No trailing periods on buttons.
- The one visual flourish: a script underline moment using Caveat font. Use once per surface, max.
- Borders do the work of shadows. Default card = border + no shadow.
