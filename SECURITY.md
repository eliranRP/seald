# Security Policy

If you believe you've found a security vulnerability in **Seald** — the
website, the API, the signing experience, or the cryptographic seal we
issue — please tell us. We treat security reports as the highest
priority interrupt.

## How to report

- **Email:** [security@seald.nromomentum.com](mailto:security@seald.nromomentum.com)
- **Subject line:** `Security report — <short title>`
- **Machine-readable contact:** [`/.well-known/security.txt`](https://seald.nromomentum.com/.well-known/security.txt) per RFC 9116
- **Full policy:** <https://seald.nromomentum.com/legal/responsible-disclosure>

Please **do not** open a public GitHub Issue or Pull Request for a
security finding. Use the private channel above and we will coordinate
disclosure with you.

## Response timelines (good-faith reports)

| Stage | Target |
|---|---|
| Acknowledgement | within 2 business days |
| Triage decision | within 10 business days |
| Status updates while open | every 14 days |
| Fix targets | Critical: 30 days · High: 60 days · Medium: 90 days · Low: best effort |
| Public disclosure | coordinated with the reporter; default 90 days from acknowledgement |

## Scope

In scope:

- `seald.nromomentum.com` (landing + SPA)
- `api.seald.nromomentum.com` (Seald API)
- The signing flow, audit trail, and Certificate of Completion
- Cryptographic correctness of PAdES-LT seals issued by the Service
- Authentication and account surfaces

Out of scope: third-party sub-processors (report upstream),
denial-of-service, social engineering, scanner-only output without a
working proof of concept, missing-header style findings without an
exploitable consequence. The full list lives in the
[Vulnerability Disclosure Policy](https://seald.nromomentum.com/legal/responsible-disclosure).

## Safe-harbor

If you act in good faith and follow the rules in our
[Vulnerability Disclosure Policy](https://seald.nromomentum.com/legal/responsible-disclosure),
Seald will not initiate or recommend a civil claim against you, and we
will treat your activities as authorized for the purposes of
18 U.S.C. § 1030 (CFAA), 17 U.S.C. § 1201 (DMCA anti-circumvention) for
technical measures protecting our systems, and applicable state
computer-misuse laws.

The safe-harbor extends only to Seald's own claims; it does not bind
third parties. If you are unsure whether your planned testing is in
scope, ask first — we'd rather discuss it.

## What to include in your report

- Description of the vulnerability and its impact
- Reproduction steps (use a test account; redact sensitive data)
- Any screenshots or proof of concept needed to confirm the issue
- Your preferred contact details and whether you'd like public credit

## What we ask you not to do

- Don't access, modify, or destroy data that isn't yours
- Don't exfiltrate personal data, document content, or signature material
- Don't run automated scanners against production without prior written approval
- Don't disclose the issue publicly until we've coordinated a fix

Thank you for helping keep Seald and its users safe.
