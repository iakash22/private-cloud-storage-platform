import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

export interface OpenApiInfo {
  title: string;
  version: string;
  [key: string]: unknown;
}

export interface OpenApiComponents {
  securitySchemes?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface OpenApiDocument {
  openapi?: string;
  info?: OpenApiInfo;
  paths?: Record<string, unknown>;
  components?: OpenApiComponents;
  [key: string]: unknown;
}

let cachedDocument: OpenApiDocument | undefined;

function resolveSpecPath(): string {
  const moduleDir = dirname(fileURLToPath(import.meta.url));
  return join(moduleDir, '../spec/openapi.yaml');
}

export function loadOpenApiDocument(options: { refresh?: boolean } = {}): OpenApiDocument {
  if (!options.refresh && cachedDocument) {
    return cachedDocument;
  }

  const raw = readFileSync(resolveSpecPath(), 'utf8');
  const document = parse(raw) as OpenApiDocument;
  cachedDocument = document;
  return document;
}

export const openApiDocument = loadOpenApiDocument();
