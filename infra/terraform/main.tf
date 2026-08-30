locals {
  name         = "clipsubtitles-${var.environment}"
  repository   = "clipsubtitles"
  labels       = { product = "clipsubtitles", environment = var.environment, managed_by = "terraform" }
  api_image    = "${var.region}-docker.pkg.dev/${var.project_id}/${local.repository}/api:${var.image_tag}"
  worker_image = "${var.region}-docker.pkg.dev/${var.project_id}/${local.repository}/worker:${var.image_tag}"
  web_image    = "${var.region}-docker.pkg.dev/${var.project_id}/${local.repository}/web:${var.image_tag}"
  api_secret_names = toset([
    "auth-local-secret",
    "workos-api-key",
    "workos-client-id",
    "workos-authkit-issuer",
    "workos-webhook-secret",
    "postgres-password",
    "r2-access-key-id",
    "r2-secret-access-key",
  ])
  worker_secret_names = setunion(local.api_secret_names, toset([
    "elevenlabs-api-key",
    "gemini-api-key",
  ]))
}

resource "google_project_service" "required" {
  for_each = toset([
    "artifactregistry.googleapis.com",
    "cloudbuild.googleapis.com",
    "run.googleapis.com",
    "cloudtasks.googleapis.com",
    "cloudscheduler.googleapis.com",
    "cloudresourcemanager.googleapis.com",
    "apikeys.googleapis.com",
    "generativelanguage.googleapis.com",
    "iam.googleapis.com",
    "iamcredentials.googleapis.com",
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
  account_id   = "clipsubtitles-api-${var.environment}"
  display_name = "ClipSubtitles API (${var.environment})"
}

resource "google_service_account" "worker" {
  account_id   = "clipsubtitles-worker-${var.environment}"
  display_name = "ClipSubtitles render worker (${var.environment})"
}

resource "google_service_account" "web" {
  account_id   = "clipsubtitles-web-${var.environment}"
  display_name = "ClipSubtitles web (${var.environment})"
}

resource "google_service_account" "build" {
  account_id   = "clipsubtitles-build-${var.environment}"
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
  account_id   = "clipsubtitles-tasks-${var.environment}"
  display_name = "ClipSubtitles Cloud Tasks invoker (${var.environment})"
}

resource "google_service_account" "scheduler_invoker" {
  account_id   = "clipsubtitles-maint-${var.environment}"
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
  for_each  = local.worker_secret_names
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
  for_each  = google_secret_manager_secret.runtime
  secret_id = each.value.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.worker.email}"
}

resource "google_cloud_run_v2_service" "api" {
  count                = var.deploy_services ? 1 : 0
  name                 = "${local.name}-api"
  location             = var.region
  ingress              = "INGRESS_TRAFFIC_ALL"
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
        name  = "AUTH_MODE"
        value = "workos"
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
  }
  depends_on = [google_artifact_registry_repository.images]
}

resource "google_cloud_run_v2_service" "web" {
  count                = var.deploy_services ? 1 : 0
  name                 = "${local.name}-web"
  location             = var.region
  ingress              = "INGRESS_TRAFFIC_ALL"
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
