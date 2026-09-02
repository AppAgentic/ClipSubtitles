locals {
  name                        = "clipsubtitles-${var.environment}"
  service_account_environment = var.environment == "production" ? "prod" : var.environment
  repository                  = "clipsubtitles"
  labels                      = { product = "clipsubtitles", environment = var.environment, managed_by = "terraform" }
  api_image                   = "${var.region}-docker.pkg.dev/${var.project_id}/${local.repository}/api:${var.image_tag}"
  worker_image                = "${var.region}-docker.pkg.dev/${var.project_id}/${local.repository}/worker:${var.image_tag}"
  web_image                   = "${var.region}-docker.pkg.dev/${var.project_id}/${local.repository}/web:${var.image_tag}"
  billing_secret_env = {
    WHOP_API_KEY              = "whop-api-key"
    WHOP_ACCOUNT_ID           = "whop-account-id"
    WHOP_WEBHOOK_SECRET       = "whop-webhook-secret"
    WHOP_PLAN_CREATOR_MONTHLY = "whop-plan-creator-monthly"
    WHOP_PLAN_CREATOR_ANNUAL  = "whop-plan-creator-annual"
    WHOP_PLAN_PRO_MONTHLY     = "whop-plan-pro-monthly"
    WHOP_PLAN_PRO_ANNUAL      = "whop-plan-pro-annual"
    WHOP_PLAN_STUDIO_MONTHLY  = "whop-plan-studio-monthly"
    WHOP_PLAN_STUDIO_ANNUAL   = "whop-plan-studio-annual"
    WHOP_PLAN_TOPUP_SMALL     = "whop-plan-topup-small"
    WHOP_PLAN_TOPUP_MEDIUM    = "whop-plan-topup-medium"
    WHOP_PLAN_TOPUP_LARGE     = "whop-plan-topup-large"
  }
  shared_secret_names = toset([
    "auth-local-secret",
    "workos-api-key",
    "workos-client-id",
    "workos-authkit-issuer",
    "workos-webhook-secret",
    "postgres-password",
    "r2-access-key-id",
    "r2-secret-access-key",
  ])
  api_secret_names = setunion(local.shared_secret_names, toset(values(local.billing_secret_env)))
  worker_secret_names = setunion(local.shared_secret_names, toset([
    "elevenlabs-api-key",
    "gemini-api-key",
  ]))
  web_build_secret_names = toset([
    "gleap-sdk-token",
  ])
  runtime_secret_names = setunion(
    local.worker_secret_names,
    toset(values(local.billing_secret_env)),
    local.web_build_secret_names,
  )
}

resource "google_project_service" "required" {
  for_each = toset([
    "artifactregistry.googleapis.com",
    "cloudbuild.googleapis.com",
    "run.googleapis.com",
    "cloudtasks.googleapis.com",
    "cloudscheduler.googleapis.com",
    "cloudresourcemanager.googleapis.com",
    "compute.googleapis.com",
    "apikeys.googleapis.com",
    "generativelanguage.googleapis.com",
    "iam.googleapis.com",
    "iamcredentials.googleapis.com",
    "logging.googleapis.com",
    "monitoring.googleapis.com",
    "secretmanager.googleapis.com",
    "sqladmin.googleapis.com",
    "storage.googleapis.com",
  ])
  project            = var.project_id
  service            = each.value
  disable_on_destroy = false
}

resource "google_artifact_registry_repository" "images" {
  location      = var.region
  repository_id = local.repository
  format        = "DOCKER"
  labels        = local.labels
  depends_on    = [google_project_service.required]
}

resource "google_storage_bucket" "build_source" {
  name                        = "${var.project_id}-clipsubtitles-build-source"
  location                    = var.region
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  force_destroy               = false
  labels                      = local.labels
  soft_delete_policy {
    retention_duration_seconds = 0
  }
  lifecycle_rule {
    condition { age = 7 }
    action { type = "Delete" }
  }
  depends_on = [google_project_service.required]
}

resource "google_storage_bucket" "media" {
  name                        = "${var.project_id}-clipsubtitles-media"
  location                    = var.region
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  force_destroy               = false
  labels                      = local.labels

  # Application deletion is immediate. GCS enables a billable seven-day soft
  # delete policy by default on new buckets, so explicitly disable it.
  soft_delete_policy {
    retention_duration_seconds = 0
  }
  # Application retention is workspace-specific. This is a final safety net
  # for orphaned objects, whose keys begin with a workspace id.
  lifecycle_rule {
    condition { age = 370 }
    action { type = "Delete" }
  }
  depends_on = [google_project_service.required]
}

