export function sanitizeArtifactFileName(name: string): string {
  const base = name.replace(/\\/g, '/').split('/').pop() ?? name;
  const cleaned = base
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/^\.+/, '')
    .slice(0, 200);
  return cleaned.length > 0 ? cleaned : 'artifact.bin';
}

export function artifactObjectKey(input: {
  projectId: string;
  buildId: string;
  artifactId: string;
  versionId: string;
  fileName: string;
}): string {
  return [
    'ci',
    input.projectId,
    input.buildId,
    input.artifactId,
    input.versionId,
    sanitizeArtifactFileName(input.fileName),
  ].join('/');
}
