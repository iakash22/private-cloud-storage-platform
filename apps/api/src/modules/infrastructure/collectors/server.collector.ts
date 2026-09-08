import { cpus, freemem, hostname, loadavg, networkInterfaces, platform, totalmem, uptime } from 'node:os';
import { readFile } from 'node:fs/promises';
import type { PublicServerMetrics } from '@vaultstack/types';
import type { ServerCollector } from '../domain/collectors.js';

export class OsServerCollector implements ServerCollector {
  async collect(): Promise<PublicServerMetrics> {
    const cpuList = cpus();
    const totalBytes = totalmem();
    const freeBytes = freemem();
    const usedBytes = Math.max(0, totalBytes - freeBytes);
    const [load1, load5, load15] = loadavg();
    const counters = await readNetworkCounters();
    const interfaces = Object.entries(networkInterfaces()).map(([name, entries]) => {
      const traffic = counters.get(name);
      return {
        name,
        addresses: (entries ?? [])
          .filter((entry) => entry.family === 'IPv4' || entry.family === 'IPv6')
          .map((entry) => entry.address),
        rxBytes: traffic?.rx ?? null,
        txBytes: traffic?.tx ?? null,
      };
    });

    return {
      collectedAt: new Date().toISOString(),
      hostname: hostname(),
      platform: platform(),
      uptimeSeconds: Math.floor(uptime()),
      cpu: {
        cores: cpuList.length,
        model: cpuList[0]?.model ?? 'unknown',
        load1: load1 ?? 0,
        load5: load5 ?? 0,
        load15: load15 ?? 0,
      },
      memory: {
        totalBytes,
        freeBytes,
        usedBytes,
        usedPercent: totalBytes === 0 ? 0 : Number(((usedBytes / totalBytes) * 100).toFixed(2)),
      },
      network: { interfaces },
    };
  }
}

async function readNetworkCounters(): Promise<Map<string, { rx: number; tx: number }>> {
  const result = new Map<string, { rx: number; tx: number }>();
  try {
    const raw = await readFile('/proc/net/dev', 'utf8');
    for (const line of raw.split('\n').slice(2)) {
      const match = line.trim().match(/^([^:]+):\s+(\d+)\s+(?:\S+\s+){7}(\d+)/);
      if (!match) {
        continue;
      }
      const name = match[1]?.trim();
      if (!name) {
        continue;
      }
      result.set(name, { rx: Number(match[2]), tx: Number(match[3]) });
    }
  } catch {
    // Non-Linux hosts have no /proc/net/dev; interfaces still list addresses.
  }
  return result;
}
