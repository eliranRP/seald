terraform {
  required_version = ">= 1.6.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.40"
    }
    godaddy = {
      # Community-maintained provider (n3integration/godaddy). Official
      # GoDaddy doesn't ship a Terraform provider. Only active if
      # var.godaddy_enabled = true.
      source  = "n3integration/godaddy"
      version = "~> 1.9"
    }
  }
}
