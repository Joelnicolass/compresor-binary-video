import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { decodeVideoToFile } from '../decoder/decode.js';
import * as jobStore from '../services/jobStore.js';
import { downloadYouTubeVideo } from '../services/youtube.js';
import { paths, YOUTUBE_URL_REGEX } from '../config/index.js';

/**
 * POST /api/decode-from-youtube - Recibe URL de YouTube, descarga, decodifica en segundo plano, responde 202.
 */
export function postDecodeFromYoutube(req, res) {
  const url = typeof req.body?.url === 'string' ? req.body.url.trim() : '';
  if (!url || !YOUTUBE_URL_REGEX.test(url)) {
    return res.status(400).json({
      error: 'URL no válida. Use un enlace de YouTube (youtube.com/watch o youtu.be).',
    });
  }

  const jobId = uuidv4();
  const outputPath = path.join(paths.decoded, `${jobId}_youtube`);

  jobStore.set(jobId, { status: 'processing', filename: 'youtube' });

  downloadYouTubeVideo(url, jobId)
    .then((downloadPath) =>
      decodeVideoToFile(downloadPath, outputPath).then(() => {
        try { fs.rmSync(downloadPath, { force: true }); } catch (_) {}
        jobStore.set(jobId, {
          status: 'completed',
          file: outputPath,
          filename: 'youtube',
        });
      })
    )
    .catch((err) => {
      console.error(`Error decode-from-youtube ${jobId}:`, err);
      jobStore.set(jobId, { status: 'error', message: err.message });
    });

  res.status(202).json({
    message: 'Descarga y decodificación iniciadas',
    jobId,
    statusUrl: `/api/status/${jobId}`,
  });
}

/**
 * POST /api/decode - Recibe video .mp4, lanza decodificación en segundo plano, responde 202.
 */
export function postDecode(req, res, next) {
  if (!req.file) {
    return res.status(400).json({ error: 'Video no proporcionado.' });
  }

  const jobId = uuidv4();
  const inputPath = req.file.path;
  const videoName = req.file.originalname || 'video.mp4';
  const baseName = videoName.replace(/\.mp4$/i, '') || 'decoded';
  const outputPath = path.join(paths.decoded, `${jobId}_${baseName}`);

  jobStore.set(jobId, { status: 'processing', filename: `${baseName}` });

  decodeVideoToFile(inputPath, outputPath)
    .then(() => {
      jobStore.set(jobId, {
        status: 'completed',
        file: outputPath,
        filename: baseName,
      });
      fs.rmSync(inputPath, { force: true });
    })
    .catch((err) => {
      console.error(`Error decode job ${jobId}:`, err);
      jobStore.set(jobId, { status: 'error', message: err.message });
      try { fs.rmSync(inputPath, { force: true }); } catch (_) {}
    });

  res.status(202).json({
    message: 'Decodificación iniciada',
    jobId,
    statusUrl: `/api/status/${jobId}`,
  });
}
