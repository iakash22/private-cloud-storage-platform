import { z, type ZodType } from 'zod';

export type FieldErrorMap = Record<string, string>;

export function fieldErrorsFromZod(error: z.ZodError): FieldErrorMap {
  const fields: FieldErrorMap = {};

  for (const issue of error.issues) {
    const key = issue.path
      .filter((segment) => typeof segment === 'string' || typeof segment === 'number')
      .join('.');

    if (!key || fields[key]) {
      continue;
    }

    fields[key] = issue.message;
  }

  return fields;
}

export function formatZodError(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join('.') || 'body'}: ${issue.message}`)
    .join('; ');
}

export function parseForm<T>(
  schema: ZodType<T>,
  value: unknown,
): { ok: true; data: T } | { ok: false; fields: FieldErrorMap } {
  const result = schema.safeParse(value);
  if (result.success) {
    return { ok: true, data: result.data };
  }

  return { ok: false, fields: fieldErrorsFromZod(result.error) };
}