resource "google_cloud_tasks_queue" "renders" {
  name     = "clipsubtitles-renders-${var.environment}"
  location = var.region
  rate_limits {
    max_concurrent_dispatches = var.worker_max_instances
    max_dispatches_per_second = var.worker_max_instances
  }
  retry_config {
    max_attempts       = 5
    min_backoff        = "2s"
    max_backoff        = "300s"
    max_doublings      = 4
    max_retry_duration = "3600s"
  }
  depends_on = [google_project_service.required]
}

resource "google_sql_database_instance" "postgres" {
  name                = "${local.name}-postgres"
  region              = var.region
  database_version    = "POSTGRES_17"
  deletion_protection = true
  settings {
    tier              = var.database_tier
    edition           = "ENTERPRISE"
    availability_type = "ZONAL"
    disk_type         = "PD_SSD"
    disk_size         = 10
    disk_autoresize   = true
    user_labels       = local.labels
    backup_configuration {
      enabled                        = true
      point_in_time_recovery_enabled = true
      start_time                     = "03:00"
    }
    database_flags {
      name  = "cloudsql.iam_authentication"
      value = "on"
    }
    ip_configuration { ipv4_enabled = true }
  }
  depends_on = [google_project_service.required]
}

resource "google_sql_database" "app" {
  name     = "clipsubtitles"
  instance = google_sql_database_instance.postgres.name
}

resource "google_service_account" "api" {
  account_id   = "clipsubtitles-api-${local.service_account_environment}"
  display_name = "ClipSubtitles API (${var.environment})"
}

resource "google_service_account" "worker" {
  account_id   = "clipsubtitles-worker-${local.service_account_environment}"
  display_name = "ClipSubtitles render worker (${var.environment})"
}

resource "google_service_account" "web" {
  account_id   = "clipsubtitles-web-${local.service_account_environment}"
  display_name = "ClipSubtitles web (${var.environment})"
}

resource "google_service_account" "build" {
  account_id   = "clipsubtitles-build-${local.service_account_environment}"
  display_name = "ClipSubtitles image builder (${var.environment})"
}

resource "google_storage_bucket_iam_member" "build_source_reader" {
  bucket = google_storage_bucket.build_source.name
  role   = "roles/storage.objectViewer"
  member = "serviceAccount:${google_service_account.build.email}"
}

resource "google_artifact_registry_repository_iam_member" "build_image_writer" {
  project    = var.project_id
  location   = google_artifact_registry_repository.images.location
  repository = google_artifact_registry_repository.images.repository_id
  role       = "roles/artifactregistry.writer"
  member     = "serviceAccount:${google_service_account.build.email}"
}

resource "google_project_iam_member" "build_log_writer" {
  project = var.project_id
  role    = "roles/logging.logWriter"
  member  = "serviceAccount:${google_service_account.build.email}"
}

resource "google_service_account_iam_member" "deployer_can_use_build" {
  service_account_id = google_service_account.build.name
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${var.deployer_service_account}"
}

resource "google_service_account" "task_invoker" {
  account_id   = "clipsubtitles-tasks-${local.service_account_environment}"
  display_name = "ClipSubtitles Cloud Tasks invoker (${var.environment})"
}

resource "google_service_account" "scheduler_invoker" {
  account_id   = "clipsubtitles-maint-${local.service_account_environment}"
  display_name = "ClipSubtitles maintenance scheduler (${var.environment})"
}

resource "google_project_iam_member" "api_sql" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.api.email}"
}

resource "google_project_iam_member" "worker_sql" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.worker.email}"
}

resource "google_project_iam_member" "api_bucket" {
  project = var.project_id
  role    = "roles/storage.objectAdmin"
  member  = "serviceAccount:${google_service_account.api.email}"
}

resource "google_project_iam_member" "worker_bucket" {
  project = var.project_id
  role    = "roles/storage.objectAdmin"
  member  = "serviceAccount:${google_service_account.worker.email}"
}

resource "google_project_iam_member" "api_tasks" {
  project = var.project_id
  role    = "roles/cloudtasks.enqueuer"
  member  = "serviceAccount:${google_service_account.api.email}"
}

resource "google_project_iam_member" "worker_tasks" {
  project = var.project_id
  role    = "roles/cloudtasks.enqueuer"
  member  = "serviceAccount:${google_service_account.worker.email}"
}

resource "google_service_account_iam_member" "api_can_mint_task_oidc" {
  service_account_id = google_service_account.task_invoker.name
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${google_service_account.api.email}"
}

resource "google_service_account_iam_member" "worker_can_mint_task_oidc" {
  service_account_id = google_service_account.task_invoker.name
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${google_service_account.worker.email}"
}

resource "google_secret_manager_secret" "runtime" {
  for_each  = local.runtime_secret_names
  secret_id = "clipsubtitles-${var.environment}-${each.value}"
  replication {
    auto {}
  }
  labels     = local.labels
  depends_on = [google_project_service.required]
}

