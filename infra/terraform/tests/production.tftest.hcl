mock_provider "google" {}

run "production_identifiers_and_isolation" {
  command = plan

  variables {
    project_id              = "clipsubtitles-production"
    environment             = "production"
    deploy_services         = true
    allow_unauthenticated   = true
    deploy_public_edge      = true
    worker_public_url       = "https://worker-test-uc.a.run.app"
    image_tag               = "production-test"
    runtime_config_revision = "production-test"
    object_store_driver     = "r2"
    r2_bucket               = "clipsubtitles-media-production"
    r2_endpoint             = "https://example-account.r2.cloudflarestorage.com"
    enable_monitoring       = true
    alert_notification_channel_ids = [
      "projects/clipsubtitles-production/notificationChannels/test-channel",
    ]
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


  assert {
    condition     = length(google_monitoring_uptime_check_config.public) == 2
    error_message = "Paid production must monitor both the public web and API routes."
  }

  assert {
    condition     = length(google_monitoring_alert_policy.public_uptime) == 2
    error_message = "Every public uptime check must have an alert policy."
  }

  assert {
    condition     = length(google_monitoring_alert_policy.cloud_run_5xx[0].notification_channels) == 1 && contains(google_monitoring_alert_policy.cloud_run_5xx[0].notification_channels, "projects/clipsubtitles-production/notificationChannels/test-channel")
    error_message = "Paid-traffic alerts must route to the verified production notification channel."
  }

  assert {
    condition     = google_cloud_run_v2_service.api[0].ingress == "INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER"
    error_message = "Production API traffic must not bypass the protected HTTPS edge through run.app."
  }

  assert {
    condition     = length(google_compute_security_policy.api) == 1
    error_message = "Production must create the distributed API rate-limit policy."
  }
}
