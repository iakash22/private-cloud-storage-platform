import type { EnvConfig } from '@vaultstack/config';
import type { Logger } from '@vaultstack/logger';
import type { RealtimeEvent } from '@vaultstack/types';
import { realtimeEventSchema } from '@vaultstack/validation';
import type { Redis } from 'ioredis';
import { randomUUID } from 'node:crypto';

export const REALTIME_REDIS_CHANNEL_PREFIX = 'vaultstack:realtime:user:';

export class RedisRealtimePublisher {
  constructor(
    private readonly redis: Redis,
    private readonly config: Pick<EnvConfig, 'REALTIME_ENABLED'>,
    private readonly logger: Logger,
  ) {}

  async publish(
    input: Omit<RealtimeEvent, 'id' | 'createdAt'> & { id?: string; createdAt?: string },
  ): Promise<void> {
    if (!this.config.REALTIME_ENABLED) {
      return;
    }

    const event: RealtimeEvent = {
      id: input.id ?? randomUUID(),
      createdAt: input.createdAt ?? new Date().toISOString(),
      type: input.type,
      organizationId: input.organizationId,
      userId: input.userId,
      payload: input.payload,
    };

    const parsed = realtimeEventSchema.safeParse(event);
    if (!parsed.success) {
      this.logger.warn(
        { event: 'realtime.publish_invalid', type: event.type, issues: parsed.error.flatten() },
        'Skipped invalid realtime event',
      );
      return;
    }

    await this.redis.publish(
      `${REALTIME_REDIS_CHANNEL_PREFIX}${event.userId}`,
      JSON.stringify(event),
    );
  }
}

export class NoopRealtimePublisher {
  async publish(_input: Omit<RealtimeEvent, 'id' | 'createdAt'>): Promise<void> {
    return;
  }
}

export type RealtimePublisher = RedisRealtimePublisher | NoopRealtimePublisher;