resource "google_secret_manager_secret_iam_member" "api" {
  for_each = {
    for name, secret in google_secret_manager_secret.runtime : name => secret
    if contains(local.api_secret_names, name)
  }
  secret_id = each.value.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.api.email}"
}

resource "google_secret_manager_secret_iam_member" "worker" {
  for_each = {
    for name, secret in google_secret_manager_secret.runtime : name => secret
    if contains(local.worker_secret_names, name)
  }
  secret_id = each.value.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.worker.email}"
}

resource "google_secret_manager_secret_iam_member" "build" {
  for_each = {
    for name, secret in google_secret_manager_secret.runtime : name => secret
    if contains(local.web_build_secret_names, name)
  }
  secret_id = each.value.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.build.email}"
}

resource "google_cloud_run_v2_service" "api" {
  count                = var.deploy_services ? 1 : 0
  name                 = "${local.name}-api"
  location             = var.region
  ingress              = var.deploy_public_edge ? "INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER" : "INGRESS_TRAFFIC_ALL"
  invoker_iam_disabled = var.allow_unauthenticated
  deletion_protection  = true
  template {
    service_account                  = google_service_account.api.email
    timeout                          = "300s"
    max_instance_request_concurrency = 40
    scaling {
      min_instance_count = 0
      max_instance_count = var.api_max_instances
    }
    volumes {
      name = "cloudsql"
      cloud_sql_instance {
        instances = [google_sql_database_instance.postgres.connection_name]
      }
    }
    containers {
      image = local.api_image
      ports {
        name           = "http1"
        container_port = 8080
      }
      resources {
        limits            = { cpu = "1", memory = "1Gi" }
        cpu_idle          = true
        startup_cpu_boost = true
      }
      volume_mounts {
        name       = "cloudsql"
        mount_path = "/cloudsql"
      }
      env {
        name  = "NODE_ENV"
        value = "production"
      }
      env {
        # A new immutable image tag also rolls the service so environment
        # secrets referenced as `latest` are re-resolved by fresh instances.
        name  = "DEPLOYMENT_REVISION"
        value = var.image_tag
      }
      env {
        # Roll the API after runtime-only secret/config changes without
        # publishing a duplicate image tag.
        name  = "RUNTIME_CONFIG_REVISION"
        value = var.runtime_config_revision
      }
      env {
        name  = "AUTH_MODE"
        value = "workos"
      }
      env {
        name  = "BILLING_PROVIDER"
        value = var.enable_billing ? "whop" : "none"
      }
      dynamic "env" {
        for_each = var.enable_billing ? local.billing_secret_env : {}
        iterator = billing
        content {
          name = billing.key
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.runtime[billing.value].secret_id
              version = "latest"
            }
          }
        }
      }
      env {
        name  = "TRANSCRIPTION_PROVIDERS"
        value = var.transcription_providers
      }
      env {
        name  = "API_PUBLIC_URL"
        value = var.api_public_url
      }
      env {
        name  = "WEB_PUBLIC_URL"
        value = var.web_public_url
      }
      env {
        name = "AUTH_LOCAL_SECRET"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.runtime["auth-local-secret"].secret_id
            version = "latest"
          }
        }
      }
      env {
        name = "WORKOS_API_KEY"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.runtime["workos-api-key"].secret_id
            version = "latest"
          }
        }
      }
      env {
        name = "WORKOS_CLIENT_ID"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.runtime["workos-client-id"].secret_id
            version = "latest"
          }
        }
      }
      env {
        name = "WORKOS_AUTHKIT_ISSUER"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.runtime["workos-authkit-issuer"].secret_id
            version = "latest"
          }
        }
      }
      env {
        name = "WORKOS_WEBHOOK_SECRET"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.runtime["workos-webhook-secret"].secret_id
            version = "latest"
          }
        }
      }
      env {
        name  = "OBJECT_STORE"
        value = var.object_store_driver
      }
      env {
        name  = "GCS_BUCKET"
        value = google_storage_bucket.media.name
      }
      dynamic "env" {
        for_each = var.object_store_driver == "r2" ? [1] : []
        content {
          name  = "R2_BUCKET"
          value = var.r2_bucket
        }
      }
      dynamic "env" {
        for_each = var.object_store_driver == "r2" ? [1] : []
        content {
          name  = "R2_ENDPOINT"
          value = var.r2_endpoint
        }
      }
      dynamic "env" {
        for_each = var.object_store_driver == "r2" ? [1] : []
        content {
          name = "R2_ACCESS_KEY_ID"
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.runtime["r2-access-key-id"].secret_id
              version = "latest"
            }
          }
        }
      }
      dynamic "env" {
        for_each = var.object_store_driver == "r2" ? [1] : []
        content {
          name = "R2_SECRET_ACCESS_KEY"
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.runtime["r2-secret-access-key"].secret_id
              version = "latest"
            }
          }
        }
      }
      env {
        name  = "TASK_DISPATCHER"
        value = "cloud-tasks"
      }
      env {
        name  = "GCP_PROJECT_ID"
        value = var.project_id
      }
      env {
        name  = "CLOUD_TASKS_LOCATION"
        value = var.region
      }
      env {
        name  = "CLOUD_TASKS_QUEUE"
        value = google_cloud_tasks_queue.renders.name
      }
      env {
        name  = "WORKER_PUBLIC_URL"
        value = var.worker_public_url
      }
      env {
        name  = "TASK_INVOKER_SERVICE_ACCOUNT"
        value = google_service_account.task_invoker.email
      }
      env {
        name  = "DB_DRIVER"
        value = "postgres"
      }
      env {
        name  = "POSTGRES_HOST"
        value = "/cloudsql/${google_sql_database_instance.postgres.connection_name}"
      }
      env {
        name  = "POSTGRES_DATABASE"
        value = google_sql_database.app.name
      }
      env {
        name  = "POSTGRES_USER"
        value = var.database_user
      }
      env {
        name = "POSTGRES_PASSWORD"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.runtime["postgres-password"].secret_id
            version = "latest"
          }
        }
      }
      startup_probe {
        http_get { path = "/healthz" }
        initial_delay_seconds = 2
        timeout_seconds       = 2
        period_seconds        = 5
        failure_threshold     = 12
      }
    }
  }
  lifecycle {
    # Cloud Run reports automatic zero-scale defaults as both
    # manual_instance_count=0 and min_instance_count=0. The provider then
    # proposes removing those server-owned defaults on every refresh.
    ignore_changes = [scaling]
    precondition {
      condition     = can(regex("^https://", var.worker_public_url))
      error_message = "worker_public_url must be the real HTTPS worker URL before deploy_services=true."
    }
    precondition {
      condition     = var.object_store_driver != "r2" || can(regex("^https://", var.r2_endpoint))
      error_message = "r2_endpoint must be the account-specific HTTPS endpoint when object_store_driver=r2."
    }
    precondition {
      condition     = !var.enable_billing || var.environment == "production"
      error_message = "Live Whop billing can only be enabled in the isolated production environment."
    }
  }
  depends_on = [google_artifact_registry_repository.images]
}

