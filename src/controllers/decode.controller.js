import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { decodeVideoToFile } from '../decoder/decode.js';
import * as jobStore from '../services/jobStore.js';
import { downloadYouTubeVideo } from '../services/youtube.js';
import { publishEvent } from '../services/rabbit.js';
import { paths, YOUTUBE_URL_REGEX } from '../config/index.js';

/**
 * POST /api/decode-from-youtube - Recibe URL de YouTube, descarga, decodifica en segundo plano, responde 202.
 */
export async function postDecodeFromYoutube(req, res, next) {
  try {
    const url = typeof req.body?.url === 'string' ? req.body.url.trim() : '';
    if (!url || !YOUTUBE_URL_REGEX.test(url)) {
      return res.status(400).json({
        error: 'URL no válida. Use un enlace de YouTube (youtube.com/watch o youtu.be).',
      });
    }

    const jobId = uuidv4();
    const outputPath = path.join(paths.decoded, `${jobId}_youtube`);

    await jobStore.set(jobId, { status: 'processing', filename: 'youtube' });
    void publishEvent('job.created', {
      jobId,
      type: 'decode-from-youtube',
      url,
    });

    downloadYouTubeVideo(url, jobId)
      .then((downloadPath) =>
        decodeVideoToFile(downloadPath, outputPath).then(async () => {
          try { fs.rmSync(downloadPath, { force: true }); } catch (_) {}
          await jobStore.set(jobId, {
            status: 'completed',
            file: outputPath,
            filename: 'youtube',
          });
          void publishEvent('job.completed', {
            jobId,
            type: 'decode-from-youtube',
            filename: 'youtube',
          });
        })
      )
      .catch((err) => {
        console.error(`Error decode-from-youtube ${jobId}:`, err);
        void jobStore.set(jobId, { status: 'error', message: err.message });
        void publishEvent('job.failed', {
          jobId,
          type: 'decode-from-youtube',
          message: err.message,
        });
      });

    return res.status(202).json({
      message: 'Descarga y decodificación iniciadas',
      jobId,
      statusUrl: `/api/status/${jobId}`,
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * POST /api/decode - Recibe video .mp4, lanza decodificación en segundo plano, responde 202.
 */
export async function postDecode(req, res, next) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Video no proporcionado.' });
    }

    const jobId = uuidv4();
    const inputPath = req.file.path;
    const videoName = req.file.originalname || 'video.mp4';
    const baseName = videoName.replace(/\.mp4$/i, '') || 'decoded';
    const outputPath = path.join(paths.decoded, `${jobId}_${baseName}`);

    await jobStore.set(jobId, { status: 'processing', filename: `${baseName}` });
    void publishEvent('job.created', {
      jobId,
      type: 'decode',
      filename: baseName,
    });

    decodeVideoToFile(inputPath, outputPath)
      .then(async () => {
        await jobStore.set(jobId, {
          status: 'completed',
          file: outputPath,
          filename: baseName,
        });
        void publishEvent('job.completed', {
          jobId,
          type: 'decode',
          filename: baseName,
        });
        fs.rmSync(inputPath, { force: true });
      })
      .catch((err) => {
        console.error(`Error decode job ${jobId}:`, err);
        void jobStore.set(jobId, { status: 'error', message: err.message });
        void publishEvent('job.failed', {
          jobId,
          type: 'decode',
          message: err.message,
        });
        try { fs.rmSync(inputPath, { force: true }); } catch (_) {}
      });

    return res.status(202).json({
      message: 'Decodificación iniciada',
      jobId,
      statusUrl: `/api/status/${jobId}`,
    });
  } catch (err) {
    return next(err);
  }
}
