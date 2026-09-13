import type { EnvConfig } from '@vaultstack/config';
import type { Logger } from '@vaultstack/logger';
import type { RealtimeEvent } from '@vaultstack/types';
import { realtimeEventSchema } from '@vaultstack/validation';
import type { Response } from 'express';
import type { Redis } from 'ioredis';
import { REALTIME_REDIS_CHANNEL_PREFIX } from './redis-realtime.publisher.js';

interface RealtimeConnection {
  id: string;
  userId: string;
  organizationId: string;
  sessionId: string | null;
  response: Response;
}

export class RealtimeHubService {
  private readonly connections = new Map<string, RealtimeConnection>();
  private subscriber: Redis | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly redis: Redis,
    private readonly config: Pick<
      EnvConfig,
      'REALTIME_ENABLED' | 'REALTIME_MAX_CONNECTIONS_PER_USER' | 'REALTIME_HEARTBEAT_SECONDS'
    >,
    private readonly logger: Logger,
  ) {}

  async start(): Promise<void> {
    if (!this.config.REALTIME_ENABLED || this.subscriber) {
      return;
    }

    this.subscriber = this.redis.duplicate();
    await this.subscriber.connect();
    await this.subscriber.psubscribe(`${REALTIME_REDIS_CHANNEL_PREFIX}*`);

    this.subscriber.on('pmessage', (_pattern, channel, message) => {
      const userId = channel.slice(REALTIME_REDIS_CHANNEL_PREFIX.length);
      this.deliverToUser(userId, message);
    });

    this.heartbeatTimer = setInterval(() => {
      this.sendHeartbeat();
    }, this.config.REALTIME_HEARTBEAT_SECONDS * 1000);
  }

  async stop(): Promise<void> {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    for (const connection of this.connections.values()) {
      connection.response.end();
    }
    this.connections.clear();
    if (this.subscriber) {
      await this.subscriber.quit();
      this.subscriber = null;
    }
  }

  registerConnection(input: {
    connectionId: string;
    userId: string;
    organizationId: string;
    sessionId: string | null;
    response: Response;
  }): void {
    const activeForUser = [...this.connections.values()].filter(
      (connection) => connection.userId === input.userId,
    ).length;
    if (activeForUser >= this.config.REALTIME_MAX_CONNECTIONS_PER_USER) {
      input.response.status(429).json({
        code: 'REALTIME_CONNECTION_LIMIT',
        message: 'Too many active realtime connections for this account',
      });
      return;
    }

    input.response.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    input.response.flushHeaders?.();
    input.response.write(': connected\n\n');

    this.connections.set(input.connectionId, {
      id: input.connectionId,
      userId: input.userId,
      organizationId: input.organizationId,
      sessionId: input.sessionId,
      response: input.response,
    });

    input.response.on('close', () => {
      this.connections.delete(input.connectionId);
    });
  }

  private deliverToUser(userId: string, rawMessage: string): void {
    let event: RealtimeEvent;
    try {
      const parsed = realtimeEventSchema.safeParse(JSON.parse(rawMessage));
      if (!parsed.success) {
        return;
      }
      event = parsed.data as RealtimeEvent;
    } catch {
      return;
    }

    if (event.userId !== userId) {
      return;
    }

    for (const connection of this.connections.values()) {
      if (connection.userId !== userId) {
        continue;
      }
      if (connection.organizationId !== event.organizationId) {
        continue;
      }
      this.writeEvent(connection.response, event);

      if (
        event.type === 'session.revoked' &&
        'sessionId' in event.payload &&
        connection.sessionId === event.payload.sessionId
      ) {
        connection.response.end();
        this.connections.delete(connection.id);
      }

      if (event.type === 'session.revoked_all') {
        connection.response.end();
        this.connections.delete(connection.id);
      }
    }
  }

  private sendHeartbeat(): void {
    for (const connection of this.connections.values()) {
      this.writeEvent(connection.response, {
        id: connection.id,
        type: 'ping',
        organizationId: connection.organizationId,
        userId: connection.userId,
        createdAt: new Date().toISOString(),
        payload: {},
      });
    }
  }

  private writeEvent(response: Response, event: RealtimeEvent): void {
    response.write(`id: ${event.id}\n`);
    response.write(`event: ${event.type}\n`);
    response.write(`data: ${JSON.stringify(event)}\n\n`);
  }
}
