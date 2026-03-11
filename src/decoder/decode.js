import { spawn } from 'child_process';
import fs from 'fs';
import { encoderConfig, rgbToPaletteIndex } from '../config/index.js';

const COLS = encoderConfig.WIDTH / encoderConfig.BLOCK_SIZE;
const ROWS = encoderConfig.HEIGHT / encoderConfig.BLOCK_SIZE;
const FRAME_SIZE = encoderConfig.WIDTH * encoderConfig.HEIGHT * 3;

/**
 * Convierte array de bits (0/1) en Buffer (8 bits = 1 byte, MSB first).
 */
function bitsToBuffer(bits) {
  const len = Math.ceil(bits.length / 8);
  const buf = Buffer.alloc(len);
  for (let i = 0; i < bits.length; i++) {
    if (bits[i]) buf[i >> 3] |= 128 >> (i % 8);
  }
  return buf;
}

/**
 * Para un bloque 40x40, cuenta cuántos píxeles votan por cada índice de paleta
 * y devuelve el más frecuente (mayoría). Resistente a artefactos de compresión.
 */
function blockToPaletteIndexMajority(frame, row, col) {
  const counts = new Array(8).fill(0);
  const x0 = col * encoderConfig.BLOCK_SIZE;
  const y0 = row * encoderConfig.BLOCK_SIZE;
  for (let dy = 0; dy < encoderConfig.BLOCK_SIZE; dy++) {
    for (let dx = 0; dx < encoderConfig.BLOCK_SIZE; dx++) {
      const idx = ((y0 + dy) * encoderConfig.WIDTH + (x0 + dx)) * 3;
      const r = frame[idx];
      const g = frame[idx + 1];
      const b = frame[idx + 2];
      const i = rgbToPaletteIndex(r, g, b);
      counts[i]++;
    }
  }
  let best = 0;
  let bestCount = 0;
  for (let i = 0; i < 8; i++) {
    if (counts[i] > bestCount) {
      bestCount = counts[i];
      best = i;
    }
  }
  return best;
}

/**
 * Decodifica un .mp4 a buffer binario: lee frames vía FFmpeg (rawvideo rgb24),
 * por cada bloque 40x40 usa voto por mayoría de paleta para resistir compresión (YUV420p/libx264).
 */
export function decodeVideoToBuffer(inputPath) {
  return new Promise((resolve, reject) => {
    const bits = [];
    const ffmpeg = spawn('ffmpeg', [
      '-i', inputPath,
      '-r', String(encoderConfig.FPS),
      '-f', 'rawvideo',
      '-pix_fmt', 'rgb24',
      '-s', `${encoderConfig.WIDTH}x${encoderConfig.HEIGHT}`,
      'pipe:1',
    ], { stdio: ['ignore', 'pipe', 'pipe'] });

    let buffer = Buffer.alloc(0);

    ffmpeg.stdout.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      while (buffer.length >= FRAME_SIZE) {
        const frame = buffer.subarray(0, FRAME_SIZE);
        buffer = buffer.subarray(FRAME_SIZE);
        for (let row = 0; row < ROWS; row++) {
          for (let col = 0; col < COLS; col++) {
            const colorIndex = blockToPaletteIndexMajority(frame, row, col);
            bits.push((colorIndex >> 2) & 1, (colorIndex >> 1) & 1, colorIndex & 1);
          }
        }
      }
    });

    ffmpeg.stderr.on('data', () => {});

    ffmpeg.on('error', (err) => reject(err));
    ffmpeg.on('close', (code) => {
      if (code !== 0 && code !== null) {
        reject(new Error(`FFmpeg salió con código ${code}`));
        return;
      }
      const raw = bitsToBuffer(bits);
      if (raw.length >= 4) {
        const len = raw.readUInt32LE(0);
        if (len > 0 && len <= raw.length - 4) {
          return resolve(raw.subarray(4, 4 + len));
        }
      }
      resolve(raw);
    });
  });
}

/**
 * Decodifica video a archivo en disco.
 */
export function decodeVideoToFile(inputPath, outputPath) {
  return decodeVideoToBuffer(inputPath).then((buf) => {
    fs.writeFileSync(outputPath, buf);
    return outputPath;
  });
}
