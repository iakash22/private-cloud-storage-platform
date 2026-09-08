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
  type PublicShareAccess,
  type PublicShareInspect,
  type PublicShareLink,
  type PublicStorageObject,
  type PublicStoragePolicy,
  type PublicStorageProvider,
  type PublicStorageProviderHealth,
  type PublicArtifact,
  type PublicArtifactVersion,
  type PublicBuild,
  type PublicProject,
  type InitiatedArtifactUpload,
  type ArtifactKindName,
  type BuildStatusName,
  type S3DialectName,
  type PublicTeam,
  type PublicTeamMember,
  type ReadinessResponse,
  type ShareVisibilityName,
  type StorageLifecycleActionName,
} from '@vaultstack/types';
import { ApiClientError } from './errors.js';
import { defaultHttpFetch, type HttpFetch, type HttpRequestInit } from './http.js';
import { uploadMultipartFile, type UploadMultipartFileOptions } from './multipart-upload.js';
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
    const result = await this.request<{ buckets: PublicBucket[] }>(
      'GET',
      '/api/v1/storage/buckets',
    );
    return result.buckets;
  }

  async listStorageProviders(): Promise<PublicStorageProvider[]> {
    const result = await this.request<{ providers: PublicStorageProvider[] }>(
      'GET',
      '/api/v1/storage/providers',
    );
    return result.providers;
  }

  async createStorageProvider(input: {
    name: string;
    dialect: S3DialectName;
    endpoint?: string;
    region?: string;
    bucket?: string;
    forcePathStyle?: boolean;
    tls?: boolean;
    accountId?: string;
    accessKeyId: string;
    secretAccessKey: string;
    isDefault?: boolean;
  }): Promise<PublicStorageProvider> {
    const result = await this.request<{ provider: PublicStorageProvider }>(
      'POST',
      '/api/v1/storage/providers',
      { body: input },
    );
    return result.provider;
  }

  async updateStorageProvider(
    providerId: string,
    input: {
      name?: string;
      endpoint?: string | null;
      region?: string | null;
      bucket?: string | null;
      forcePathStyle?: boolean | null;
      tls?: boolean | null;
      accountId?: string | null;
      accessKeyId?: string;
      secretAccessKey?: string;
      isDefault?: boolean;
      status?: string;
    },
  ): Promise<PublicStorageProvider> {
    const result = await this.request<{ provider: PublicStorageProvider }>(
      'PATCH',
      `/api/v1/storage/providers/${providerId}`,
      { body: input },
    );
    return result.provider;
  }

  async deleteStorageProvider(providerId: string): Promise<void> {
    await this.request<undefined>('DELETE', `/api/v1/storage/providers/${providerId}`);
  }

  async testStorageProvider(providerId: string): Promise<PublicStorageProviderHealth> {
    const result = await this.request<{ health: PublicStorageProviderHealth }>(
      'POST',
      `/api/v1/storage/providers/${providerId}/test`,
    );
    return result.health;
  }

  async createBucket(input: {
    name: string;
    region?: string;
    versioning?: 'UNVERSIONED' | 'ENABLED';
    storageProviderId?: string;
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

  async listObjects(
    bucketId: string,
    params: ListObjectsParams = {},
  ): Promise<PublicObjectListPage> {
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

  async listShares(objectId?: string): Promise<PublicShareLink[]> {
    const query = objectId ? `?objectId=${encodeURIComponent(objectId)}` : '';
    const result = await this.request<{ shares: PublicShareLink[] }>(
      'GET',
      `/api/v1/storage/shares${query}`,
    );
    return result.shares;
  }

  async createShare(
    objectId: string,
    input: {
      visibility: ShareVisibilityName;
      teamId?: string;
      password?: string;
      allowView?: boolean;
      allowDownload?: boolean;
      maxDownloads?: number;
      expiresAt?: string;
    },
  ): Promise<PublicShareLink & { token: string }> {
    const result = await this.request<{ share: PublicShareLink & { token: string } }>(
      'POST',
      `/api/v1/storage/objects/${objectId}/shares`,
      { body: input },
    );
    return result.share;
  }

  async getShare(shareId: string): Promise<PublicShareLink> {
    const result = await this.request<{ share: PublicShareLink }>(
      'GET',
      `/api/v1/storage/shares/${shareId}`,
    );
    return result.share;
  }

  async updateShare(
    shareId: string,
    input: {
      expiresAt?: string | null;
      allowView?: boolean;
      allowDownload?: boolean;
      maxDownloads?: number | null;
      revoked?: true;
    },
  ): Promise<PublicShareLink> {
    const result = await this.request<{ share: PublicShareLink }>(
      'PATCH',
      `/api/v1/storage/shares/${shareId}`,
      { body: input },
    );
    return result.share;
  }

  async revokeShare(shareId: string): Promise<void> {
    await this.request<undefined>('DELETE', `/api/v1/storage/shares/${shareId}`);
  }

  async inspectPublicShare(token: string, accessToken?: string): Promise<PublicShareInspect> {
    const query = accessToken ? `?accessToken=${encodeURIComponent(accessToken)}` : '';
    return this.request<PublicShareInspect>(
      'GET',
      `/api/v1/public/shares/${encodeURIComponent(token)}${query}`,
    );
  }

  async unlockPublicShare(
    token: string,
    password: string,
  ): Promise<{ share: PublicShareAccess; accessToken: string; expiresAt: string }> {
    return this.request<{ share: PublicShareAccess; accessToken: string; expiresAt: string }>(
      'POST',
      `/api/v1/public/shares/${encodeURIComponent(token)}/unlock`,
      { body: { password } },
    );
  }

  async createPublicShareDownloadUrl(
    token: string,
    input: { password?: string; accessToken?: string } = {},
  ): Promise<PublicPresignedUrl> {
    const result = await this.request<{ download: PublicPresignedUrl }>(
      'POST',
      `/api/v1/public/shares/${encodeURIComponent(token)}/download-url`,
      { body: input },
    );
    return result.download;
  }

  async listTeams(organizationId: string): Promise<PublicTeam[]> {
    const result = await this.request<{ teams: PublicTeam[] }>(
      'GET',
      `/api/v1/organizations/${organizationId}/teams`,
    );
    return result.teams;
  }

  async addTeamMember(
    organizationId: string,
    teamId: string,
    userId: string,
  ): Promise<PublicTeamMember> {
    const result = await this.request<{ member: PublicTeamMember }>(
      'POST',
      `/api/v1/organizations/${organizationId}/teams/${teamId}/members`,
      { body: { userId } },
    );
    return result.member;
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

  async listMultipartSessions(
    params: {
      status?: MultipartUploadStatusName;
      limit?: number;
      cursor?: string;
    } = {},
  ): Promise<PublicMultipartSessionListPage> {
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
    return this.request('GET', `/api/v1/storage/multipart-uploads${query ? `?${query}` : ''}`);
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

  async listProjects(): Promise<PublicProject[]> {
    const result = await this.request<{ projects: PublicProject[] }>(
      'GET',
      '/api/v1/artifacts/projects',
    );
    return result.projects;
  }

  async createProject(input: {
    name: string;
    slug?: string;
    description?: string;
    retentionDays?: number | null;
  }): Promise<PublicProject> {
    const result = await this.request<{ project: PublicProject }>(
      'POST',
      '/api/v1/artifacts/projects',
      { body: input },
    );
    return result.project;
  }

  async getProject(projectId: string): Promise<PublicProject> {
    const result = await this.request<{ project: PublicProject }>(
      'GET',
      `/api/v1/artifacts/projects/${projectId}`,
    );
    return result.project;
  }

  async updateProject(
    projectId: string,
    input: { name?: string; description?: string | null; retentionDays?: number | null },
  ): Promise<PublicProject> {
    const result = await this.request<{ project: PublicProject }>(
      'PATCH',
      `/api/v1/artifacts/projects/${projectId}`,
      { body: input },
    );
    return result.project;
  }

  async deleteProject(projectId: string): Promise<void> {
    await this.request<undefined>('DELETE', `/api/v1/artifacts/projects/${projectId}`);
  }

  async listBuilds(projectId: string): Promise<PublicBuild[]> {
    const result = await this.request<{ builds: PublicBuild[] }>(
      'GET',
      `/api/v1/artifacts/projects/${projectId}/builds`,
    );
    return result.builds;
  }

  async createBuild(
    projectId: string,
    input: { title?: string; gitRef?: string; commitSha?: string; status?: BuildStatusName } = {},
  ): Promise<PublicBuild> {
    const result = await this.request<{ build: PublicBuild }>(
      'POST',
      `/api/v1/artifacts/projects/${projectId}/builds`,
      { body: input },
    );
    return result.build;
  }

  async getBuild(projectId: string, buildId: string): Promise<PublicBuild> {
    const result = await this.request<{ build: PublicBuild }>(
      'GET',
      `/api/v1/artifacts/projects/${projectId}/builds/${buildId}`,
    );
    return result.build;
  }

  async deleteBuild(projectId: string, buildId: string): Promise<void> {
    await this.request<undefined>(
      'DELETE',
      `/api/v1/artifacts/projects/${projectId}/builds/${buildId}`,
    );
  }

  async listBuildArtifacts(projectId: string, buildId: string): Promise<PublicArtifact[]> {
    const result = await this.request<{ artifacts: PublicArtifact[] }>(
      'GET',
      `/api/v1/artifacts/projects/${projectId}/builds/${buildId}/artifacts`,
    );
    return result.artifacts;
  }

  async initiateArtifactUpload(
    projectId: string,
    buildId: string,
    input: {
      name: string;
      kind?: ArtifactKindName;
      fileName?: string;
      contentType?: string;
      size?: number;
      versionLabel?: string;
    },
  ): Promise<InitiatedArtifactUpload> {
    return this.request<InitiatedArtifactUpload>(
      'POST',
      `/api/v1/artifacts/projects/${projectId}/builds/${buildId}/artifacts`,
      { body: input },
    );
  }

  async completeArtifactUpload(
    versionId: string,
    input: { checksumSha256?: string } = {},
  ): Promise<PublicArtifactVersion> {
    const result = await this.request<{ version: PublicArtifactVersion }>(
      'POST',
      `/api/v1/artifacts/versions/${versionId}/complete`,
      { body: input },
    );
    return result.version;
  }

  async createArtifactDownloadUrl(versionId: string): Promise<PublicPresignedUrl> {
    const result = await this.request<{ download: PublicPresignedUrl }>(
      'POST',
      `/api/v1/artifacts/versions/${versionId}/download-url`,
      { body: {} },
    );
    return result.download;
  }

  async releaseArtifactVersion(
    versionId: string,
    input: { releaseTag?: string } = {},
  ): Promise<PublicArtifactVersion> {
    const result = await this.request<{ version: PublicArtifactVersion }>(
      'POST',
      `/api/v1/artifacts/versions/${versionId}/release`,
      { body: input },
    );
    return result.version;
  }

  async listReleases(projectId: string): Promise<PublicArtifactVersion[]> {
    const result = await this.request<{ releases: PublicArtifactVersion[] }>(
      'GET',
      `/api/v1/artifacts/projects/${projectId}/releases`,
    );
    return result.releases;
  }

  async deleteArtifactVersion(versionId: string): Promise<void> {
    await this.request<undefined>('DELETE', `/api/v1/artifacts/versions/${versionId}`);
  }

  async deleteArtifact(artifactId: string): Promise<void> {
    await this.request<undefined>('DELETE', `/api/v1/artifacts/${artifactId}`);
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
