import type {
  RealtimeBackupJobPayload,
  RealtimeFolderOperationPayload,
  RealtimeSessionRevokedPayload,
} from '@vaultstack/types';
import type { RealtimePublisher } from './services/redis-realtime.publisher.js';

export async function publishSessionRevoked(
  publisher: RealtimePublisher,
  input: {
    organizationId: string;
    userId: string;
    payload: RealtimeSessionRevokedPayload;
  },
): Promise<void> {
  await publisher.publish({
    type: 'session.revoked',
    organizationId: input.organizationId,
    userId: input.userId,
    payload: input.payload,
  });
}

export async function publishSessionRevokedAll(
  publisher: RealtimePublisher,
  input: { organizationId: string; userId: string },
): Promise<void> {
  await publisher.publish({
    type: 'session.revoked_all',
    organizationId: input.organizationId,
    userId: input.userId,
    payload: {},
  });
}

export async function publishFolderOperationEvent(
  publisher: RealtimePublisher,
  input: {
    organizationId: string;
    userId: string;
    type: 'folder_operation.progress' | 'folder_operation.completed' | 'folder_operation.failed';
    payload: RealtimeFolderOperationPayload;
  },
): Promise<void> {
  await publisher.publish({
    type: input.type,
    organizationId: input.organizationId,
    userId: input.userId,
    payload: input.payload,
  });
}

export async function publishBackupJobEvent(
  publisher: RealtimePublisher,
  input: {
    organizationId: string;
    userId: string;
    type: 'backup_job.progress' | 'backup_job.completed' | 'backup_job.failed';
    payload: RealtimeBackupJobPayload;
  },
): Promise<void> {
  await publisher.publish({
    type: input.type,
    organizationId: input.organizationId,
    userId: input.userId,
    payload: input.payload,
  });
}