resource "google_cloud_run_v2_service" "web" {
  count                = var.deploy_services ? 1 : 0
  name                 = "${local.name}-web"
  location             = var.region
  ingress              = var.deploy_public_edge ? "INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER" : "INGRESS_TRAFFIC_ALL"
  invoker_iam_disabled = var.allow_unauthenticated
  deletion_protection  = true
  template {
    service_account                  = google_service_account.web.email
    timeout                          = "60s"
    max_instance_request_concurrency = 80
    scaling {
      min_instance_count = 0
      max_instance_count = var.api_max_instances
    }
    containers {
      image = local.web_image
      ports {
        name           = "http1"
        container_port = 8080
      }
      resources {
        limits            = { cpu = "1", memory = "512Mi" }
        cpu_idle          = true
        startup_cpu_boost = true
      }
      startup_probe {
        http_get { path = "/" }
        initial_delay_seconds = 1
        timeout_seconds       = 2
        period_seconds        = 5
        failure_threshold     = 12
      }
    }
  }
  lifecycle {
    # See the API service note: these zero values are Cloud Run defaults, not
    # operator-controlled scaling changes.
    ignore_changes = [scaling]
  }
  depends_on = [google_artifact_registry_repository.images]
}

resource "google_cloud_run_v2_service" "worker" {
  count               = var.deploy_services ? 1 : 0
  name                = "${local.name}-worker"
  location            = var.region
  ingress             = "INGRESS_TRAFFIC_INTERNAL_ONLY"
  deletion_protection = true
  template {
    service_account                  = google_service_account.worker.email
    timeout                          = "3600s"
    max_instance_request_concurrency = 1
    scaling {
      min_instance_count = 0
      max_instance_count = var.worker_max_instances
    }
    volumes {
      name = "cloudsql"
      cloud_sql_instance {
        instances = [google_sql_database_instance.postgres.connection_name]
      }
    }
    containers {
      image = local.worker_image
      ports {
        name           = "http1"
        container_port = 8080
      }
      resources {
        limits            = { cpu = "4", memory = "8Gi" }
        cpu_idle          = true
        startup_cpu_boost = true
      }
      volume_mounts {
        name       = "cloudsql"
        mount_path = "/cloudsql"
      }
      env {
        name  = "NODE_ENV"
        value = "production"
      }
      env {
        name  = "RUNTIME_CONFIG_REVISION"
        value = var.runtime_config_revision
      }
      env {
        name  = "AUTH_MODE"
        value = "workos"
      }
      env {
        name  = "TRANSCRIPTION_PROVIDERS"
        value = var.transcription_providers
      }
      env {
        name  = "ELEVENLABS_SCRIBE_MODEL"
        value = var.elevenlabs_scribe_model
      }
      env {
        # Temporary, bounded provider diagnostics are enabled in staging only.
        # The adapter retains only error type/code and request/trace IDs.
        name  = "ELEVENLABS_ERROR_DIAGNOSTICS"
        value = var.environment == "staging" ? "true" : "false"
      }
      env {
        name  = "GEMINI_TRANSCRIBE_MODEL"
        value = var.gemini_transcribe_model
      }
      env {
        name = "ELEVENLABS_API_KEY"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.runtime["elevenlabs-api-key"].secret_id
            version = var.elevenlabs_api_key_secret_version
          }
        }
      }
      env {
        name = "GEMINI_API_KEY"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.runtime["gemini-api-key"].secret_id
            version = var.gemini_api_key_secret_version
          }
        }
      }
      env {
        name = "AUTH_LOCAL_SECRET"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.runtime["auth-local-secret"].secret_id
            version = "latest"
          }
        }
      }
      env {
        name = "WORKOS_API_KEY"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.runtime["workos-api-key"].secret_id
            version = "latest"
          }
        }
      }
      env {
        name = "WORKOS_CLIENT_ID"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.runtime["workos-client-id"].secret_id
            version = "latest"
          }
        }
      }
      env {
        name = "WORKOS_AUTHKIT_ISSUER"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.runtime["workos-authkit-issuer"].secret_id
            version = "latest"
          }
        }
      }
      env {
        name  = "OBJECT_STORE"
        value = var.object_store_driver
      }
      env {
        name  = "GCS_BUCKET"
        value = google_storage_bucket.media.name
      }
      dynamic "env" {
        for_each = var.object_store_driver == "r2" ? [1] : []
        content {
          name  = "R2_BUCKET"
          value = var.r2_bucket
        }
      }
      dynamic "env" {
        for_each = var.object_store_driver == "r2" ? [1] : []
        content {
          name  = "R2_ENDPOINT"
          value = var.r2_endpoint
        }
      }
      dynamic "env" {
        for_each = var.object_store_driver == "r2" ? [1] : []
        content {
          name = "R2_ACCESS_KEY_ID"
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.runtime["r2-access-key-id"].secret_id
              version = "latest"
            }
          }
        }
      }
      dynamic "env" {
        for_each = var.object_store_driver == "r2" ? [1] : []
        content {
          name = "R2_SECRET_ACCESS_KEY"
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.runtime["r2-secret-access-key"].secret_id
              version = "latest"
            }
          }
        }
      }
      env {
        name  = "TASK_DISPATCHER"
        value = "cloud-tasks"
      }
      env {
        name  = "GCP_PROJECT_ID"
        value = var.project_id
      }
      env {
        name  = "CLOUD_TASKS_LOCATION"
        value = var.region
      }
      env {
        name  = "CLOUD_TASKS_QUEUE"
        value = google_cloud_tasks_queue.renders.name
      }
      env {
        name  = "WORKER_PUBLIC_URL"
        value = var.worker_public_url
      }
      env {
        name  = "TASK_INVOKER_SERVICE_ACCOUNT"
        value = google_service_account.task_invoker.email
      }
      env {
        name  = "DB_DRIVER"
        value = "postgres"
      }
      env {
        name  = "POSTGRES_HOST"
        value = "/cloudsql/${google_sql_database_instance.postgres.connection_name}"
      }
      env {
        name  = "POSTGRES_DATABASE"
        value = google_sql_database.app.name
      }
      env {
        name  = "POSTGRES_USER"
        value = var.database_user
      }
      env {
        name = "POSTGRES_PASSWORD"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.runtime["postgres-password"].secret_id
            version = "latest"
          }
        }
      }
      startup_probe {
        http_get { path = "/healthz" }
        initial_delay_seconds = 2
        timeout_seconds       = 2
        period_seconds        = 5
        failure_threshold     = 12
      }
    }
  }
  lifecycle {
    # See the API service note: these zero values are Cloud Run defaults, not
    # operator-controlled scaling changes.
    ignore_changes = [scaling]
    precondition {
      condition     = can(regex("^https://", var.worker_public_url))
      error_message = "worker_public_url must be the real HTTPS worker service URL before deploy_services=true."
    }
    precondition {
      condition     = var.object_store_driver != "r2" || can(regex("^https://", var.r2_endpoint))
      error_message = "r2_endpoint must be the account-specific HTTPS endpoint when object_store_driver=r2."
    }
  }
  depends_on = [google_artifact_registry_repository.images]
}

