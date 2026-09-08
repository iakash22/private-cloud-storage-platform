import {
  CSRF_HEADER_NAME,
  ORGANIZATION_HEADER_NAME,
  type AuthSessionPayload,
  type HealthResponse,
  type InitiatedUpload,
  type MultipartPartTransferDescriptor,
  type MultipartUploadStatusName,
  type PublicBucket,
  type PublicMultipartPart,
  type PublicMultipartSession,
  type PublicMultipartSessionDetail,
  type PublicMultipartSessionListPage,
  type PublicObjectListPage,
  type PublicObjectVersion,
  type PublicObjectVersionListPage,
  type PublicPresignedUrl,
  type PublicStorageObject,
  type PublicStoragePolicy,
  type ReadinessResponse,
  type StorageLifecycleActionName,
} from '@vaultstack/types';
import { ApiClientError } from './errors.js';
import { defaultHttpFetch, type HttpFetch, type HttpRequestInit } from './http.js';
import {
  uploadMultipartFile,
  type UploadMultipartFileOptions,
} from './multipart-upload.js';
import { uploadBlobWithProgress, type UploadWithProgressOptions } from './upload-with-progress.js';

export interface ApiClientOptions {
  baseUrl: string;
  fetchImpl?: HttpFetch;
  credentials?: HttpRequestInit['credentials'];
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
  organizationId?: string;
  csrfToken?: string;
}

export interface ListObjectsParams {
  prefix?: string;
  delimiter?: string;
  limit?: number;
  cursor?: string;
}

export type { UploadProgressEvent } from './upload-with-progress.js';
export type {
  MultipartUploadController,
  MultipartUploadProgressEvent,
  UploadMultipartFileOptions,
} from './multipart-upload.js';

