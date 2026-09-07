import { describe, expect, it } from 'vitest';
import { loadOpenApiDocument } from './index.js';

describe('loadOpenApiDocument', () => {
  it('loads a valid OpenAPI 3 document with expected metadata', () => {
    const document = loadOpenApiDocument({ refresh: true });

    expect(document.openapi).toMatch(/^3\.(0|1)\.\d+$/);
    expect(document.info?.title).toBe('VaultStack API');
    expect(typeof document.info?.version).toBe('string');
    expect(document.paths).toBeTypeOf('object');
    expect(Object.keys(document.paths ?? {}).length).toBeGreaterThan(10);
  });

  it('declares session, CSRF, and bearer security schemes', () => {
    const document = loadOpenApiDocument({ refresh: true });

    expect(document.components?.securitySchemes?.sessionCookie).toBeDefined();
    expect(document.components?.securitySchemes?.csrfHeader).toBeDefined();
    expect(document.components?.securitySchemes?.bearerApiKey).toBeDefined();
  });
});