# Cloud Run domain mappings are not available in europe-west2. The production
# edge therefore uses one global HTTPS load balancer with serverless NEGs and
# host routing, keeping both origins in-region while Google manages TLS.
resource "google_compute_global_address" "public_edge" {
  count      = var.deploy_public_edge ? 1 : 0
  name       = "${local.name}-public-edge"
  depends_on = [google_project_service.required]
}

resource "google_compute_region_network_endpoint_group" "api" {
  count                 = var.deploy_public_edge ? 1 : 0
  name                  = "${local.name}-api-neg"
  region                = var.region
  network_endpoint_type = "SERVERLESS"
  cloud_run {
    service = google_cloud_run_v2_service.api[0].name
  }
  depends_on = [google_project_service.required]
}

resource "google_compute_region_network_endpoint_group" "web" {
  count                 = var.deploy_public_edge ? 1 : 0
  name                  = "${local.name}-web-neg"
  region                = var.region
  network_endpoint_type = "SERVERLESS"
  cloud_run {
    service = google_cloud_run_v2_service.web[0].name
  }
  depends_on = [google_project_service.required]
}

resource "google_compute_backend_service" "api" {
  count                 = var.deploy_public_edge ? 1 : 0
  name                  = "${local.name}-api"
  protocol              = "HTTP"
  load_balancing_scheme = "EXTERNAL_MANAGED"
  security_policy       = google_compute_security_policy.api[0].id
  backend {
    group = google_compute_region_network_endpoint_group.api[0].id
  }
}

