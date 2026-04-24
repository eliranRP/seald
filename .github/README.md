# CI/CD

Four GitHub Actions workflows in [`.github/workflows/`](workflows/):

| Workflow      | File                   | Trigger                                       | What it does                                                                                           |
| ------------- | ---------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| **CI**        | [`ci.yml`](workflows/ci.yml) | Every PR + push to `develop`/`main`       | Install → lint → typecheck → unit tests → e2e (incl. PAdES + PAdES-B-T). Uploads sealed PDFs as artifacts. |
| **Docker**    | [`docker.yml`](workflows/docker.yml) | Push to `develop`/`main`, version tags | Builds multi-arch `linux/amd64` + `linux/arm64` image, pushes to `ghcr.io/<owner>/seald`.             |
| **Terraform** | [`terraform.yml`](workflows/terraform.yml) | PR touching `deploy/terraform/**` + manual dispatch | fmt / validate / plan on PRs; manual apply/destroy via workflow_dispatch.                        |
| **Deploy**    | [`deploy.yml`](workflows/deploy.yml) | Manual dispatch, or after Docker success on `main` | SSH into the EC2 host, `git pull` + `docker compose up -d`, poll `/health` until ready.        |

## Environment setup

These workflows need GitHub Secrets wired up before they're useful. The
first-time path:

### 1. Build the AWS backend for Terraform state (one-time)

State has to live somewhere persistent. Create one S3 bucket + one
DynamoDB table outside of this Terraform (chicken-and-egg):

```bash
aws s3api create-bucket --bucket seald-tfstate --region us-east-1 \
  --create-bucket-configuration LocationConstraint=us-east-1
aws s3api put-bucket-versioning --bucket seald-tfstate \
  --versioning-configuration Status=Enabled
aws dynamodb create-table \
  --table-name seald-tfstate-lock \
  --attribute-definitions AttributeName=LockID,AttributeType=S \
  --key-schema AttributeName=LockID,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --region us-east-1
```

### 2. Add GitHub Secrets

Repository → Settings → Secrets and variables → Actions → **New repository secret**:

| Secret                  | Used by               | What it is                                                         |
| ----------------------- | --------------------- | ------------------------------------------------------------------ |
| `AWS_ACCESS_KEY_ID`     | terraform.yml         | IAM user with EC2 + EIP + SG + S3-state-bucket + Dynamo-lock perms |
| `AWS_SECRET_ACCESS_KEY` | terraform.yml         | Matching secret key                                                |
| `AWS_REGION`            | terraform.yml         | e.g. `us-east-1`                                                   |
| `TF_STATE_BUCKET`       | terraform.yml         | Name of the S3 bucket from step 1                                  |
| `TF_STATE_LOCK_TABLE`   | terraform.yml         | Name of the DynamoDB table from step 1                             |
| `SSH_PUBKEY`            | terraform.yml         | Public key that goes into the EC2 key pair (`cat ~/.ssh/id_ed25519.pub`) |
| `GODADDY_API_KEY`       | terraform.yml         | Only if `godaddy_enabled = true`. See `deploy/terraform/README.md` for the API-tier gotcha. |
| `GODADDY_API_SECRET`    | terraform.yml         | Paired secret                                                      |
| `GODADDY_DOMAIN`        | terraform.yml         | Registered domain (e.g. `nromomentum.com`)                         |
| `DEPLOY_SSH_HOST`       | deploy.yml            | EC2 public IP (the EIP, so it's stable)                            |
| `DEPLOY_SSH_USER`       | deploy.yml            | `ubuntu` for the Ubuntu AMI the TF template uses                   |
| `DEPLOY_SSH_KEY`        | deploy.yml            | Matching *private* key for `SSH_PUBKEY`, PEM format                |

### 3. First end-to-end roll

```text
1.  Bootstrap S3 + DynamoDB (step 1 above)
2.  Add the secrets (step 2 above)
3.  Trigger "Terraform" workflow manually → action: apply
     (creates EC2 + EIP + SG + optionally GoDaddy A record)
4.  If GoDaddy was disabled: paste the EIP into GoDaddy's DNS dashboard
5.  SSH into the host once:
       ssh ubuntu@<eip>
       sudo -iu ubuntu git clone <repo-url> /opt/seald
       cp /opt/seald/apps/api/.env.example /opt/seald/apps/api/.env
       vim /opt/seald/apps/api/.env       (fill it in)
       cd /opt/seald && docker compose up -d --build
6.  From now on: every push to main → Docker workflow builds the image
    → Deploy workflow SSHes in → compose pulls + restarts. Manual
    "Deploy" dispatch also works for rollback to a pinned SHA/tag.
```

### Rollback

- **App:** Deploy workflow accepts `ref` input — pass a previous SHA or
  tag to roll back. `docker compose up -d` brings the old image up in
  seconds.
- **Infra:** Terraform's state versioning on S3 lets you `terraform
  apply` against an older `.tfstate` version if a bad change slipped in.
