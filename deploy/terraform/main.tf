# Seald single-node deploy - EC2 spot + EIP + SG, wired to run the
# Dockerfile+compose stack at the repo root. Postgres + storage live on
# Supabase, so this template intentionally does NOT provision any DB.
#
# DNS: we do NOT own the registrar (GoDaddy). After `terraform apply`,
# grab the `public_ip` output and create an A record for your API
# subdomain (e.g. api.seald.example.com) at GoDaddy pointing to it.
# Caddy in the container will then issue a Let's Encrypt cert on first
# HTTPS request.
#
# Prereqs on the host once it boots:
#   - git clone the repo into /opt/seald
#   - copy apps/api/.env.example -> apps/api/.env, fill in Supabase + secrets
#   - docker compose up -d --build
# The user-data script below installs docker + git + does the clone
# automatically; you only need to drop in .env and `docker compose up`.

provider "aws" {
  region = var.aws_region
}

locals {
  common_tags = merge(
    { Project = var.project, ManagedBy = "terraform" },
    var.tags,
  )
}

# --------------------------------------------------------------------
# Networking - use the default VPC/subnet. Explicitly NOT provisioning
# a dedicated VPC; this is a single-node deploy and AWS gives every
# account a default VPC with free cross-AZ data and public subnets.
# --------------------------------------------------------------------
data "aws_vpc" "default" {
  default = true
}

data "aws_subnets" "default" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }
  filter {
    name   = "default-for-az"
    values = ["true"]
  }
}

# --------------------------------------------------------------------
# AMI - latest Ubuntu 22.04 arm64 from Canonical (owner 099720109477).
# Override via var.ami_id if you need a specific pinned image.
# --------------------------------------------------------------------
data "aws_ami" "ubuntu_arm64" {
  count       = var.ami_id == "" ? 1 : 0
  most_recent = true
  owners      = ["099720109477"]

  # t4g instances are ARM64 (Graviton). If you swap instance_type to an
  # x86 family (t3/t3a), flip this to amd64-server + x86_64.
  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-arm64-server-*"]
  }
  filter {
    name   = "architecture"
    values = ["arm64"]
  }
  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

locals {
  resolved_ami_id = var.ami_id != "" ? var.ami_id : data.aws_ami.ubuntu_arm64[0].id
}

# --------------------------------------------------------------------
# Security group - 22 (SSH, restricted), 80 + 443 (Caddy, public).
# Egress unrestricted (needs to talk to Supabase, Resend, ACME, TSA).
# --------------------------------------------------------------------
resource "aws_security_group" "api" {
  name        = "${var.project}-api"
  description = "Seald API - SSH + HTTP + HTTPS"
  vpc_id      = data.aws_vpc.default.id

  ingress {
    description = "SSH"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = var.ssh_ingress_cidrs
  }
  ingress {
    description = "HTTP Caddy ACME + redirect"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  ingress {
    description = "HTTPS Caddy to app:3000"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  ingress {
    description = "HTTP/3 (QUIC)"
    from_port   = 443
    to_port     = 443
    protocol    = "udp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    description = "all egress - Supabase, Resend, ACME, TSA"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(local.common_tags, { Name = "${var.project}-api" })
}

# --------------------------------------------------------------------
# SSH key pair
# --------------------------------------------------------------------
resource "aws_key_pair" "admin" {
  key_name   = "${var.project}-admin"
  public_key = var.ssh_pubkey
  tags       = local.common_tags
}

# --------------------------------------------------------------------
# User-data bootstrap. Runs once on first boot - installs Docker,
# pulls the repo, and leaves it ready for the operator to drop in
# apps/api/.env + `docker compose up -d`. We deliberately do NOT start
# the stack here because it needs .env to exist first.
# --------------------------------------------------------------------
locals {
  user_data = <<-EOT
    #!/usr/bin/env bash
    set -euxo pipefail
    exec > /var/log/seald-bootstrap.log 2>&1

    apt-get update
    apt-get install -y ca-certificates curl gnupg git

    # Docker CE via Docker's apt repo (Ubuntu's docker.io is too old).
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
      | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    chmod a+r /etc/apt/keyrings/docker.gpg
    . /etc/os-release
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $VERSION_CODENAME stable" \
      > /etc/apt/sources.list.d/docker.list
    apt-get update
    apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
    systemctl enable --now docker
    usermod -aG docker ubuntu

    # Clone the repo into /opt/seald owned by ubuntu. Public repo -> no
    # auth needed. The Deploy workflow will git pull + docker compose up
    # on every subsequent roll.
    install -d -o ubuntu -g ubuntu /opt/seald
    sudo -iu ubuntu git clone https://github.com/eliranRP/seald.git /opt/seald

    # Do NOT start the app here - .env must land first. Operator SSHes
    # in once to drop it, then runs docker compose up.
    cat > /etc/motd <<'MOTD'

      ┌─────────────────────────────────────────────────────────┐
      │  Seald deploy host - bootstrap complete                 │
      │                                                         │
      │  Next step (one-time):                                  │
      │    1. vim /opt/seald/apps/api/.env                      │
      │    2. cd /opt/seald && docker compose up -d --build     │
      │                                                         │
      │  Logs: /var/log/seald-bootstrap.log                     │
      └─────────────────────────────────────────────────────────┘

    MOTD
  EOT
}

# --------------------------------------------------------------------
# Single spot instance - simpler and one-pass-appliable than an ASG.
# Trade-off: if the spot is reclaimed, operator re-runs `terraform
# apply` to replace. For the scale this template targets (single-node
# SaaS), that's an acceptable few-minutes-of-downtime story and
# spot-t4g.small is rarely preempted in practice.
# --------------------------------------------------------------------
resource "aws_instance" "api" {
  ami                    = local.resolved_ami_id
  instance_type          = var.instance_type
  key_name               = aws_key_pair.admin.key_name
  vpc_security_group_ids = [aws_security_group.api.id]
  subnet_id              = data.aws_subnets.default.ids[0]

  user_data                   = local.user_data
  user_data_replace_on_change = false

  instance_market_options {
    market_type = "spot"
    spot_options {
      instance_interruption_behavior = "stop"
      spot_instance_type             = "persistent"
      max_price                      = var.spot_max_price == "" ? null : var.spot_max_price
    }
  }

  root_block_device {
    volume_size           = var.root_volume_size_gb
    volume_type           = "gp3"
    delete_on_termination = true
    encrypted             = true
  }

  metadata_options {
    http_tokens                 = "required" # IMDSv2
    http_put_response_hop_limit = 2
  }

  tags        = merge(local.common_tags, { Name = "${var.project}-api" })
  volume_tags = local.common_tags
}

# --------------------------------------------------------------------
# Elastic IP - pinned so the GoDaddy A record doesn't change across
# instance rebuilds.
# --------------------------------------------------------------------
resource "aws_eip" "api" {
  domain   = "vpc"
  instance = aws_instance.api.id
  tags     = merge(local.common_tags, { Name = "${var.project}-api" })
}