# A single edge policy provides the distributed/IP layer that process-local
# token buckets cannot provide once Cloud Run scales horizontally. Database
# credit reservations and plan concurrency remain the source of truth for paid
# work; these rules bound anonymous abuse before it reaches an API instance.
resource "google_compute_security_policy" "api" {
  count = var.deploy_public_edge ? 1 : 0
  name  = "${local.name}-api-edge"

  rule {
    action   = "throttle"
    priority = 1000
    match {
      expr { expression = "request.path == '/v1/billing/webhooks/whop'" }
    }
    rate_limit_options {
      conform_action = "allow"
      exceed_action  = "deny(429)"
      enforce_on_key = "IP"
      rate_limit_threshold {
        count        = 60
        interval_sec = 60
      }
    }
    description = "Bound signed billing-webhook verification work per source IP."
  }

  rule {
    action   = "throttle"
    priority = 1100
    match {
      versioned_expr = "SRC_IPS_V1"
      config { src_ip_ranges = ["*"] }
    }
    rate_limit_options {
      conform_action = "allow"
      exceed_action  = "deny(429)"
      enforce_on_key = "IP"
      rate_limit_threshold {
        count        = 600
        interval_sec = 60
      }
    }
    description = "Distributed API abuse ceiling; application limits remain more specific."
  }

  rule {
    action   = "allow"
    priority = 2147483647
    match {
      versioned_expr = "SRC_IPS_V1"
      config { src_ip_ranges = ["*"] }
    }
    description = "Default allow after the paid-traffic rate limits."
  }
}

resource "google_compute_backend_service" "web" {
  count                 = var.deploy_public_edge ? 1 : 0
  name                  = "${local.name}-web"
  protocol              = "HTTP"
  load_balancing_scheme = "EXTERNAL_MANAGED"
  enable_cdn            = true
  backend {
    group = google_compute_region_network_endpoint_group.web[0].id
  }
}

resource "google_compute_url_map" "public_edge" {
  count           = var.deploy_public_edge ? 1 : 0
  name            = "${local.name}-public-edge"
  default_service = google_compute_backend_service.web[0].id

  host_rule {
    hosts        = [var.api_domain]
    path_matcher = "api"
  }

  path_matcher {
    name            = "api"
    default_service = google_compute_backend_service.api[0].id
  }

  lifecycle {
    precondition {
      condition     = var.deploy_services && var.allow_unauthenticated
      error_message = "deploy_public_edge requires deployed, publicly invokable web and API Cloud Run services."
    }
  }
}

resource "google_compute_managed_ssl_certificate" "public_edge" {
  count = var.deploy_public_edge ? 1 : 0
  # The initial certificate was created before external DNS existed and its
  # issuer cached the authoritative 30-minute negative response. Keep the
  # revision in the resource name so a post-DNS certificate can be created
  # before the never-active predecessor is retired.
  name       = "${local.name}-public-edge-v2"
  depends_on = [google_project_service.required]
  managed {
    domains = [var.web_domain, var.api_domain]
  }
  lifecycle {
    create_before_destroy = true
  }
}

