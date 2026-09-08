import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/integration/**/*.test.ts'],
    testTimeout: 120_000,
    hookTimeout: 120_000,
    env: {
      // Docker Engine 29 rejects older client API versions. dockerode/testcontainers
      // otherwise fail with "Could not find a working container runtime strategy".
      DOCKER_API_VERSION: process.env.DOCKER_API_VERSION ?? '1.44',
    },
  },
});
