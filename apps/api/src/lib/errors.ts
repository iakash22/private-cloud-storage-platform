import type { ApiErrorCode } from '@vaultstack/types';

export class AppError extends Error {
  readonly statusCode: number;
  readonly code: ApiErrorCode;
  readonly retryAfterSeconds?: number;

  constructor(statusCode: number, code: ApiErrorCode, message: string, retryAfterSeconds?: number) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export function unauthorized(message = 'Authentication is required'): AppError {
  return new AppError(401, 'UNAUTHORIZED', message);
}

export function forbidden(message = 'You do not have permission to perform this action'): AppError {
  return new AppError(403, 'FORBIDDEN', message);
}

export function notFound(message = 'Resource not found'): AppError {
  return new AppError(404, 'NOT_FOUND', message);
}

export function conflict(message: string): AppError {
  return new AppError(409, 'CONFLICT', message);
}

export function validationError(message: string): AppError {
  return new AppError(400, 'VALIDATION_ERROR', message);
}

export function rateLimited(retryAfterSeconds: number): AppError {
  return new AppError(
    429,
    'RATE_LIMITED',
    `Too many requests. Try again in ${retryAfterSeconds} seconds`,
    retryAfterSeconds,
  );
}

export function payloadTooLarge(message = 'Request body is too large'): AppError {
  return new AppError(413, 'PAYLOAD_TOO_LARGE', message);
}

export function organizationContextRequired(): AppError {
  return new AppError(
    400,
    'ORGANIZATION_CONTEXT_REQUIRED',
    'Select an organization before using storage endpoints',
  );
}

export function storageBucketNotFound(): AppError {
  return new AppError(404, 'STORAGE_BUCKET_NOT_FOUND', 'Bucket not found');
}

export function storageBucketNotEmpty(): AppError {
  return new AppError(409, 'STORAGE_BUCKET_NOT_EMPTY', 'Bucket still contains objects');
}

export function storageObjectNotFound(): AppError {
  return new AppError(404, 'STORAGE_OBJECT_NOT_FOUND', 'Object not found');
}

export function storageAccessDenied(message = 'Storage access denied'): AppError {
  return new AppError(403, 'STORAGE_ACCESS_DENIED', message);
}

export function storageProviderUnavailable(message = 'Storage provider is unavailable'): AppError {
  return new AppError(503, 'STORAGE_PROVIDER_UNAVAILABLE', message);
}

export function storageProviderNotFound(): AppError {
  return new AppError(404, 'STORAGE_PROVIDER_NOT_FOUND', 'Storage provider not found');
}

export function storageUploadFailed(message = 'Object upload failed'): AppError {
  return new AppError(500, 'STORAGE_UPLOAD_FAILED', message);
}

export function storageUploadNotFound(): AppError {
  return new AppError(404, 'STORAGE_UPLOAD_NOT_FOUND', 'Upload not found');
}

export function storageUploadExpired(): AppError {
  return new AppError(410, 'STORAGE_UPLOAD_EXPIRED', 'Upload has expired');
}

export function storageUploadInvalidState(message: string): AppError {
  return new AppError(409, 'STORAGE_UPLOAD_INVALID_STATE', message);
}

export function storageChecksumMismatch(): AppError {
  return new AppError(
    422,
    'STORAGE_CHECKSUM_MISMATCH',
    'Uploaded data did not match the expected checksum',
  );
}

export function storageChecksumUnverifiable(): AppError {
  return new AppError(
    422,
    'STORAGE_CHECKSUM_UNVERIFIABLE',
    'The upload did not stream through VaultStack, so the supplied checksum could not be verified',
  );
}

export function storageSizeMismatch(): AppError {
  return new AppError(
    422,
    'STORAGE_SIZE_MISMATCH',
    'Uploaded data did not match the expected size',
  );
}

export function storageObjectTooLarge(maxSizeBytes: number): AppError {
  return new AppError(
    413,
    'STORAGE_OBJECT_TOO_LARGE',
    `Object exceeds the maximum allowed size of ${maxSizeBytes} bytes`,
  );
}

export function storageInvalidKey(message = 'Object key is not valid'): AppError {
  return new AppError(400, 'STORAGE_INVALID_KEY', message);
}

export function storageInvalidBucketName(message = 'Bucket name is not valid'): AppError {
  return new AppError(400, 'STORAGE_INVALID_BUCKET_NAME', message);
}

export function storageMultipartNotFound(): AppError {
  return new AppError(404, 'STORAGE_MULTIPART_NOT_FOUND', 'Multipart upload not found');
}

export function storageMultipartInvalidPart(message: string): AppError {
  return new AppError(400, 'STORAGE_MULTIPART_INVALID_PART', message);
}

export function storageNotImplemented(message: string): AppError {
  return new AppError(501, 'STORAGE_NOT_IMPLEMENTED', message);
}

export function shareLinkNotFound(): AppError {
  return new AppError(404, 'SHARE_LINK_NOT_FOUND', 'Share link not found');
}

export function shareLinkExpired(): AppError {
  return new AppError(410, 'SHARE_LINK_EXPIRED', 'This share link has expired');
}

export function shareLinkRevoked(): AppError {
  return new AppError(403, 'SHARE_LINK_REVOKED', 'This share link has been revoked');
}

export function sharePasswordRequired(): AppError {
  return new AppError(401, 'SHARE_PASSWORD_REQUIRED', 'This share link requires a password');
}

export function sharePasswordInvalid(): AppError {
  return new AppError(403, 'SHARE_PASSWORD_INVALID', 'Share password is incorrect');
}

export function shareDownloadLimitReached(): AppError {
  return new AppError(
    403,
    'SHARE_DOWNLOAD_LIMIT_REACHED',
    'This share link has reached its download limit',
  );
}

export function shareAccessDenied(message = 'You cannot access this share'): AppError {
  return new AppError(403, 'SHARE_ACCESS_DENIED', message);
}

export function artifactProjectNotFound(): AppError {
  return new AppError(404, 'ARTIFACT_PROJECT_NOT_FOUND', 'Project not found');
}

export function artifactBuildNotFound(): AppError {
  return new AppError(404, 'ARTIFACT_BUILD_NOT_FOUND', 'Build not found');
}

export function artifactNotFound(): AppError {
  return new AppError(404, 'ARTIFACT_NOT_FOUND', 'Artifact not found');
}

export function artifactVersionNotFound(): AppError {
  return new AppError(404, 'ARTIFACT_VERSION_NOT_FOUND', 'Artifact version not found');
}

export function artifactReleaseConflict(
  message = 'A release with that tag already exists in this project',
): AppError {
  return new AppError(409, 'ARTIFACT_RELEASE_CONFLICT', message);
}
