# Sealed — Email templates

Branded HTML email templates for every transactional mail Sealed sends, matching the folder structure in `apps/api/src/email/templates/`:

| Template | Recipient | Accent | Purpose |
|---|---|---|---|
| `invite.html` | signer | indigo | Entry point — "please sign this" |
| `reminder.html` | signer | amber | Still waiting on signature |
| `completed.html` | all parties | success | Fully executed — signed PDF + audit trail |
| `declined_to_sender.html` | sender | danger | Signer declined with reason |
| `expired_to_sender.html` | sender | slate | Envelope expired without completion |
| `expired_to_signer.html` | signer | slate | Signing link expired |
| `withdrawn_to_signer.html` | signer | slate | Sender withdrew before signing |
| `withdrawn_after_sign.html` | signer | amber | Withdrawn after they already signed |

## Design system

- Single shared stylesheet: `_email.css` (inline it into each template in production — most mail clients strip `<link>` tags). All 8 templates here use `<style>` blocks with the same CSS so they render identically whether inlined or not.
- **Masthead:** indigo 28px mark + serif wordmark. Same on every template.
- **Accent bar:** 4px stripe at the top, colored by status. The first visual signal of what this email is about.
- **Kicker tag:** small uppercase monospace label above the H1 (e.g. `SIGNATURE REQUESTED`, `REMINDER · STILL WAITING`).
- **H1:** Source Serif Light, document title italicized where it appears in the headline.
- **Doc card:** a miniature PDF thumbnail + title + doc id. Consistent across all templates that reference an envelope.
- **Signer list:** used in `reminder`, `completed`, `expired_to_sender`. Each row = avatar (initials, colored by status) + name/email + status pill.
- **Callouts:** 4 variants (indigo trust / amber warning / danger / slate neutral) with inline SVG icons, no icon fonts.
- **Timeline:** event log with color-coded dots. Used in `completed` and `withdrawn_after_sign`.
- **Verification block:** every template ends with a reference code + verification URL so any recipient can independently verify the envelope at any time.

## Index

Open `index.html` to see all 8 templates side-by-side in one scrollable grid.

## Variables

Each template uses these placeholders (hard-coded as a test envelope today — swap for your templating engine):

```
{docTitle}     → "SEED test envelope"
{docId}        → "DOC-8F3A-4291 · 4 pages"
{sender}       → "Eliran Azulay"
{senderEmail}  → "sender@seald.dev"
{signer}       → "Maya Raskin"
{signerEmail}  → "maya@northwind.co"
{signUrl}      → unique per-signer signing link
{verifyCode}   → short verification code
{verifyUrl}    → public verification URL
```
