import { infraConfig } from '../config/index.js';
import { getRedisClient } from './redis.js';

const jobsFallback = new Map();

function keyFor(jobId) {
  return `job:${jobId}`;
}

export async function set(jobId, data) {
  const client = await getRedisClient();
  if (!client) {
    jobsFallback.set(jobId, data);
    return;
  }

  await client.set(keyFor(jobId), JSON.stringify(data), {
    EX: infraConfig.jobTtlSeconds,
  });
}

export async function get(jobId) {
  const client = await getRedisClient();
  if (!client) {
    return jobsFallback.get(jobId);
  }

  const raw = await client.get(keyFor(jobId));
  if (!raw) return undefined;

  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

export async function remove(jobId) {
  const client = await getRedisClient();
  if (!client) {
    jobsFallback.delete(jobId);
    return;
  }

  await client.del(keyFor(jobId));
}
