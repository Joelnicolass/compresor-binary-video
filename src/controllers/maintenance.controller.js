import fs from 'fs/promises';
import path from 'path';
import { infraConfig, paths } from '../config/index.js';
import { publishEvent } from '../services/rabbit.js';

const TMP_DIRECTORIES = [paths.uploads, paths.outputs, paths.decoded, paths.downloads];

async function cleanupDirectory(dirPath, cutoffMs, metrics) {
  let entries;
  try {
    entries = await fs.readdir(dirPath, { withFileTypes: true });
  } catch (err) {
    metrics.errors += 1;
    return;
  }

  for (const entry of entries) {
    const targetPath = path.join(dirPath, entry.name);
    metrics.scanned += 1;

    let stat;
    try {
      stat = await fs.stat(targetPath);
    } catch {
      metrics.errors += 1;
      continue;
    }

    if (stat.mtimeMs <= cutoffMs) {
      try {
        await fs.rm(targetPath, { recursive: true, force: true });
        metrics.deleted += 1;
      } catch {
        metrics.errors += 1;
      }
      continue;
    }

    if (entry.isDirectory()) {
      await cleanupDirectory(targetPath, cutoffMs, metrics);
    }
  }
}

export async function postCleanupTmp(_req, res) {
  const startedAt = Date.now();
  const cutoffMs = startedAt - infraConfig.tmpFileMaxAgeSeconds * 1000;
  const metrics = {
    scanned: 0,
    deleted: 0,
    errors: 0,
    maxAgeSeconds: infraConfig.tmpFileMaxAgeSeconds,
  };

  for (const dirPath of TMP_DIRECTORIES) {
    await cleanupDirectory(dirPath, cutoffMs, metrics);
  }

  const durationMs = Date.now() - startedAt;
  const payload = {
    ...metrics,
    durationMs,
  };

  void publishEvent('maintenance.cleanup.executed', payload);

  res.status(200).json({
    message: 'Limpieza completada',
    ...payload,
  });
}
