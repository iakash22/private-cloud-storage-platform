import { readFile } from 'node:fs/promises';
import { VaultStackApiClient } from '@vaultstack/api-client';

const required = (name) => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
};

const client = new VaultStackApiClient({
  baseUrl: required('VS_API'),
  apiKey: required('VS_KEY'),
});

const version = await client.uploadArtifact({
  projectId: required('VS_PROJECT_ID'),
  buildId: required('VS_BUILD_ID'),
  name: process.env.VS_ARTIFACT_NAME ?? 'node-smoke',
  fileName: process.env.VS_FILE ?? 'smoke.txt',
  body: await readFile(process.env.VS_FILE ?? 'smoke.txt'),
  contentType: 'application/octet-stream',
});

console.log(JSON.stringify({ id: version.id, status: version.status }, null, 2));