resource "google_compute_target_https_proxy" "public_edge" {
  count            = var.deploy_public_edge ? 1 : 0
  name             = "${local.name}-public-edge"
  url_map          = google_compute_url_map.public_edge[0].id
  ssl_certificates = [google_compute_managed_ssl_certificate.public_edge[0].id]
}

resource "google_compute_global_forwarding_rule" "https" {
  count                 = var.deploy_public_edge ? 1 : 0
  name                  = "${local.name}-https"
  ip_address            = google_compute_global_address.public_edge[0].address
  ip_protocol           = "TCP"
  load_balancing_scheme = "EXTERNAL_MANAGED"
  port_range            = "443"
  target                = google_compute_target_https_proxy.public_edge[0].id
}

resource "google_compute_url_map" "http_redirect" {
  count      = var.deploy_public_edge ? 1 : 0
  name       = "${local.name}-http-redirect"
  depends_on = [google_project_service.required]
  default_url_redirect {
    https_redirect = true
    strip_query    = false
  }
}

resource "google_compute_target_http_proxy" "http_redirect" {
  count   = var.deploy_public_edge ? 1 : 0
  name    = "${local.name}-http-redirect"
  url_map = google_compute_url_map.http_redirect[0].id
}

resource "google_compute_global_forwarding_rule" "http" {
  count                 = var.deploy_public_edge ? 1 : 0
  name                  = "${local.name}-http"
  ip_address            = google_compute_global_address.public_edge[0].address
  ip_protocol           = "TCP"
  load_balancing_scheme = "EXTERNAL_MANAGED"
  port_range            = "80"
  target                = google_compute_target_http_proxy.http_redirect[0].id
}

data "google_project" "current" { project_id = var.project_id }

resource "google_cloud_run_v2_service_iam_member" "task_invoker" {
  count    = var.deploy_services ? 1 : 0
  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.worker[0].name
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.task_invoker.email}"
}

resource "google_cloud_run_v2_service_iam_member" "scheduler_invoker" {
  count    = var.deploy_services ? 1 : 0
  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.worker[0].name
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.scheduler_invoker.email}"
}

resource "google_cloud_scheduler_job" "maintenance" {
  count            = var.deploy_services ? 1 : 0
  name             = "${local.name}-daily-maintenance"
  region           = var.region
  schedule         = "17 3 * * *"
  time_zone        = "Etc/UTC"
  attempt_deadline = "900s"

  retry_config {
    retry_count          = 3
    min_backoff_duration = "30s"
    max_backoff_duration = "300s"
    max_doublings        = 3
  }

  http_target {
    uri         = "${var.worker_public_url}/internal/maintenance"
    http_method = "POST"
    oidc_token {
      service_account_email = google_service_account.scheduler_invoker.email
      audience              = var.worker_public_url
    }
  }

  depends_on = [google_cloud_run_v2_service_iam_member.scheduler_invoker]
}

# Public checks deliberately use real customer/agent routes instead of
# /healthz, whose Cloud Run startup-probe handling is not a reliable edge smoke.
resource "google_monitoring_uptime_check_config" "public" {
  for_each = var.enable_monitoring ? {
    web = {
      host    = var.web_domain
      path    = "/"
      content = "Clip Subtitles"
    }
    api = {
      host    = var.api_domain
      path    = "/llms.txt"
      content = "ClipSubtitles"
    }
  } : {}

  project            = var.project_id
  display_name       = "${local.name}-${each.key}-public"
  checker_type       = "STATIC_IP_CHECKERS"
  period             = "60s"
  timeout            = "10s"
  selected_regions   = ["USA", "EUROPE", "ASIA_PACIFIC"]
  log_check_failures = true
  user_labels        = local.labels

  monitored_resource {
    type = "uptime_url"
    labels = {
      host       = each.value.host
      project_id = var.project_id
    }
  }

  http_check {
    path           = each.value.path
    port           = 443
    request_method = "GET"
    use_ssl        = true
    validate_ssl   = true
  }

  content_matchers {
    content = each.value.content
    matcher = "CONTAINS_STRING"
  }

  lifecycle {
    precondition {
      condition     = var.environment != "production" || length(var.alert_notification_channel_ids) > 0
      error_message = "Production monitoring requires at least one verified alert_notification_channel_id."
    }
  }

  depends_on = [google_project_service.required]
}

