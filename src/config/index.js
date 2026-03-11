/**
 * Configuración centralizada.
 * Variables de entorno con valores por defecto para desarrollo local.
 */
import path from 'path';
import { fileURLToPath } from 'url';

const env = process.env;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const config = {
  env: env.NODE_ENV ?? 'development',
  port: Number(env.PORT) || 3000,
  isProduction: env.NODE_ENV === 'production',
};

/** Parámetros del encoder (YouTube Infinite Storage – Base-8). 360p + bloques 20×20 para minimizar peso. */
export const encoderConfig = {
  WIDTH: 640,
  HEIGHT: 360,
  BLOCK_SIZE: 20,
  FPS: 10,
  /** Paleta Base-8 [R,G,B] para escritura rápida en buffer RGB */
  PALETTE: [
    Buffer.from([0, 0, 0]),       // 000: Negro
    Buffer.from([255, 0, 0]),     // 001: Rojo
    Buffer.from([0, 255, 0]),     // 010: Verde
    Buffer.from([0, 0, 255]),     // 011: Azul
    Buffer.from([255, 255, 0]),   // 100: Amarillo
    Buffer.from([0, 255, 255]),   // 101: Cian
    Buffer.from([255, 0, 255]),   // 110: Magenta
    Buffer.from([255, 255, 255]), // 111: Blanco
  ],
};

/** Rutas tmp (resueltas desde raíz del proyecto para Docker y local) */
const projectRoot = path.resolve(__dirname, '../..');
export const paths = {
  uploads: path.join(projectRoot, 'tmp', 'uploads'),
  outputs: path.join(projectRoot, 'tmp', 'outputs'),
  decoded: path.join(projectRoot, 'tmp', 'decoded'),
  downloads: path.join(projectRoot, 'tmp', 'downloads'),
};

/** URLs permitidas para decode-from-youtube (solo YouTube). */
export const YOUTUBE_URL_REGEX = /^https?:\/\/(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)[\w-]+/i;

/** Dado RGB [r,g,b], devuelve el índice de paleta (0-7) más cercano. Para decoder. */
export function rgbToPaletteIndex(r, g, b) {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < encoderConfig.PALETTE.length; i++) {
    const p = encoderConfig.PALETTE[i];
    const d = (r - p[0]) ** 2 + (g - p[1]) ** 2 + (b - p[2]) ** 2;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}
