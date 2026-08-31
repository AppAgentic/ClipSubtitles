mock_provider "google" {}

run "production_identifiers_and_isolation" {
  command = plan

  variables {
    project_id              = "clipsubtitles-production"
    environment             = "production"
    deploy_services         = false
    image_tag               = "production-test"
    runtime_config_revision = "production-test"
    object_store_driver     = "r2"
    r2_bucket               = "clipsubtitles-media-production"
    r2_endpoint             = "https://example-account.r2.cloudflarestorage.com"
  }

  assert {
    condition     = google_service_account.worker.account_id == "clipsubtitles-worker-prod"
    error_message = "Production worker service-account id must fit GCP's 30-character limit."
  }

  assert {
    condition     = google_service_account.api.account_id == "clipsubtitles-api-prod"
    error_message = "Production service accounts must use the isolated prod suffix."
  }

  assert {
    condition     = google_secret_manager_secret.runtime["postgres-password"].secret_id == "clipsubtitles-production-postgres-password"
    error_message = "Production secrets must retain the full environment name for isolation."
  }
}
