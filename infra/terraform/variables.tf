variable "project_id" {
  description = "Dedicated AppAgentic GCP project for ClipSubtitles. Never point this at another product."
  type        = string
}

variable "region" {
  type    = string
  default = "europe-west2"
}

variable "environment" {
  type    = string
  default = "staging"
  validation {
    condition     = contains(["staging", "production"], var.environment)
    error_message = "environment must be staging or production"
  }
}

variable "deploy_services" {
  description = "Create Cloud Run services only after images and secret versions exist."
  type        = bool
  default     = false
}

variable "image_tag" {
  type    = string
  default = "unset"
}

variable "api_public_url" {
  type    = string
  default = "https://api.clipsubtitles.com"
}

variable "web_public_url" {
  type    = string
  default = "https://clipsubtitles.com"
}

variable "worker_public_url" {
  description = "Stable HTTPS URL of the worker service. Required when deploy_services=true; never use a placeholder."
  type        = string
  default     = ""
}

variable "object_store_driver" {
  description = "Production media store. R2 is the economical default; GCS remains the same-cloud fallback."
  type        = string
  default     = "r2"
  validation {
    condition     = contains(["r2", "gcs"], var.object_store_driver)
    error_message = "object_store_driver must be r2 or gcs"
  }
}

variable "r2_bucket" {
  type    = string
  default = "clipsubtitles-media"
}

variable "r2_endpoint" {
  description = "Cloudflare account-specific HTTPS R2 S3 endpoint. Required before an R2 service deployment."
  type        = string
  default     = ""
}

variable "database_tier" {
  description = "Shared-core staging default. Raise to a dedicated tier before sustained production load."
  type        = string
  default     = "db-g1-small"
}

variable "database_user" {
  description = "Runtime PostgreSQL user created out-of-band with the matching Secret Manager password version."
  type        = string
  default     = "clipsubtitles_runtime"
}

variable "worker_max_instances" {
  type    = number
  default = 4
}

variable "api_max_instances" {
  type    = number
  default = 10
}
