# Surface 1 — Settings → Integrations page

Route: `/settings/integrations`
Lives under: `AppShell` (mobile users redirected to `/m/send`)
SPA_PREFIXES update required: yes (`/settings/*`)

## Empty state (no accounts connected)

```
┌─────────────────────────────────────────────────────────────────────┐
│  [Seald]  Documents  Templates  Signers          ( ◯ Eliran ▾ )     │ ← NavBar
├──────────────┬──────────────────────────────────────────────────────┤
│              │                                                       │
│  Settings    │  Integrations                                         │
│  ────────    │  ──────────────────────────────────────────────────   │
│  ▸ Profile   │  Connect external services to import documents.       │
│  ▸ Team      │                                                       │
│  ▶ Integ-    │  ┌──────────────────────────────────────────────────┐ │
│    rations   │  │  ◐ Google Drive                                  │ │
│  ▸ Billing   │  │  Pick PDFs and Google Docs from Drive when       │ │
│              │  │  starting a new document or applying a template. │ │
│              │  │                                                  │ │
│              │  │  No accounts connected.                          │ │
│              │  │                                                  │ │
│              │  │  [ Connect Google Drive ]                        │ │
│              │  │                                                  │ │
│              │  │  Permissions: read-only access to files you      │ │
│              │  │  pick. Seald never reads your full Drive.        │ │
│              │  └──────────────────────────────────────────────────┘ │
│              │                                                       │
│              │  ┌──────────────────────────────────────────────────┐ │
│              │  │  ◯ Dropbox          (coming soon)                │ │
│              │  └──────────────────────────────────────────────────┘ │
│              │                                                       │
└──────────────┴──────────────────────────────────────────────────────┘
                                                          ← ShellFooter
```

**Primary CTA:** `[ Connect Google Drive ]` — opens OAuth consent in popup.
**Empty state:** "No accounts connected." block with the connect CTA.

---

## Connected state (1 account, multi-account flag OFF — v1 default)

```
┌──────────────────────────────────────────────────────────────────┐
│  ◐ Google Drive                                                  │
│  Pick PDFs and Google Docs from Drive...                         │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │ ● eliran@example.com                                       │  │
│  │   Connected May 3, 2026 · Last used May 3, 2026            │  │
│  │                                       [ Disconnect ]       │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                  │
│  (Add another account · coming soon)                             │
└──────────────────────────────────────────────────────────────────┘
```

When `feature.gdriveMultiAccount === false` (v1): the
"Add another account" link is muted/disabled with a "coming soon"
tooltip. The accounts list is still rendered as an array (always
plural shape) per Q1.

---

## Connected state (multi-account flag ON — future)

```
┌──────────────────────────────────────────────────────────────────┐
│  ◐ Google Drive                                                  │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │ ● eliran@example.com           Connected May 3   [ X ]     │  │
│  │ ● eliran@work.com              Connected May 4   [ X ]     │  │
│  │ ● eliran@side-project.com      Reconnect required ▲ [ ↻ ]  │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                  │
│  [ + Add another account ]                                       │
└──────────────────────────────────────────────────────────────────┘
```

---

## Disconnect confirmation modal

```
┌────────────────────────────────────────────────────────┐
│  Disconnect Google Drive?                       [ × ]  │
│  ──────────────────────────────────────────────────    │
│                                                        │
│  Documents you've already imported will keep working.  │
│  You won't be able to pick new files from Drive until  │
│  you reconnect.                                        │
│                                                        │
│  Account: eliran@example.com                           │
│                                                        │
│              [ Cancel ]   [ Disconnect ]               │
│                          ↑ destructive (red)           │
└────────────────────────────────────────────────────────┘
```

---

## Error states

### "Reconnect required" badge (token revoked or expired beyond 6mo)

Renders inside the account row (see multi-account state above).
Click `[ ↻ ]` → triggers OAuth re-consent in popup. Success → badge
flips to "Connected".

### Connect failed (popup blocked)

```
┌──────────────────────────────────────────────────────────────────┐
│  ⚠ Couldn't open the Google sign-in window.                      │
│  Allow popups for seald.nromomentum.com and try again.           │
│  [ Try again ]                                                   │
└──────────────────────────────────────────────────────────────────┘
```

### Connect declined (user cancelled OAuth)

```
┌──────────────────────────────────────────────────────────────────┐
│  Connection cancelled. You can try again whenever you're ready.  │
│  [ Connect Google Drive ]                                        │
└──────────────────────────────────────────────────────────────────┘
```

---

## Notes for Phase 3

- Re-use existing `<SettingsLayout>` (left rail + content area). If
  the rail doesn't exist yet, design it as a new shared component but
  mirror the spacing of the NavBar (24 px gutter, 14 px row gap).
- "Reconnect required" badge: red dot + bold text, matches the
  existing "needs attention" treatment from the Documents dashboard
  status pills.
- Disconnect modal: re-use the existing destructive-confirm modal
  (used for Delete account / Delete envelope). Don't introduce a new
  modal component.
