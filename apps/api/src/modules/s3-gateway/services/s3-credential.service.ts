import type { PrismaClient, S3AccessCredential, ServiceAccount } from '@vaultstack/database';
import type {
  CreatedS3AccessCredential,
  PublicServiceAccount,
  PublicS3AccessCredential,
} from '@vaultstack/types';
import type {
  UpdateS3CredentialBody,
  UpdateServiceAccountBody,
} from '@vaultstack/validation';
import { writeAuditLog } from '../../../lib/audit.js';
import { conflict, notFound } from '../../../lib/errors.js';
import {
  decryptSecret,
  deriveCredentialEncryptionKey,
  encryptSecret,
  generateAccessKeyId,
  generateSecretAccessKey,
} from '../credential-crypto.js';
import type { CreateS3CredentialBody } from '@vaultstack/validation';

type CreateS3CredentialInput = Omit<CreateS3CredentialBody, 'allowedBucketNames'> & {
  allowedBucketNames?: string[];
};

interface CredentialRecord extends S3AccessCredential {
  serviceAccount: ServiceAccount;
}

function serializeCredential(record: CredentialRecord): PublicS3AccessCredential {
  return {
    id: record.id,
    organizationId: record.organizationId,
    serviceAccountId: record.serviceAccountId,
    serviceAccountName: record.serviceAccount.name,
    accessKeyId: record.accessKeyId,
    permissions: record.permissions,
    allowedBucketNames: record.allowedBucketNames,
    expiresAt: record.expiresAt?.toISOString() ?? null,
    revokedAt: record.revokedAt?.toISOString() ?? null,
    lastUsedAt: record.lastUsedAt?.toISOString() ?? null,
    requestCount: record.requestCount,
    rotatedFromId: record.rotatedFromId,
    createdAt: record.createdAt.toISOString(),
  };
}

export interface ResolvedS3Credential {
  credential: CredentialRecord;
  secretAccessKey: string;
}

export class S3CredentialService {
  private readonly encryptionKey: Buffer;

  constructor(
    private readonly prisma: PrismaClient,
    jwtSecret: string,
  ) {
    this.encryptionKey = deriveCredentialEncryptionKey(jwtSecret);
  }

  async list(organizationId: string): Promise<PublicS3AccessCredential[]> {
    const rows = await this.prisma.s3AccessCredential.findMany({
      where: { organizationId },
      include: { serviceAccount: true },
      orderBy: { createdAt: 'desc' },
    });

    return rows.map(serializeCredential);
  }

  async listServiceAccounts(organizationId: string): Promise<PublicServiceAccount[]> {
    const rows = await this.prisma.serviceAccount.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(serializeServiceAccount);
  }

  async updateServiceAccount(
    organizationId: string,
    serviceAccountId: string,
    actorUserId: string,
    input: UpdateServiceAccountBody,
    meta: { ipAddress?: string | null; userAgent?: string | null },
  ): Promise<PublicServiceAccount> {
    const existing = await this.prisma.serviceAccount.findFirst({
      where: { id: serviceAccountId, organizationId },
    });
    if (!existing) {
      throw notFound('Service account not found');
    }

    const updated = await this.prisma.serviceAccount.update({
      where: { id: serviceAccountId },
      data: {
        description: input.description,
        disabledAt: input.disabled === undefined
          ? undefined
          : input.disabled
            ? new Date()
            : null,
      },
    });
    await writeAuditLog(this.prisma, {
      organizationId,
      userId: actorUserId,
      action: input.disabled === undefined
        ? 'service_account.updated'
        : input.disabled
          ? 'service_account.disabled'
          : 'service_account.enabled',
      resourceType: 'service_account',
      resourceId: serviceAccountId,
      metadata: { description: input.description, disabled: input.disabled },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });
    return serializeServiceAccount(updated);
  }

