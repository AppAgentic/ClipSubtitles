variable "project_id" {
  description = "Dedicated AppAgentic GCP project for ClipSubtitles. Never point this at another product."
  type        = string
}

variable "region" {
  type    = string
  default = "europe-west2"
}

variable "deployer_service_account" {
  description = "Company automation identity allowed to submit builds as the dedicated staging builder."
  type        = string
  default     = "mission-control@app-agentic.iam.gserviceaccount.com"
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

variable "allow_unauthenticated" {
  description = "Expose API and web by disabling the Cloud Run invoker IAM check. This is compatible with domain-restricted sharing; keep false until an explicit preview/cutover approval."
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

variable "transcription_providers" {
  description = "Ordered production transcription chain. Mock providers are forbidden in Cloud Run."
  type        = string
  default     = "elevenlabs,gemini"
  validation {
    condition     = var.transcription_providers == "elevenlabs,gemini"
    error_message = "transcription_providers must preserve the approved elevenlabs,gemini production order"
  }
}

variable "elevenlabs_scribe_model" {
  type    = string
  default = "scribe_v2"
}

variable "gemini_transcribe_model" {
  type    = string
  default = "gemini-3.5-transcribe"
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
