output "artifact_bucket_name" {
  description = "GCS bucket name for HTML artifacts."
  value       = google_storage_bucket.artifacts.name
}

output "structured_output_bucket_name" {
  description = "GCS bucket name for normalized JSON output."
  value       = google_storage_bucket.structured_output.name
}

output "control_plane_pubsub_topic_name" {
  description = "Pub/Sub topic name used by the control-plane broker adapter."
  value       = google_pubsub_topic.control_plane_events.name
}
