import { z } from 'zod';
import {
  emailSchema,
  nameSchema,
  organizationNameSchema,
  passwordSchema,
} from './common.schemas.js';

export const registerBodySchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  name: nameSchema,
  organizationName: organizationNameSchema,
});

export const loginBodySchema = z.object({
  email: emailSchema,
  password: z.string().min(1),
});

export const selectOrganizationBodySchema = z.object({
  organizationId: z.string().min(1),
});

export const totpOrBackupCodeSchema = z
  .string()
  .trim()
  .min(6, 'Enter a 6-digit code or a backup code')
  .max(24, 'Enter a 6-digit code or a backup code');

export const totpEnrollmentCodeSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, 'Enter the 6-digit authenticator code');

export const verifyTotpLoginBodySchema = z.object({
  challengeToken: z.string().min(1, 'Authenticator challenge is required'),
  code: totpOrBackupCodeSchema,
});

export const enableTotpBodySchema = z.object({
  code: totpEnrollmentCodeSchema,
});

export const disableTotpBodySchema = z.object({
  password: z.string().min(1, 'Password is required'),
  code: totpOrBackupCodeSchema,
});

export type RegisterBody = z.infer<typeof registerBodySchema>;
export type LoginBody = z.infer<typeof loginBodySchema>;
export type SelectOrganizationBody = z.infer<typeof selectOrganizationBodySchema>;
export type VerifyTotpLoginBody = z.infer<typeof verifyTotpLoginBodySchema>;
export type EnableTotpBody = z.infer<typeof enableTotpBodySchema>;
export type DisableTotpBody = z.infer<typeof disableTotpBodySchema>;
