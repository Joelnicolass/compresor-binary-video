import { createClient } from 'redis';
import { infraConfig } from '../config/index.js';

let redisClient;
let connectPromise;
let warnedUnavailable = false;

function buildRedisClient() {
  if (!infraConfig.redisUrl) return null;
  const client = createClient({ url: infraConfig.redisUrl });
  client.on('error', (err) => {
    console.error('[redis] connection error:', err.message);
  });
  return client;
}

export async function getRedisClient() {
  if (redisClient?.isReady) return redisClient;
  if (!redisClient) redisClient = buildRedisClient();

  if (!redisClient) {
    if (!warnedUnavailable) {
      warnedUnavailable = true;
      console.warn('[redis] REDIS_URL no configurado; usando fallback en memoria.');
    }
    return null;
  }

  if (!connectPromise) {
    connectPromise = redisClient.connect().catch((err) => {
      console.error('[redis] no se pudo conectar:', err.message);
      connectPromise = null;
      return null;
    });
  }

  await connectPromise;
  return redisClient.isReady ? redisClient : null;
}
