# Storage documentation

VaultStack owns its storage abstraction. Local Linux filesystem storage is the
primary production backend; S3-compatible services are integrations, and MinIO
is optional.

| Document                                       | Contents                                                                                                                            |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| [architecture.md](./architecture.md)           | Provider abstraction, bucket/object model, upload and download flows, streaming, consistency, security model, environment variables |
| [local-filesystem.md](./local-filesystem.md)   | The primary backend: layout, path safety, streaming, durability, signed URLs                                                        |
| [s3-compatibility.md](./s3-compatibility.md)   | S3-compatible provider, the S3 gateway and its supported subset, ETag semantics, connecting external clients                        |
| [s3-gateway.md](./s3-gateway.md)               | Phase 5 S3 gateway endpoint, SigV4 authentication, credential lifecycle, supported operations, security model                       |
| [minio-development.md](./minio-development.md) | Running MinIO for development and integration testing                                                                               |

API endpoints are listed in [../api/README.md](../api/README.md).
