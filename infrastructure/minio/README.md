# MinIO

VaultStack uses MinIO for S3-compatible object storage.

Development defaults (see `.env.example`):

- API endpoint: `http://localhost:9000`
- Console: `http://localhost:9001` (do not expose publicly in production)
- Bucket: `vaultstack`

The `minio-init` service in Docker Compose creates the default bucket on startup.