export class VaultStackApiClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: HttpFetch;
  private readonly credentials: NonNullable<HttpRequestInit['credentials']>;
  private csrfToken?: string;
  private organizationId?: string;

  constructor(options: ApiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.fetchImpl = options.fetchImpl ?? defaultHttpFetch;
    this.credentials = options.credentials ?? 'include';
  }

  setCsrfToken(token: string | undefined): void {
    this.csrfToken = token;
  }

  setOrganizationId(organizationId: string | undefined): void {
    this.organizationId = organizationId;
  }

  getCsrfToken(): string | undefined {
    return this.csrfToken;
  }

  getOrganizationId(): string | undefined {
    return this.organizationId;
  }

  async getHealth(): Promise<HealthResponse> {
    return this.request<HealthResponse>('GET', '/health');
  }

  async getReady(): Promise<ReadinessResponse> {
    return this.request<ReadinessResponse>('GET', '/ready');
  }

  async register(input: {
    email: string;
    password: string;
    name: string;
    organizationName: string;
  }): Promise<AuthSessionPayload> {
    const result = await this.request<AuthSessionPayload>('POST', '/api/v1/auth/register', {
      body: input,
    });
    this.applySession(result);
    return result;
  }

  async login(input: { email: string; password: string }): Promise<AuthSessionPayload> {
    const result = await this.request<AuthSessionPayload>('POST', '/api/v1/auth/login', {
      body: input,
    });
    this.applySession(result);
    return result;
  }

  async logout(): Promise<void> {
    await this.request<undefined>('POST', '/api/v1/auth/logout');
    this.csrfToken = undefined;
    this.organizationId = undefined;
  }

  async me(): Promise<AuthSessionPayload> {
    const result = await this.request<AuthSessionPayload>('GET', '/api/v1/auth/me');
    this.applySession(result);
    return result;
  }

  async selectOrganization(organizationId: string): Promise<{ activeOrganizationId: string }> {
    const result = await this.request<{ activeOrganizationId: string }>(
      'POST',
      '/api/v1/auth/organization',
      { body: { organizationId } },
    );
    this.organizationId = result.activeOrganizationId;
    return result;
  }

  async listBuckets(): Promise<PublicBucket[]> {
    const result = await this.request<{ buckets: PublicBucket[] }>('GET', '/api/v1/storage/buckets');
    return result.buckets;
  }

  async createBucket(input: {
    name: string;
    region?: string;
    versioning?: 'UNVERSIONED' | 'ENABLED';
  }): Promise<PublicBucket> {
    const result = await this.request<{ bucket: PublicBucket }>('POST', '/api/v1/storage/buckets', {
      body: input,
    });
    return result.bucket;
  }

  async getBucket(bucketId: string): Promise<PublicBucket> {
    const result = await this.request<{ bucket: PublicBucket }>(
      'GET',
      `/api/v1/storage/buckets/${bucketId}`,
    );
    return result.bucket;
  }

  async deleteBucket(bucketId: string): Promise<void> {
    await this.request<undefined>('DELETE', `/api/v1/storage/buckets/${bucketId}`);
  }

  async setBucketVersioning(
    bucketId: string,
    versioning: 'UNVERSIONED' | 'ENABLED' | 'SUSPENDED',
  ): Promise<PublicBucket> {
    const result = await this.request<{ bucket: PublicBucket }>(
      'PUT',
      `/api/v1/storage/buckets/${bucketId}/versioning`,
      { body: { versioning } },
    );
    return result.bucket;
  }

  async listObjects(bucketId: string, params: ListObjectsParams = {}): Promise<PublicObjectListPage> {
    const search = new URLSearchParams();
    if (params.prefix) {
      search.set('prefix', params.prefix);
    }
    if (params.delimiter) {
      search.set('delimiter', params.delimiter);
    }
    if (params.limit !== undefined) {
      search.set('limit', String(params.limit));
    }
    if (params.cursor) {
      search.set('cursor', params.cursor);
    }

    const query = search.toString();
    const path = `/api/v1/storage/buckets/${bucketId}/objects${query ? `?${query}` : ''}`;
    return this.request<PublicObjectListPage>('GET', path);
  }

  async getObject(objectId: string): Promise<PublicStorageObject> {
    const result = await this.request<{ object: PublicStorageObject }>(
      'GET',
      `/api/v1/storage/objects/${objectId}`,
    );
    return result.object;
  }

  async createDownloadUrl(
    objectId: string,
    input: { versionId?: string } = {},
  ): Promise<PublicPresignedUrl> {
    const result = await this.request<{ download: PublicPresignedUrl }>(
      'POST',
      `/api/v1/storage/objects/${objectId}/download-url`,
      { body: input },
    );
    return result.download;
  }

  async deleteObject(objectId: string, versionId?: string): Promise<void> {
    const query = versionId ? `?versionId=${encodeURIComponent(versionId)}` : '';
    await this.request<undefined>('DELETE', `/api/v1/storage/objects/${objectId}${query}`);
  }

  async listObjectVersions(objectId: string): Promise<PublicObjectVersionListPage> {
    return this.request<PublicObjectVersionListPage>(
      'GET',
      `/api/v1/storage/objects/${objectId}/versions`,
    );
  }

  async getObjectVersion(objectId: string, versionId: string): Promise<PublicObjectVersion> {
    const result = await this.request<{ version: PublicObjectVersion }>(
      'GET',
      `/api/v1/storage/objects/${objectId}/versions/${versionId}`,
    );
    return result.version;
  }

  async restoreObjectVersion(objectId: string, versionId: string): Promise<PublicStorageObject> {
    const result = await this.request<{ object: PublicStorageObject }>(
      'POST',
      `/api/v1/storage/objects/${objectId}/versions/${versionId}/restore`,
    );
    return result.object;
  }

  async deleteObjectVersion(objectId: string, versionId: string): Promise<void> {
    await this.request<undefined>(
      'DELETE',
      `/api/v1/storage/objects/${objectId}/versions/${versionId}`,
    );
  }

  async listPolicies(bucketId?: string): Promise<PublicStoragePolicy[]> {
    const query = bucketId ? `?bucketId=${encodeURIComponent(bucketId)}` : '';
    const result = await this.request<{ policies: PublicStoragePolicy[] }>(
      'GET',
      `/api/v1/storage/policies${query}`,
    );
    return result.policies;
  }

  async createLifecyclePolicy(input: {
    name: string;
    bucketId?: string;
    keyPrefix?: string;
    days: number;
    lifecycleAction: StorageLifecycleActionName;
    enabled?: boolean;
  }): Promise<PublicStoragePolicy> {
    const result = await this.request<{ policy: PublicStoragePolicy }>(
      'POST',
      '/api/v1/storage/policies',
      { body: input },
    );
    return result.policy;
  }

  async getPolicy(policyId: string): Promise<PublicStoragePolicy> {
    const result = await this.request<{ policy: PublicStoragePolicy }>(
      'GET',
      `/api/v1/storage/policies/${policyId}`,
    );
    return result.policy;
  }

  async updateLifecyclePolicy(
    policyId: string,
    input: {
      name?: string;
      keyPrefix?: string | null;
      days?: number;
      lifecycleAction?: StorageLifecycleActionName;
      enabled?: boolean;
    },
  ): Promise<PublicStoragePolicy> {
    const result = await this.request<{ policy: PublicStoragePolicy }>(
      'PATCH',
      `/api/v1/storage/policies/${policyId}`,
      { body: input },
    );
    return result.policy;
  }

  async deletePolicy(policyId: string): Promise<void> {
    await this.request<undefined>('DELETE', `/api/v1/storage/policies/${policyId}`);
  }

  async copyObject(
    objectId: string,
    destination: { destinationBucketId: string; destinationKey: string },
  ): Promise<PublicStorageObject> {
    const result = await this.request<{ object: PublicStorageObject }>(
      'POST',
      `/api/v1/storage/objects/${objectId}/copy`,
      { body: destination },
    );
    return result.object;
  }

  async moveObject(
    objectId: string,
    destination: { destinationBucketId: string; destinationKey: string },
  ): Promise<PublicStorageObject> {
    const result = await this.request<{ object: PublicStorageObject }>(
      'POST',
      `/api/v1/storage/objects/${objectId}/move`,
      { body: destination },
    );
    return result.object;
  }

  async initiateUpload(input: {
    bucketId: string;
    key: string;
    contentType?: string;
    size?: number;
  }): Promise<InitiatedUpload> {
    return this.request<InitiatedUpload>('POST', '/api/v1/storage/uploads/initiate', {
      body: input,
    });
  }

  async completeUpload(
    uploadId: string,
    input: { checksumSha256?: string } = {},
  ): Promise<PublicStorageObject> {
    const result = await this.request<{ object: PublicStorageObject }>(
      'POST',
      `/api/v1/storage/uploads/${uploadId}/complete`,
      { body: input },
    );
    return result.object;
  }

  async abortUpload(uploadId: string): Promise<void> {
    await this.request<undefined>('DELETE', `/api/v1/storage/uploads/${uploadId}`);
  }

  uploadFileWithProgress(
    initiated: InitiatedUpload,
    file: File | Blob,
    options: UploadWithProgressOptions = {},
  ): Promise<void> {
    return uploadBlobWithProgress(initiated, file, options).then(() => undefined);
  }

  async initiateMultipart(input: {
    bucketId: string;
    key: string;
    contentType?: string;
    size: number;
  }): Promise<{
    uploadId: string;
    providerUploadId: string;
    key: string;
    session: PublicMultipartSession;
  }> {
    return this.request('POST', '/api/v1/storage/multipart-uploads', { body: input });
  }

  async getMultipartSession(uploadId: string): Promise<PublicMultipartSessionDetail> {
    const result = await this.request<{ session: PublicMultipartSessionDetail }>(
      'GET',
      `/api/v1/storage/multipart-uploads/${uploadId}`,
    );
    return result.session;
  }

  async listMultipartSessions(params: {
    status?: MultipartUploadStatusName;
    limit?: number;
    cursor?: string;
  } = {}): Promise<PublicMultipartSessionListPage> {
    const search = new URLSearchParams();
    if (params.status) {
      search.set('status', params.status);
    }
    if (params.limit !== undefined) {
      search.set('limit', String(params.limit));
    }
    if (params.cursor) {
      search.set('cursor', params.cursor);
    }
    const query = search.toString();
    return this.request(
      'GET',
      `/api/v1/storage/multipart-uploads${query ? `?${query}` : ''}`,
    );
  }

  async listMultipartParts(uploadId: string): Promise<PublicMultipartPart[]> {
    const result = await this.request<{ parts: PublicMultipartPart[] }>(
      'GET',
      `/api/v1/storage/multipart-uploads/${uploadId}/parts`,
    );
    return result.parts;
  }

  async createPartDestination(
    uploadId: string,
    partNumber: number,
    input: { size?: number; checksumSha256?: string } = {},
  ): Promise<MultipartPartTransferDescriptor> {
    const result = await this.request<{ destination: MultipartPartTransferDescriptor }>(
      'POST',
      `/api/v1/storage/multipart-uploads/${uploadId}/parts/${partNumber}/destination`,
      { body: input },
    );
    return result.destination;
  }

  async confirmPart(
    uploadId: string,
    partNumber: number,
    input: { etag: string; size: number; checksumSha256?: string },
  ): Promise<PublicMultipartPart> {
    const result = await this.request<{ part: PublicMultipartPart }>(
      'POST',
      `/api/v1/storage/multipart-uploads/${uploadId}/parts/${partNumber}/confirm`,
      { body: input },
    );
    return result.part;
  }

  async completeMultipart(
    uploadId: string,
    parts: { partNumber: number; etag: string; checksumSha256?: string }[],
  ): Promise<PublicStorageObject> {
    const result = await this.request<{ object: PublicStorageObject }>(
      'POST',
      `/api/v1/storage/multipart-uploads/${uploadId}/complete`,
      { body: { parts } },
    );
    return result.object;
  }

  async abortMultipart(uploadId: string): Promise<void> {
    await this.request<undefined>('DELETE', `/api/v1/storage/multipart-uploads/${uploadId}`);
  }

  uploadMultipartFile(
    uploadId: string,
    file: File | Blob,
    options: UploadMultipartFileOptions = {},
  ): Promise<PublicStorageObject> {
    return uploadMultipartFile(this, uploadId, file, options);
  }

  private applySession(result: AuthSessionPayload): void {
    this.csrfToken = result.csrfToken;
    if (result.activeOrganizationId) {
      this.organizationId = result.activeOrganizationId;
      return;
    }

    if (result.organization?.id) {
      this.organizationId = result.organization.id;
      return;
    }

    if (result.organizations[0]?.id) {
      this.organizationId = result.organizations[0].id;
    }
  }

  private async request<T>(
    method: RequestOptions['method'],
    path: string,
    options: Omit<RequestOptions, 'method'> = {},
  ): Promise<T> {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      ...options.headers,
    };

    const csrfToken = options.csrfToken ?? this.csrfToken;
    if (csrfToken && method !== 'GET') {
      headers[CSRF_HEADER_NAME] = csrfToken;
    }

    const organizationId = options.organizationId ?? this.organizationId;
    if (organizationId) {
      headers[ORGANIZATION_HEADER_NAME] = organizationId;
    }

    let body: string | undefined;
    if (options.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(options.body);
    }

    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method,
      headers,
      body,
      credentials: this.credentials,
    });

    if (response.status === 204) {
      return undefined as T;
    }

    if (!response.ok) {
      throw await ApiClientError.fromResponse(response);
    }

    return (await response.json()) as T;
  }
}

export function createApiClient(baseUrl: string): VaultStackApiClient {
  return new VaultStackApiClient({ baseUrl });
}
