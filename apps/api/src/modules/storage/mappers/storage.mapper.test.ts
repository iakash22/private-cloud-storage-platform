import { describe, expect, it } from 'vitest';
import { serializeStorageProvider } from './storage.mapper.js';

describe('serializeStorageProvider', () => {
  it('never returns secret material', () => {
    const publicProvider = serializeStorageProvider({
      id: 'provider-1',
      organizationId: 'org-1',
      name: 'minio',
      type: 'S3_COMPATIBLE',
      status: 'ACTIVE',
      isDefault: false,
      config: {
        dialect: 'MINIO',
        endpoint: 'http://127.0.0.1:9000',
        region: 'us-east-1',
        forcePathStyle: true,
        tls: false,
      },
      credentialRef: null,
      accessKeyId: 'minioadmin',
      secretCiphertext: 'ciphertext-must-not-leak',
      createdAt: new Date('2026-09-08T00:00:00.000Z'),
      updatedAt: new Date('2026-09-08T00:00:00.000Z'),
    });

    const serialized = JSON.stringify(publicProvider);

    expect(serialized).not.toContain('ciphertext-must-not-leak');
    expect(serialized).not.toContain('secretCiphertext');
    expect(serialized).not.toContain('secretNonce');
    expect(serialized).not.toContain('secretAccessKey');
    expect(publicProvider.hasSecret).toBe(true);
    expect(publicProvider.credentialsSource).toBe('stored');
    expect(publicProvider.accessKeyId).toBe('minioadmin');
    expect(publicProvider.dialect).toBe('MINIO');
    expect(publicProvider.endpoint).toBe('http://127.0.0.1:9000');
  });
});
