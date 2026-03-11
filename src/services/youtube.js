import path from 'path';
import fs from 'fs';
import youtubedl from 'youtube-dl-exec';
import { paths } from '../config/index.js';

/**
 * Descarga el video de una URL de YouTube usando yt-dlp (binario en node_modules vía youtube-dl-exec).
 * No requiere instalación global: el binario se descarga en npm install.
 * @param {string} url - URL de YouTube (watch o youtu.be)
 * @param {string} jobId - Id del job (nombre base del archivo)
 * @returns {Promise<string>} - Ruta del archivo descargado
 */
export async function downloadYouTubeVideo(url, jobId) {
  const outputTemplate = path.join(paths.downloads, `${jobId}.%(ext)s`);
  await youtubedl(url, {
    noWarnings: true,
    noPlaylist: true,
    format: 'best[ext=mp4]/bestvideo[ext=mp4]/best',
    output: outputTemplate,
  });
  const files = fs.readdirSync(paths.downloads).filter((f) => f.startsWith(`${jobId}.`));
  if (files.length === 0) {
    throw new Error('No se pudo descargar el video');
  }
  return path.join(paths.downloads, files[0]);
}
