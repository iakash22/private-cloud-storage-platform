import { describe, expect, it } from 'vitest';
import { loadOpenApiDocument } from './index.js';

describe('loadOpenApiDocument', () => {
  it('loads a valid OpenAPI 3 document with expected metadata', () => {
    const document = loadOpenApiDocument({ refresh: true });

    expect(document.openapi).toMatch(/^3\.(0|1)\.\d+$/);
    expect(document.info).toMatchObject({
      title: 'VaultStack API',
      version: expect.any(String),
    });
    expect(document.paths).toBeTypeOf('object');
    expect(Object.keys(document.paths as Record<string, unknown>).length).toBeGreaterThan(10);
  });

  it('declares session, CSRF, and bearer security schemes', () => {
    const document = loadOpenApiDocument({ refresh: true });
    const components = document.components as {
      securitySchemes?: Record<string, unknown>;
    };

    expect(components.securitySchemes).toMatchObject({
      sessionCookie: expect.any(Object),
      csrfHeader: expect.any(Object),
      bearerApiKey: expect.any(Object),
    });
  });
});
