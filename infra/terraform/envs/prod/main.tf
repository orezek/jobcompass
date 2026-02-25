provider "google" {
  project = "gen-lang-client-0639699940"
  region  = "europe-west3" # Frankfurt
}

# A simple test resource to verify the CI/CD pipeline works
resource "google_storage_bucket" "test_deployment_bucket" {
  # Note: Bucket names must be globally unique across all of GCP,
  # so feel free to change "998877" to some random numbers!
  name          = "jobcompass-prod-test-bucket-998878"
  # Keep data strictly in Frankfurt
  location      = "europe-west3"
  force_destroy = true
}