import { loadEnv } from '@vaultstack/config';
import { createLogger } from '@vaultstack/logger';
import { createApp } from './app.js';
import {
  createDependencyClients,
  shutdownDependencyClients,
} from './lib/dependencies.js';

const config = loadEnv();
const logger = createLogger({ name: 'api', level: config.LOG_LEVEL });
const clients = createDependencyClients(config);
const app = createApp({ config, logger, clients });

const server = app.listen(config.API_PORT, config.API_HOST, () => {
  logger.info(
    { host: config.API_HOST, port: config.API_PORT },
    'VaultStack API listening',
  );
});

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'Shutting down API');
  server.close();
  await shutdownDependencyClients(clients);
  process.exit(0);
}

process.on('SIGINT', () => {
  void shutdown('SIGINT');
});

process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});

export { app, server };
