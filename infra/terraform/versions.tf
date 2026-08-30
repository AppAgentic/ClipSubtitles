terraform {
  required_version = ">= 1.7.0"

  backend "gcs" {
    bucket = "clipsubtitles-staging-tfstate-486013933077"
    prefix = "terraform/staging"
  }

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.0"
    }
  }
}

provider "google" {
  project               = var.project_id
  region                = var.region
  billing_project       = var.project_id
  user_project_override = true
}
