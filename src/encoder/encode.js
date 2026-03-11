import { spawn } from 'child_process';
import fs from 'fs';
import { encoderConfig } from '../config/index.js';
import { BitReader } from '../utils/bit-reader.js';

const COLS = encoderConfig.WIDTH / encoderConfig.BLOCK_SIZE;
const ROWS = encoderConfig.HEIGHT / encoderConfig.BLOCK_SIZE;
const FRAME_SIZE = encoderConfig.WIDTH * encoderConfig.HEIGHT * 3;

/**
 * Codifica un archivo a video vía FFmpeg (stdin rawvideo rgb24).
 * - lossless: true → FFv1 + rgb24 (.mkv), round-trip idéntico para probar decode.
 * - lossless: false → libx264 + yuv420p (.mp4), compatible con YouTube pero lossy.
 */
export function encodeFileToStream(inputPath, outputPath, options = {}) {
  const lossless = options.lossless === true;
  return new Promise((resolve, reject) => {
    const fileBuffer = fs.readFileSync(inputPath);
    const withLength = Buffer.alloc(4 + fileBuffer.length);
    withLength.writeUInt32LE(fileBuffer.length, 0);
    fileBuffer.copy(withLength, 4);
    const bitReader = new BitReader(withLength);

    const args = [
      '-y',
      '-f', 'rawvideo',
      '-pixel_format', 'rgb24',
      '-video_size', `${encoderConfig.WIDTH}x${encoderConfig.HEIGHT}`,
      '-framerate', String(encoderConfig.FPS),
      '-i', 'pipe:0',
    ];
    if (lossless) {
      args.push('-c:v', 'ffv1', '-pix_fmt', 'rgb24', '-r', String(encoderConfig.FPS), outputPath);
    } else {
      args.push('-r', '30', '-c:v', 'libx264', '-preset', 'fast', '-crf', '18', '-pix_fmt', 'yuv420p', outputPath);
    }
    const ffmpeg = spawn('ffmpeg', args);

    ffmpeg.on('error', (err) => reject(err));
    ffmpeg.on('close', (code) => {
      if (code === 0) resolve(outputPath);
      else reject(new Error(`FFmpeg salió con código ${code}`));
    });

    const frameBuffer = Buffer.alloc(FRAME_SIZE);

    function processNextFrame() {
      let blocksDrawn = 0;
      frameBuffer.fill(0);

      for (let row = 0; row < ROWS; row++) {
        for (let col = 0; col < COLS; col++) {
          const colorIndex = bitReader.read(3);
          if (colorIndex === null && blocksDrawn === 0) {
            if (withLength.length === 0) {
              // Archivo vacío: enviar un frame negro para que FFmpeg no falle
              if (!ffmpeg.stdin.write(frameBuffer)) {
                ffmpeg.stdin.once('drain', () => { ffmpeg.stdin.end(); });
              } else {
                ffmpeg.stdin.end();
              }
            } else {
              ffmpeg.stdin.end();
            }
            return;
          }

          const rgb = encoderConfig.PALETTE[colorIndex ?? 0];
          for (let y = 0; y < encoderConfig.BLOCK_SIZE; y++) {
            for (let x = 0; x < encoderConfig.BLOCK_SIZE; x++) {
              const pixelY = row * encoderConfig.BLOCK_SIZE + y;
              const pixelX = col * encoderConfig.BLOCK_SIZE + x;
              const pixelIndex = (pixelY * encoderConfig.WIDTH + pixelX) * 3;
              frameBuffer[pixelIndex] = rgb[0];
              frameBuffer[pixelIndex + 1] = rgb[1];
              frameBuffer[pixelIndex + 2] = rgb[2];
            }
          }
          blocksDrawn++;
        }
      }

      if (!ffmpeg.stdin.write(frameBuffer)) {
        ffmpeg.stdin.once('drain', processNextFrame);
      } else {
        setImmediate(processNextFrame);
      }
    }

    processNextFrame();
  });
}
