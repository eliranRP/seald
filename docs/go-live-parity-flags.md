# Go live: parity features (PR #380 + #382)

What you need to set, where, and in what order, so that turning on the 13
parity feature flags (PR #382) does not take the API down.

## 0. Where production stands today

- **PR #380 is merged but not live.** The production deploy for it
  (`Deploy`, run 39972802549, 2026-10-23 14:48 UTC) failed with
  `ENOSPC: no space left on device` while building the image on the EC2
  host. The host kept the old container, so production still runs the code
  from 2026-09-30 (`bff9c66`).
- **Each production setting comes from one of two places:**
  - **Host file** `/opt/seald/apps/api/.env` on the EC2 box. This is the
    compose `env_file`, and a value here wins.
  - **AWS Secrets Manager** secret `seald-api-prod` (us-east-2). The
    container fetches it at boot and fills in any key the host file does
    not set.

  The GitHub secret `PROD_API_ENV` is a backup copy of the whole `.env`.
  `prod-restore.yml` writes it back onto the host, and
  `seed-secrets-manager.yml` copies its sensitive keys into Secrets
  Manager.

- **Two deploys run on every merge to `main`:**
  - `Deploy` (`deploy.yml`) rebuilds and restarts the API over SSH.
  - `Deploy (Cloudflare Pages …)` ships the web app.

  The flags are compiled into both, so merging #382 turns them on as soon
  as both deploys finish.

## 1. Free disk space on the EC2 host

Without this step every deploy fails the same way.

```sh
ssh <DEPLOY_SSH_USER>@<DEPLOY_SSH_HOST>
df -h / /opt                    # confirm the disk is full
sudo docker system df           # see what docker is using
sudo docker builder prune -af   # old build cache, usually the biggest
sudo docker image prune -af     # images no running container uses
df -h /                         # aim for at least 5 GB free
```

These commands do not touch the running containers or their volumes.

Next, re-run the deploy so PR #380 goes live with the flags still **off**:

1. GitHub → Actions → **Deploy** → **Run workflow**, with `ref` = `main`.
2. Wait for it to pass. It ends with `/health OK`.

This proves the host builds and boots before anything else changes.

> If the deploy fails on `PDF_SIGNING_PROVIDER is not set`, see step 2c.
> PR #380 removed the old `local` default, so production must now set the
> provider explicitly.

## 2. Settings to add before merging #382

### 2a. Required: without these the API refuses to start

| Variable                 | Needed by                | Value                                                         |
| ------------------------ | ------------------------ | ------------------------------------------------------------- |
| `SIGNER_OTP_KEY`         | `signerAccessAuth`       | 32+ characters. Use `openssl rand -hex 32`.                   |
| `APPROVAL_CSRF_KEY`      | `mcpServer`, `publicApi` | 32+ characters. Use `openssl rand -hex 32`.                   |
| `AUTOMATION_SECRETS_KEY` | `workflowAutomations`    | Exactly 32 bytes: `openssl rand -hex 32` (64 hex characters). |

Run `openssl rand -hex 32` three times and use a different value for each
key. Save all three in your password manager.

- **`AUTOMATION_SECRETS_KEY` must never change.** It encrypts the stored
  webhook secrets, and a new key makes every saved webhook unreadable.
- **The other two can be rotated.** Changing `SIGNER_OTP_KEY` only
  invalidates access codes already emailed. Changing `APPROVAL_CSRF_KEY`
  only makes an open Approve page reload.

### 2b. Recommended

| Variable            | Why                                                                                                                                                                                                                | Example                                                                                         |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| `MCP_OAUTH_CLIENTS` | Lets the Claude and ChatGPT connectors sign in through OAuth as known apps. Without it, only clients that publish an https client ID metadata document can connect, and the consent page labels them "unverified". | `[{"client_id":"<id>","client_name":"Claude","redirect_uris":["<callback URL from the app>"]}]` |
| `API_PUBLIC_URL`    | Public API origin, used in email links and as the OAuth issuer. Unset, it is derived from `APP_PUBLIC_URL`.                                                                                                        | `https://api.seald.nromomentum.com`                                                             |

`MCP_OAUTH_CLIENTS` notes:

- Write it on a single line with no spaces.
- Take the `client_id` and each `redirect_uri` from the app's own connector
  registration page, and copy them exactly.
- Redirect URIs must be https, or loopback for local testing.
- Malformed JSON stops the API from starting, so check it with
  `echo '<value>' | jq .` first.

### 2c. Sealing: confirm it is already set

On the host, run this. It prints key names only, never values:

```sh
sudo grep -oE '^PDF_SIGNING_[A-Z_]+=' /opt/seald/apps/api/.env
```

Production should already have these four:

- `PDF_SIGNING_PROVIDER=kms`
- `PDF_SIGNING_KMS_KEY_ID`
- `PDF_SIGNING_KMS_REGION`
- `PDF_SIGNING_KMS_CERT_PEM_PATH`, which points at `/opt/seald/secrets/…`

If `PDF_SIGNING_PROVIDER` is missing, add `PDF_SIGNING_PROVIDER=kms`.
`PDF_SIGNING_ALLOW_NOOP=true` is for staging only.

Also check that `PDF_SIGNING_TSA_URLS` points at a real timestamp
authority. Without one, seals stop at PAdES-B-B and there is no B-LTA
archive timestamp.

### 2d. Optional tuning

All of these have safe defaults:

- `EMAIL_PROVIDER_DAILY_QUOTA` (default 100) and
  `EMAIL_PROVIDER_MONTHLY_QUOTA` (default 3000). Set them to your Resend
  plan's limits.
- `BULK_SEND_ROWS_PER_MINUTE` (default 30, maximum 600).
- `MCP_OAUTH_ISSUER`, which defaults to the API origin.
- `MCP_OAUTH_VERIFIED_CIMD_HOSTS`.

## 3. Where to put them

**Recommended: the host `.env`.** It takes effect on the next container
restart, and you can do it before merging.

```sh
ssh <DEPLOY_SSH_USER>@<DEPLOY_SSH_HOST>
ENV=/opt/seald/apps/api/.env
sudo cp "$ENV" "$ENV.bak.$(date +%s)"
sudo tee -a "$ENV" >/dev/null <<'EOF'
SIGNER_OTP_KEY=<hex-64 #1>
APPROVAL_CSRF_KEY=<hex-64 #2>
AUTOMATION_SECRETS_KEY=<hex-64 #3>
MCP_OAUTH_CLIENTS='[{"client_id":"…","client_name":"Claude","redirect_uris":["https://…"]}]'
EOF
sudo chmod 0600 "$ENV"
sudo grep -cE '^(SIGNER_OTP_KEY|APPROVAL_CSRF_KEY|AUTOMATION_SECRETS_KEY)=' "$ENV"   # expect 3
cd /opt/seald && sudo docker compose up -d --force-recreate api
sudo docker compose logs --tail=50 api   # no "Invalid environment" errors
```

With the flags still off, the API ignores the new keys. A clean restart
here only proves the values parse.

**Then update the backup copy.** `prod-restore.yml` rebuilds the host `.env`
from the GitHub secret `PROD_API_ENV`. If that secret lacks the new keys, a
future restore leaves them out and the API won't start.

1. Go to GitHub → Settings → Secrets and variables → Actions →
   `PROD_API_ENV` → Update.
2. Paste the full current `.env`, including the new lines. Secrets are
   write-only, so the full text has to come from the host file.

**Optional: Secrets Manager instead of the host file.** After `PROD_API_ENV`
is updated:

1. Go to GitHub → Actions → **Seed AWS Secrets Manager** → Run workflow.
2. Pick branch `feat/enable-parity-flags`, or `main` once #382 is merged.
   The list of keys it copies gains the three new keys on that branch.

The container reads them at boot. Values in the host `.env` still win.

## 4. Merge and deploy

1. **Merge #383**, which removes Chromatic from CI. If "Chromatic visual
   regression" is a required status check, first remove it under Settings →
   Branches or Rules.
2. **Merge #382**, which turns the flags on. `Deploy` and the Cloudflare
   deploy start on their own.
3. **Watch both runs in Actions.** `Deploy` must end with `/health OK`. If
   it fails, the old container keeps serving.

## 5. Check that it's live

Get the API working first. The web app also deploys on merge, but signing
and sealing all go through the API.

- **API health:** `curl -s https://api.seald.nromomentum.com/health` returns
  `"status":"ok"`.
- **API logs:** no config errors on boot (`sudo docker compose logs api`).
- **Web:** hard-reload the app.
  - The editor shows the new field kinds, the signing-order and access-code
    options, and reminders.
  - Settings shows Developers (API keys, connected apps) and Automations.
- **Sealing:** send a 2-signer test envelope with signing order on and an
  access code.
  - Signer 2 sees "not your turn" until signer 1 signs.
  - The access code arrives by email.
  - The sealed PDF has the certificate pages appended.
  - `/verify` shows `chain_intact`.
- **MCP:** connect the Claude or ChatGPT connector to
  `https://api.seald.nromomentum.com/mcp`. The OAuth consent page opens and
  a test send waits on the Approve page.

## 6. If something goes wrong

- **The API won't start after the merge.** The cause is almost always a
  missing or malformed key from step 2a or 2b. Read the error with
  `sudo docker compose logs --tail=100 api`, fix the `.env`, then run
  `sudo docker compose up -d --force-recreate api`.
- **MCP or automations misbehave.** Add `MCP_DISABLED=true` or
  `AUTOMATIONS_DISABLED=true` to the host `.env` and force-recreate the
  api. That turns them off with no rebuild.
- **One feature has to go.** Set its flag back to `false` in
  `packages/shared/src/feature-flags.ts` and merge. That is a one-line PR.
- **Everything has to go.** Revert PR #382 and merge the revert.
