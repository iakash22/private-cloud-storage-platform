# Dashboard walkthrough

The dashboard is the quickest way to establish organization context before
automating VaultStack.

## Storage

1. Open **Storage → Providers** and confirm the default provider. The local
   filesystem provider stores bytes under the server's configured
   `STORAGE_LOCAL_ROOT`; it does not need S3 keys.
2. Open **Storage → Buckets** and create a logical VaultStack bucket. A logical
   bucket is separate from an existing bucket at an external S3 provider.
3. Select a bucket to inspect objects, versioning, and storage details.

## Artifacts

1. Open **Artifacts → Projects** and create a project.
2. Create a build. Git ref and commit SHA are optional metadata.
3. Upload an artifact from the build page. Artifact bytes are stored in the
   organization's automatic `vs-artifacts` bucket.

For CI or an external app, use the [SDK client guide](./sdk-client.md) instead
of reproducing the browser upload flow.

## Access

Open **Access → API keys**, create a key, and copy it immediately. The token is
shown once. Use it as `Authorization: Bearer vs_ak_…` for REST automation.
Use **service-account S3 credentials** only when an AWS-compatible bucket API is
the right integration.

The dashboard keeps using session cookies and CSRF protection. API keys are for
your apps, scripts, and CI jobs.
