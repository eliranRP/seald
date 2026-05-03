# Google Drive integration — wireframes (Phase 2)

Low-fi ASCII wireframes for every new surface. Phase 3 will translate
each of these into pixel-true HTML mockups under
`Design-Guide/project/gdrive-integration/<surface>.html`.

Conventions used:
- `[ ... ]` = button (primary if labelled e.g. `[ Connect Google Drive ]`)
- `[ ... ]?` = optional / conditional button
- `( · )` = radio
- `[ x ]` = checkbox
- `< ... >` = link
- `▾` = dropdown affordance
- `┃` = visual divider rail
- Frames drawn at ~1440px reference width unless noted

The 5 surfaces (matches the Phase 1 manager checklist):

1. [`01-settings-integrations.md`](./01-settings-integrations.md) —
   `/settings/integrations` page (account list + connect button)
2. [`02-drive-picker-modal.md`](./02-drive-picker-modal.md) —
   Drive picker modal (folder nav + file list + filter + 4 named
   error states)
3. [`03-new-document-flow.md`](./03-new-document-flow.md) —
   Picker integration in `/document/new`
4. [`04-use-template-flow.md`](./04-use-template-flow.md) —
   Picker integration in `/templates/:id/use`
5. [`05-conversion-progress-and-errors.md`](./05-conversion-progress-and-errors.md) —
   Conversion progress + the 4 named error states
   (token-expired, no-files-match-filter, conversion-failed,
   oauth-declined)

All surfaces are **desktop-only**. Mobile users hit the AppShell
`/m/send` redirect before reaching any of them — this satisfies the
Phase 1 mobile contract (no new mobile surfaces in v1).
