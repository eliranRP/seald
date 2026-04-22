# Sealed — Email templates

HTML-email safe (inline-styled, table-free but flex-minimal) templates for the two most common notifications. Render well in Gmail web/mobile and Apple Mail.

- `request.html` — "X requested your signature" with doc summary, CTA, plaintext fallback URL, trust/encryption callout.
- `completed.html` — "This document is sealed." — green seal, signer roll with timestamps, audit-trail link.

Both use inline `<style>` with web-safe fallbacks (Source Serif 4 / Inter / JetBrains Mono degrade to Georgia / system-ui / monospace).
