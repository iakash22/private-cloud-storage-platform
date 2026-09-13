import { ApiClientError } from '@vaultstack/api-client';
import type { FieldErrorMap } from '@vaultstack/validation';
import { useCallback, useState } from 'react';
import { useToast } from '@vaultstack/ui';

export type { FieldErrorMap };

export function parseRequestError(error: unknown): {
  message: string;
  code?: string;
  fields: FieldErrorMap;
  status?: number;
  sessionHandled?: boolean;
} {
  if (error instanceof ApiClientError) {
    if (error.status >= 500) {
      return {
        message: 'Internal server error',
        code: error.code,
        fields: {},
        status: error.status,
        sessionHandled: error.sessionHandled,
      };
    }

    if (error.status === 404) {
      return {
        message: error.message?.trim() || 'Not found',
        code: error.code,
        fields: error.fields ?? {},
        status: error.status,
        sessionHandled: error.sessionHandled,
      };
    }

    return {
      message: error.message?.trim() || 'Request failed',
      code: error.code,
      fields: error.fields ?? {},
      status: error.status,
      sessionHandled: error.sessionHandled,
    };
  }

  if (error instanceof Error) {
    const message = error.message?.trim();
    if (message) {
      return { message, fields: {} };
    }
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
    setFieldErrors(fields ?? {});
    return undefined;
  }, []);

  const validate = useCallback(
    <T>(parsed: { ok: true; data: T } | { ok: false; fields: FieldErrorMap }): T | undefined => {
      if (!parsed?.ok) {
        return applyFields(parsed?.fields ?? {});
      }

      setFieldErrors({});
      return parsed.data;
    },
    [applyFields],
  );

  const catchError = useCallback(
    (caught: unknown): void => {
      const parsed = parseRequestError(caught);

      // SessionGuard already toasted + redirected for expired sessions.
      if (parsed.sessionHandled) {
        setFieldErrors({});
        return;
      }

      const fields = parsed.fields ?? {};
      if (Object.keys(fields).length > 0) {
        setFieldErrors(fields);
      } else {
        setFieldErrors({});
      }

      toast.error(parsed.message || 'Request failed');
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
    hasFieldError: (name: string) => Boolean(fieldErrors?.[name]?.trim()),
  };
}
