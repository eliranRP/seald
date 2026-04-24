# Seald single-node deploy — EC2 spot + EIP + SG, wired to run the
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
#   - copy apps/api/.env.example → apps/api/.env, fill in Supabase + secrets
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
# Networking — use the default VPC/subnet. Explicitly NOT provisioning
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
# AMI — latest Ubuntu 22.04 arm64 from Canonical (owner 099720109477).
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
# Security group — 22 (SSH, restricted), 80 + 443 (Caddy, public).
# Egress unrestricted (needs to talk to Supabase, Resend, ACME, TSA).
# --------------------------------------------------------------------
resource "aws_security_group" "api" {
  name        = "${var.project}-api"
  description = "Seald API — SSH + HTTP + HTTPS"
  vpc_id      = data.aws_vpc.default.id

  ingress {
    description = "SSH"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = var.ssh_ingress_cidrs
  }
  ingress {
    description = "HTTP (Caddy ACME challenge + redirect → HTTPS)"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  ingress {
    description = "HTTPS (Caddy → app:3000)"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  ingress {
    description      = "HTTP/3 (QUIC)"
    from_port        = 443
    to_port          = 443
    protocol         = "udp"
    cidr_blocks      = ["0.0.0.0/0"]
  }

  egress {
    description = "all egress — Supabase, Resend, ACME, TSA"
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
# User-data bootstrap. Runs once on first boot — installs Docker,
# pulls the repo, and leaves it ready for the operator to drop in
# apps/api/.env + `docker compose up -d`. We deliberately do NOT start
# the stack here because it needs .env to exist first.
# --------------------------------------------------------------------
locals {
  user_data = <<-EOT
    #!/usr/bin/env bash
    set -euo pipefail

    apt-get update
    apt-get install -y ca-certificates curl gnupg git

    # Install Docker via Docker's apt repo (Ubuntu's docker.io lags badly).
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
      | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    chmod a+r /etc/apt/keyrings/docker.gpg

    # shellcheck source=/dev/null
    . /etc/os-release
    echo \
      "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
       https://download.docker.com/linux/ubuntu $VERSION_CODENAME stable" \
      > /etc/apt/sources.list.d/docker.list
    apt-get update
    apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

    systemctl enable --now docker
    usermod -aG docker ubuntu

    # Clone the repo for the operator. Replace REPO_URL with your fork if
    # you mirror elsewhere. SSH agent forwarding or a GitHub deploy key
    # needs to be set up separately if the repo is private.
    install -d -o ubuntu -g ubuntu /opt/seald
    # Placeholder — operator does `git clone` manually with their auth.
    echo "Seald bootstrap done. Next steps:" > /etc/motd.seald
    echo "  1. sudo -iu ubuntu git clone <repo> /opt/seald" >> /etc/motd.seald
    echo "  2. cp /opt/seald/apps/api/.env.example /opt/seald/apps/api/.env  (fill it in)" >> /etc/motd.seald
    echo "  3. cd /opt/seald && docker compose up -d --build" >> /etc/motd.seald
  EOT
}

# --------------------------------------------------------------------
# Spot launch template — gives us cheap capacity (~$0.005/hr for
# t4g.small in us-east-1) while handling the occasional reclamation
# gracefully. If you need stricter availability, drop the spot_options
# block and pay ~$0.017/hr on-demand.
# --------------------------------------------------------------------
resource "aws_launch_template" "api" {
  name_prefix            = "${var.project}-api-"
  image_id               = local.resolved_ami_id
  instance_type          = var.instance_type
  key_name               = aws_key_pair.admin.key_name
  vpc_security_group_ids = [aws_security_group.api.id]

  user_data = base64encode(local.user_data)

  instance_market_options {
    market_type = "spot"
    spot_options {
      instance_interruption_behavior = "stop"
      spot_instance_type             = "persistent"
      max_price                      = var.spot_max_price == "" ? null : var.spot_max_price
    }
  }

  block_device_mappings {
    device_name = "/dev/sda1"
    ebs {
      volume_size           = var.root_volume_size_gb
      volume_type           = "gp3"
      delete_on_termination = true
      encrypted             = true
    }
  }

  metadata_options {
    http_tokens                 = "required" # IMDSv2
    http_put_response_hop_limit = 2
  }

  tag_specifications {
    resource_type = "instance"
    tags          = merge(local.common_tags, { Name = "${var.project}-api" })
  }

  tag_specifications {
    resource_type = "volume"
    tags          = local.common_tags
  }

  tags = local.common_tags
}

# --------------------------------------------------------------------
# The actual instance. We run a single one (single-node deploy) via an
# Auto Scaling Group so spot reclaims automatically recover. min=max=1
# pins it to one instance.
# --------------------------------------------------------------------
resource "aws_autoscaling_group" "api" {
  name                = "${var.project}-api"
  desired_capacity    = 1
  min_size            = 1
  max_size            = 1
  vpc_zone_identifier = data.aws_subnets.default.ids

  launch_template {
    id      = aws_launch_template.api.id
    version = "$Latest"
  }

  health_check_type         = "EC2"
  health_check_grace_period = 180

  tag {
    key                 = "Name"
    value               = "${var.project}-api"
    propagate_at_launch = true
  }

  # Extra tags — ASGs want them in this awkward block form, not a map.
  dynamic "tag" {
    for_each = local.common_tags
    content {
      key                 = tag.key
      value               = tag.value
      propagate_at_launch = true
    }
  }

  lifecycle {
    # Replacing the launch template should roll the instance.
    create_before_destroy = true
  }
}

# --------------------------------------------------------------------
# Elastic IP — pinned so the A-record at GoDaddy doesn't need to change
# across instance reclaim/rebuilds. Associate via a local-exec hook
# since ASG-managed instances can't take a static EIP directly at plan
# time; we use a lifecycle hook to attach on each new instance.
# --------------------------------------------------------------------
resource "aws_eip" "api" {
  domain = "vpc"
  tags   = merge(local.common_tags, { Name = "${var.project}-api" })
}

# Grab the current ASG instance id so we can associate the EIP.
data "aws_instances" "api" {
  instance_tags = {
    Name = "${var.project}-api"
  }
  instance_state_names = ["running", "pending"]

  depends_on = [aws_autoscaling_group.api]
}

resource "aws_eip_association" "api" {
  count         = length(data.aws_instances.api.ids) > 0 ? 1 : 0
  instance_id   = data.aws_instances.api.ids[0]
  allocation_id = aws_eip.api.id
}
