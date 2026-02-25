terraform {
  backend "gcs" {
    bucket = "jobcompass-tfstate-001"
    prefix = "env/prod"
  }
}
