variable "aws_region" {
  description = "AWS region to deploy into. us-east-1 has the cheapest spot prices for t4g.small."
  type        = string
  default     = "us-east-1"
}

variable "project" {
  description = "Short project tag applied to every resource; also used for Name tags and security-group names."
  type        = string
  default     = "seald"
}

variable "instance_type" {
  description = "EC2 instance type. t4g.small (ARM64, 2 vCPU, 2 GiB) is the sweet spot for this workload."
  type        = string
  default     = "t4g.small"
}

variable "spot_max_price" {
  description = "Max hourly USD willing to pay for spot. Leave empty to use the on-demand cap (AWS default)."
  type        = string
  default     = ""
}

variable "ssh_pubkey" {
  description = "Your SSH public key, used to create the EC2 key pair. `cat ~/.ssh/id_ed25519.pub` or similar."
  type        = string
  sensitive   = false
}

variable "ssh_ingress_cidrs" {
  description = "Source CIDRs allowed to reach port 22. Keep to your admin IPs; use 0.0.0.0/0 only as a break-glass."
  type        = list(string)
  default     = ["0.0.0.0/0"]
}

variable "ami_id" {
  description = "Override the default Ubuntu 22.04 arm64 AMI lookup. Leave empty to use the latest Canonical image."
  type        = string
  default     = ""
}

variable "root_volume_size_gb" {
  description = "Root EBS volume size in GB. 20 is enough for the compiled app + caddy caches + a handful of ephemeral PDFs."
  type        = number
  default     = 20
}

variable "tags" {
  description = "Extra tags to merge onto every resource."
  type        = map(string)
  default     = {}
}
