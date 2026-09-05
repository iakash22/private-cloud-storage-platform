import { GenericContainer, Wait, type StartedTestContainer } from 'testcontainers';

/**
 * A real MinIO container for S3 compatibility tests.
 *
 * MinIO is a *test* dependency only. It exists here to prove the
 * S3CompatibleStorageProvider speaks S3 correctly against a real endpoint; the
 * local filesystem provider never touches it.
 *
 * Built on GenericContainer rather than a new dependency, since
 * `testcontainers` is already used for PostgreSQL.
 */
export interface TestMinio {
  container: StartedTestContainer;
  endpoint: string;
  region: string;
  accessKey: string;
  secretKey: string;
  forcePathStyle: true;
  stop: () => Promise<void>;
}

const ROOT_USER = 'vaultstack_test';
// Test-only credentials, scoped to an ephemeral container per run.
const ROOT_PASSWORD = 'vaultstack_test_secret';

export async function startTestMinio(): Promise<TestMinio> {
  const container = await new GenericContainer('minio/minio:RELEASE.2024-12-18T13-15-44Z')
    .withEnvironment({
      MINIO_ROOT_USER: ROOT_USER,
      MINIO_ROOT_PASSWORD: ROOT_PASSWORD,
    })
    .withCommand(['server', '/data', '--console-address', ':9001'])
    .withExposedPorts(9000)
    // MinIO reports readiness on its own health endpoint, which avoids the
    // flakiness of racing the first S3 call against startup.
    .withWaitStrategy(Wait.forHttp('/minio/health/live', 9000).forStatusCode(200))
    .withStartupTimeout(120_000)
    .start();

  const endpoint = `http://${container.getHost()}:${String(container.getMappedPort(9000))}`;

  return {
    container,
    endpoint,
    region: 'us-east-1',
    accessKey: ROOT_USER,
    secretKey: ROOT_PASSWORD,
    // MinIO does not serve virtual-host style buckets by default.
    forcePathStyle: true,
    stop: async () => {
      await container.stop();
    },
  };
}
