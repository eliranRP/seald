# Supabase cut-over: what the operator provides

The code for running Seald on Supabase Edge Functions is on `main`
(docs/supabase-native-architecture.md, runbook in
[`self-hosting.md`](self-hosting.md#supabase-edge-functions-no-server)).
What is left needs secrets and accounts that only the owner holds. This page
lists each one: where it goes, and how to get it.

**Never paste a secret into a chat, an issue or a commit.** Put each value
straight into GitHub, Supabase or Cloudflare. Once a section is done,
reply "done: section N". No value is needed in the reply.

Project: `seald`, ref `hsjlihhcwvjvybpszjsa`, region `eu-central-1`.

## 1. GitHub repository secrets (needed first)

Set them under Settings → Secrets and variables → Actions → New repository
secret, on `eliranRP/seald`. The `Deploy (Supabase Edge Functions)` workflow
reads them. With these three in place, the deploy, the migrations and the
`/health` check can run without you.

| Secret                  | Value                                                                           | Where to get it                                                                            |
| ----------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `SUPABASE_ACCESS_TOKEN` | `sbp_...`                                                                       | supabase.com → Account → Access Tokens → Generate new token. Name it `seald-deploy`.       |
| `SUPABASE_PROJECT_REF`  | `hsjlihhcwvjvybpszjsa`                                                          | Not a secret, but the workflow reads it from secrets.                                      |
| `SUPABASE_DB_URL`       | `postgresql://postgres.hsjlihhcwvjvybpszjsa:<db password>@<host>:5432/postgres` | Dashboard → Connect → **Session pooler** (port 5432). Migrations and backups use this one. |

For the nightly encrypted backup (optional, but Supabase Free has no
backups of its own):

| Secret                      | Value                                      | Where to get it                                                                                                                                  |
| --------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `BACKUP_AGE_RECIPIENT`      | `age1...`                                  | Run `age-keygen -o seald-backup.key` on your machine. Keep the key file offline: it is the only way to read a backup. The public key is printed. |
| `SUPABASE_URL`              | `https://hsjlihhcwvjvybpszjsa.supabase.co` | Adds the `envelopes` bucket to the backup.                                                                                                       |
| `SUPABASE_SERVICE_ROLE_KEY` | `sb_secret_...`                            | Dashboard → Project Settings → API Keys → Secret keys.                                                                                           |

## 2. A new signing key (P12)

Production seals with an AWS KMS key today. That key cannot leave KMS, so
the Edge Functions sign with a new key held in their secrets (aws-exit-plan
WS-2). Envelopes that are already sealed stay valid: each one embeds its own
certificate and timestamps.

Generate the key on your machine, not on a server, and keep a copy offline.
Replace the subject with your legal entity:

```sh
openssl req -x509 -newkey rsa:3072 -sha256 -days 3650 -nodes \
  -keyout seald-seal.key -out seald-seal.crt \
  -subj "/C=US/O=<legal entity>/CN=Seald document sealing"
openssl pkcs12 -export -inkey seald-seal.key -in seald-seal.crt \
  -name seald-seal -out seald-seal.p12 -passout pass:<P12 password>
base64 -w0 seald-seal.p12 > seald-seal.p12.b64   # macOS: base64 -i seald-seal.p12 -o seald-seal.p12.b64
```

`seald-seal.p12.b64` and the password go into section 3.

Trade-off: the key no longer sits in a non-extractable HSM. Anyone with
owner access to the Supabase project can read it.

## 3. Edge Function secrets

Set them in Dashboard → Edge Functions → Secrets, or from your machine:
`supabase secrets set --project-ref hsjlihhcwvjvybpszjsa --env-file seald.env`.
Delete `seald.env` afterwards.

Supabase sets `SUPABASE_URL` itself and refuses names that start with
`SUPABASE_`. It also injects `SUPABASE_SERVICE_ROLE_KEY` as the legacy
JWT, which stops working once the project's legacy keys are disabled (they
are here). So the secret key goes in as `SEALD_SERVICE_ROLE_KEY`.

**Copy unchanged from the current production env.** That is the AWS
Secrets Manager secret named by `SEALD_API_SECRET_ID`, or the `.env` on the
EC2 host. Copy every key the API uses today, in particular:

- `NODE_ENV=production`, `CORS_ORIGIN`, `APP_PUBLIC_URL`, `API_PUBLIC_URL`
- `SIGNER_SESSION_SECRET`, `CRON_SECRET`, `SIGNER_OTP_KEY`, `APPROVAL_CSRF_KEY`
- `AUTOMATION_SECRETS_KEY`. It must be the same value: a new one makes the
  stored webhook secrets unreadable.
- `EMAIL_PROVIDER`, `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `EMAIL_FROM_*`,
  `EMAIL_LEGAL_*`, `EMAIL_PROVIDER_DAILY_QUOTA`, `EMAIL_PROVIDER_MONTHLY_QUOTA`
- `PDF_SIGNING_TSA_URLS`
- `GDRIVE_OAUTH_CLIENT_ID`, `GDRIVE_OAUTH_CLIENT_SECRET`,
  `GDRIVE_OAUTH_REDIRECT_URI`, `GDRIVE_PICKER_DEVELOPER_KEY`,
  `GDRIVE_PICKER_APP_ID`
- `MCP_OAUTH_*`, `STORAGE_BUCKET`, `TC_VERSION`, `PRIVACY_VERSION`, and
  anything else set there today

**Set to new values:**

| Secret                         | Value                                                                                    |
| ------------------------------ | ---------------------------------------------------------------------------------------- |
| `DATABASE_URL`                 | Dashboard → Connect → **Transaction pooler** (port **6543**), with the database password |
| `SEALD_SERVICE_ROLE_KEY`       | The `sb_secret_...` key (Project Settings → API Keys → Secret keys)                      |
| `WORKER_ENABLED`               | `false` (pg_cron drives the work)                                                        |
| `PDF_SIGNING_PROVIDER`         | `local`                                                                                  |
| `PDF_SIGNING_LOCAL_P12_BASE64` | The contents of `seald-seal.p12.b64` (section 2)                                         |
| `PDF_SIGNING_LOCAL_P12_PASS`   | The P12 password (section 2)                                                             |
| `GDRIVE_TOKEN_WRAP_KEY`        | `openssl rand -hex 32`. Keep a copy offline: it decrypts the stored Drive tokens.        |
| `EDGE_PROXY_SECRET`            | `openssl rand -hex 32`. The same value goes on Cloudflare (section 4).                   |

**Leave out:** `PDF_SIGNING_KMS_*`, `GDRIVE_TOKEN_KMS_*`, `AWS_*`,
`SEALD_API_SECRET_ID`, `PDF_SIGNING_LOCAL_P12_PATH`, `PORT`.

## 4. Cloudflare Pages (`seald-landing` project)

Set these under Settings → Variables and Secrets → Production. Until all
three exist, the worker leaves the API host alone.

| Name                | Type     | Value                                                   |
| ------------------- | -------- | ------------------------------------------------------- |
| `API_HOSTNAME`      | variable | `api.seald.nromomentum.com`                             |
| `API_PROXY_ORIGIN`  | variable | `https://hsjlihhcwvjvybpszjsa.supabase.co/functions/v1` |
| `EDGE_PROXY_SECRET` | secret   | The same value as in section 3                          |

Do not move DNS yet. That is the last step, and I will tell you when.

## 5. Drive token re-wrap (once, before AWS is shut down)

Stored Google Drive refresh tokens are wrapped with the AWS KMS key. Run this
on a machine that still has the AWS credentials (the EC2 host works), with
`GDRIVE_TOKEN_WRAP_KEY` from section 3:

```sh
DATABASE_URL=<session pooler URL> GDRIVE_TOKEN_WRAP_KEY=<section 3> \
GDRIVE_TOKEN_KMS_KEY_ARN=<current> GDRIVE_TOKEN_KMS_REGION=<current> \
  pnpm --filter api exec ts-node scripts/rewrap-gdrive-tokens.ts           # dry run
# when it reports failed: [] ...
  pnpm --filter api exec ts-node scripts/rewrap-gdrive-tokens.ts --apply
```

If this is skipped, users with Drive connected have to reconnect Drive once
AWS is gone.

## What happens after each section

| Done      | What I do next, without further input                                                                                                                       |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1         | Enable `pg_cron` and `pg_net`, apply the migrations, run the deploy workflow, and measure the real bridge cold start and seal steps on the hosted platform. |
| 1 + 3     | Smoke test on the raw function URL: sign in, send, sign, seal, `verify-pades`, `/verify` shows `chain_intact`.                                              |
| 1 + 3 + 4 | Test the API host through the Pages worker. Prepare the Vault secret and the schedules (`seald_install_edge_schedules`).                                    |
| All + 5   | Hand you a 3-step switch: stop the EC2 workers, install the schedules, point `api.` DNS at Pages. Rollback stays one SQL call and one DNS change.           |

After 48 quiet hours on Supabase, the AWS resources can go: EC2, the
elastic IP, Secrets Manager, and both KMS keys (30-day deletion window).