  async create(
    organizationId: string,
    actorUserId: string,
    input: CreateS3CredentialInput,
    meta: { ipAddress?: string | null; userAgent?: string | null },
  ): Promise<CreatedS3AccessCredential> {
    const serviceAccount = await this.prisma.serviceAccount.upsert({
      where: {
        organizationId_name: {
          organizationId,
          name: input.serviceAccountName,
        },
      },
      create: {
        organizationId,
        name: input.serviceAccountName,
        description: input.description ?? null,
      },
      update: {
        description: input.description ?? undefined,
      },
    });

    const accessKeyId = await this.generateUniqueAccessKeyId();
    const secretAccessKey = generateSecretAccessKey();
    const encrypted = encryptSecret(secretAccessKey, this.encryptionKey);

    const row = await this.prisma.s3AccessCredential.create({
      data: {
        organizationId,
        serviceAccountId: serviceAccount.id,
        accessKeyId,
        secretCiphertext: encrypted.ciphertext,
        secretNonce: encrypted.nonce,
        permissions: input.permissions,
        allowedBucketNames: input.allowedBucketNames ?? [],
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      },
      include: { serviceAccount: true },
    });

    await writeAuditLog(this.prisma, {
      organizationId,
      userId: actorUserId,
      action: 's3.credential.created',
      resourceType: 's3_access_credential',
      resourceId: row.id,
      metadata: {
        accessKeyId: row.accessKeyId,
        serviceAccountId: serviceAccount.id,
        permissions: row.permissions,
      },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    return {
      ...serializeCredential(row),
      secretAccessKey,
    };
  }

  async revoke(
    organizationId: string,
    credentialId: string,
    actorUserId: string,
    meta: { ipAddress?: string | null; userAgent?: string | null },
  ): Promise<PublicS3AccessCredential> {
    const row = await this.prisma.s3AccessCredential.findFirst({
      where: { id: credentialId, organizationId },
      include: { serviceAccount: true },
    });

    if (!row) {
      throw notFound('S3 credential not found');
    }

    const revoked = await this.prisma.s3AccessCredential.update({
      where: { id: row.id },
      data: { revokedAt: new Date() },
      include: { serviceAccount: true },
    });

    await writeAuditLog(this.prisma, {
      organizationId,
      userId: actorUserId,
      action: 's3.credential.revoked',
      resourceType: 's3_access_credential',
      resourceId: row.id,
      metadata: { accessKeyId: row.accessKeyId },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    return serializeCredential(revoked);
  }

  async rotate(
    organizationId: string,
    credentialId: string,
    actorUserId: string,
    meta: { ipAddress?: string | null; userAgent?: string | null },
  ): Promise<CreatedS3AccessCredential> {
    const existing = await this.prisma.s3AccessCredential.findFirst({
      where: { id: credentialId, organizationId },
      include: { serviceAccount: true },
    });

    if (!existing) {
      throw notFound('S3 credential not found');
    }

    await this.revoke(organizationId, credentialId, actorUserId, meta);

    const accessKeyId = await this.generateUniqueAccessKeyId();
    const secretAccessKey = generateSecretAccessKey();
    const encrypted = encryptSecret(secretAccessKey, this.encryptionKey);

    const row = await this.prisma.s3AccessCredential.create({
      data: {
        organizationId,
        serviceAccountId: existing.serviceAccountId,
        accessKeyId,
        secretCiphertext: encrypted.ciphertext,
        secretNonce: encrypted.nonce,
        permissions: existing.permissions,
        allowedBucketNames: existing.allowedBucketNames,
        expiresAt: existing.expiresAt,
        rotatedFromId: existing.id,
      },
      include: { serviceAccount: true },
    });

    await writeAuditLog(this.prisma, {
      organizationId,
      userId: actorUserId,
      action: 's3.credential.rotated',
      resourceType: 's3_access_credential',
      resourceId: row.id,
      metadata: { accessKeyId: row.accessKeyId, rotatedFromId: existing.id },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    return {
      ...serializeCredential(row),
      secretAccessKey,
    };
  }

  async update(
    organizationId: string,
    credentialId: string,
    actorUserId: string,
    input: UpdateS3CredentialBody,
    meta: { ipAddress?: string | null; userAgent?: string | null },
  ): Promise<PublicS3AccessCredential> {
    const existing = await this.prisma.s3AccessCredential.findFirst({
      where: { id: credentialId, organizationId },
      include: { serviceAccount: true },
    });
    if (!existing) {
      throw notFound('S3 credential not found');
    }

    const updated = await this.prisma.s3AccessCredential.update({
      where: { id: credentialId },
      data: {
        permissions: input.permissions,
        allowedBucketNames: input.allowedBucketNames,
        expiresAt: input.expiresAt === undefined
          ? undefined
          : input.expiresAt === null
            ? null
            : new Date(input.expiresAt),
      },
      include: { serviceAccount: true },
    });

    await writeAuditLog(this.prisma, {
      organizationId,
      userId: actorUserId,
      action: 's3.credential.updated',
      resourceType: 's3_access_credential',
      resourceId: credentialId,
      metadata: {
        permissions: input.permissions,
        allowedBucketNames: input.allowedBucketNames,
        expiresAt: input.expiresAt,
      },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    return serializeCredential(updated);
  }

  async resolveByAccessKeyId(accessKeyId: string): Promise<ResolvedS3Credential | null> {
    const row = await this.prisma.s3AccessCredential.findUnique({
      where: { accessKeyId },
      include: { serviceAccount: true },
    });

    if (!row) {
      return null;
    }

    const secretAccessKey = decryptSecret(row.secretCiphertext, row.secretNonce, this.encryptionKey);
    return { credential: row, secretAccessKey };
  }

  async markUsed(credentialId: string): Promise<void> {
    await this.prisma.s3AccessCredential.update({
      where: { id: credentialId },
      data: { lastUsedAt: new Date(), requestCount: { increment: 1 } },
    });
  }

  private async generateUniqueAccessKeyId(): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const accessKeyId = generateAccessKeyId();
      const existing = await this.prisma.s3AccessCredential.findUnique({ where: { accessKeyId } });
      if (!existing) {
        return accessKeyId;
      }
    }

    throw conflict('Unable to allocate a unique S3 access key id');
  }
}

export function createS3CredentialService(prisma: PrismaClient, jwtSecret: string): S3CredentialService {
  return new S3CredentialService(prisma, jwtSecret);
}

function serializeServiceAccount(record: {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  disabledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): PublicServiceAccount {
  return {
    id: record.id,
    organizationId: record.organizationId,
    name: record.name,
    description: record.description,
    disabled: record.disabledAt !== null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}
