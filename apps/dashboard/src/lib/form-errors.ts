import { ApiClientError } from '@vaultstack/api-client';
import type { FieldErrorMap } from '@vaultstack/validation';
import { useCallback, useState } from 'react';
import { useToast } from '@vaultstack/ui';

export type { FieldErrorMap };

export function parseRequestError(error: unknown): {
  message: string;
  code?: string;
  fields: FieldErrorMap;
} {
  if (error instanceof ApiClientError) {
    return {
      message: error.message,
      code: error.code,
      fields: error.fields ?? {},
    };
  }

  if (error instanceof Error && error.message?.trim().length > 0) {
    return { message: error.message, fields: {} };
  }

  return { message: 'Request failed', fields: {} };
}

export function useFormSubmit() {
  const toast = useToast();
  const [fieldErrors, setFieldErrors] = useState<FieldErrorMap>({});

  const clearFieldErrors = useCallback(() => {
    setFieldErrors({});
  }, []);

  const applyFields = useCallback((fields: FieldErrorMap): undefined => {
    setFieldErrors(fields);
    return undefined;
  }, []);

  const validate = useCallback(
    <T>(parsed: { ok: true; data: T } | { ok: false; fields: FieldErrorMap }): T | undefined => {
      if (!parsed.ok) {
        return applyFields(parsed.fields);
      }

      setFieldErrors({});
      return parsed.data;
    },
    [applyFields],
  );

  const catchError = useCallback(
    (caught: unknown): void => {
      const parsed = parseRequestError(caught);
      const fields = parsed.fields ?? {};
      if (Object.keys(fields).length > 0) {
        setFieldErrors(fields);
        return;
      }

      setFieldErrors({});
      toast.error(parsed.message);
    },
    [toast],
  );

  return {
    fieldErrors,
    setFieldErrors,
    clearFieldErrors,
    validate,
    catchError,
    toastSuccess: toast.success,
  };
}