resource "google_monitoring_alert_policy" "public_uptime" {
  for_each = google_monitoring_uptime_check_config.public

  project               = var.project_id
  display_name          = "${local.name}: ${each.key} public route unavailable"
  combiner              = "OR"
  enabled               = true
  notification_channels = var.alert_notification_channel_ids
  user_labels           = local.labels

  conditions {
    display_name = "Fewer than half of regional checks pass for two minutes"
    condition_threshold {
      filter          = "metric.type=\"monitoring.googleapis.com/uptime_check/check_passed\" AND resource.type=\"uptime_url\" AND metric.label.check_id=\"${each.value.uptime_check_id}\""
      comparison      = "COMPARISON_LT"
      threshold_value = 0.5
      duration        = "120s"

      aggregations {
        alignment_period   = "120s"
        per_series_aligner = "ALIGN_FRACTION_TRUE"
        # ALIGN_FRACTION_TRUE emits a DOUBLE ratio even though the raw metric is
        # BOOL, so the regional reduction must average those aligned ratios.
        cross_series_reducer = "REDUCE_MEAN"
      }
    }
  }

  alert_strategy {
    auto_close = "1800s"
  }

  documentation {
    content   = "Customer-facing ${each.key} availability is below the launch threshold. Check Cloud Run revisions, load-balancer routing, provider health and recent deploys; roll back to the recorded known-good revision if the candidate caused the incident."
    mime_type = "text/markdown"
  }
}

resource "google_logging_metric" "cloud_run_5xx" {
  count = var.enable_monitoring ? 1 : 0

  project = var.project_id
  name    = "${local.name}-cloud-run-5xx"
  filter  = "resource.type=\"cloud_run_revision\" AND resource.labels.service_name=~\"${local.name}-(api|web|worker)\" AND httpRequest.status>=500"

  metric_descriptor {
    metric_kind = "DELTA"
    value_type  = "INT64"
    unit        = "1"
  }

  depends_on = [google_project_service.required]
}

resource "google_logging_metric" "worker_task_failure" {
  count = var.enable_monitoring ? 1 : 0

  project = var.project_id
  name    = "${local.name}-worker-task-failure"
  filter  = "resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"${local.name}-worker\" AND jsonPayload.msg=\"task failed\""

  metric_descriptor {
    metric_kind = "DELTA"
    value_type  = "INT64"
    unit        = "1"
  }

  depends_on = [google_project_service.required]
}

resource "google_monitoring_alert_policy" "cloud_run_5xx" {
  count = var.enable_monitoring ? 1 : 0

  project               = var.project_id
  display_name          = "${local.name}: Cloud Run 5xx responses"
  combiner              = "OR"
  enabled               = true
  notification_channels = var.alert_notification_channel_ids
  user_labels           = local.labels

  conditions {
    display_name = "At least one 5xx in five minutes"
    condition_threshold {
      filter          = "metric.type=\"logging.googleapis.com/user/${google_logging_metric.cloud_run_5xx[0].name}\" AND resource.type=\"cloud_run_revision\""
      comparison      = "COMPARISON_GT"
      threshold_value = 0
      duration        = "0s"

      aggregations {
        alignment_period   = "300s"
        per_series_aligner = "ALIGN_SUM"
      }
    }
  }

  alert_strategy { auto_close = "1800s" }
}

resource "google_monitoring_alert_policy" "worker_task_failure" {
  count = var.enable_monitoring ? 1 : 0

  project               = var.project_id
  display_name          = "${local.name}: paid task failure"
  combiner              = "OR"
  enabled               = true
  notification_channels = var.alert_notification_channel_ids
  user_labels           = local.labels

  conditions {
    display_name = "At least one worker task failed in five minutes"
    condition_threshold {
      filter          = "metric.type=\"logging.googleapis.com/user/${google_logging_metric.worker_task_failure[0].name}\" AND resource.type=\"cloud_run_revision\""
      comparison      = "COMPARISON_GT"
      threshold_value = 0
      duration        = "0s"

      aggregations {
        alignment_period   = "300s"
        per_series_aligner = "ALIGN_SUM"
      }
    }
  }

  alert_strategy { auto_close = "1800s" }
}

resource "google_monitoring_alert_policy" "render_queue_depth" {
  count = var.enable_monitoring ? 1 : 0

  project               = var.project_id
  display_name          = "${local.name}: render queue backlog"
  combiner              = "OR"
  enabled               = true
  notification_channels = var.alert_notification_channel_ids
  user_labels           = local.labels

  conditions {
    display_name = "More than 20 queued tasks for five minutes"
    condition_threshold {
      filter          = "metric.type=\"cloudtasks.googleapis.com/queue/depth\" AND resource.type=\"cloud_tasks_queue\" AND resource.label.queue_id=\"${google_cloud_tasks_queue.renders.name}\""
      comparison      = "COMPARISON_GT"
      threshold_value = 20
      duration        = "300s"

      aggregations {
        alignment_period   = "60s"
        per_series_aligner = "ALIGN_MAX"
      }
    }
  }

  alert_strategy { auto_close = "1800s" }
}
