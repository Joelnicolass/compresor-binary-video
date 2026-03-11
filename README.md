## YouTube Infinite Storage – Encoder MVP

API en Node.js + Express que transforma cualquier archivo binario en un video y permite hacer el camino inverso (video → archivo), pensando en subir el video a YouTube como “medio de almacenamiento”.

- **Stack**: Node 20, Express, FFmpeg, `youtube-dl-exec` (yt-dlp), ESM.
- **Formato visual**: 1920×1080, bloques 40×40, 48×27 = 1296 bloques por frame.
- **Información por bloque**: 3 bits (Base‑8), mapeados a una paleta fija de 8 colores RGB.
- **Capacidad por frame**: 1296 bloques × 3 bits = 3888 bits ≈ 486 bytes.

---

## Arquitectura general

- `src/app.js`: instancia de Express, healthcheck y manejadores globales de errores.
- `src/server.js`: arranque del servidor y creación de carpetas `tmp/*`.
- `src/config/index.js`:
  - `config`: puerto, entorno.
  - `encoderConfig`: resolución, tamaño de bloque, FPS y paleta Base‑8.
  - `paths`: rutas de `tmp/uploads`, `tmp/outputs`, `tmp/decoded`, `tmp/downloads`.
  - `rgbToPaletteIndex`: util para mapear un RGB cualquiera al índice de paleta más cercano.
- `src/utils/bit-reader.js`: lector de bits (3 en 3) sobre un buffer arbitrario.
- `src/encoder/encode.js`: encoder binario → frames RGB → FFmpeg (stdin rawvideo).
- `src/decoder/decode.js`: decoder video → frames RGB → bits → buffer binario.
- `src/services/jobStore.js`: job queue en memoria (processing, completed, error).
- `src/services/youtube.js`: descarga videos de YouTube vía `youtube-dl-exec` (yt-dlp local en `node_modules`).
- `src/controllers/*.js`: lógica de los endpoints.
- `src/routes/*.js`: wiring REST (`/api/encode`, `/api/decode`, `/api/decode-from-youtube`, `/api/status`, `/api/download`, `/api/health`).

---

## Encoder: de archivo binario a video

Archivo principal: `src/encoder/encode.js`.

### Parámetros visuales (en `encoderConfig`)

- `WIDTH = 1920`, `HEIGHT = 1080`.
- `BLOCK_SIZE = 40` → 1920 / 40 = 48 columnas, 1080 / 40 = 27 filas.
- `FPS = 10` (frames generados realmente; para H.264 se duplica a 30fps si se usa modo lossy).
- **Paleta Base‑8**: 8 colores RGB puros:
  - 000: negro, 001: rojo, 010: verde, 011: azul,
  - 100: amarillo, 101: cian, 110: magenta, 111: blanco.

Cada bloque 40×40 tiene **un solo color**, elegido según 3 bits de datos.

### BitReader (lectura de 3 en 3 bits)

Archivo: `src/utils/bit-reader.js`.

Idea: leer un stream de bits de forma continua, sin respetar los límites de byte tradicionales (para poder empaquetar de 3 en 3 bits).

Sintaxis clave:

- `this.bitPos`: índice de bit global.
- `byteIdx = Math.floor(this.bitPos / 8)`: qué byte toca.
- `bitIdx = 7 - (this.bitPos % 8)`: qué bit del byte (MSB first).
- `bit = (buffer[byteIdx] >> bitIdx) & 1`: extrae ese bit.
- `value = (value << 1) | bit`: construye el entero bit a bit.

Esto permite que grupos de 3 bits atraviesen fronteras de byte sin perder continuidad.

### Prefijo de longitud (4 bytes)

En el encoder:

- Se construye un buffer `withLength`:
  - 4 bytes iniciales: longitud original del archivo (`UInt32LE`).
  - Luego, el archivo completo.
- El `BitReader` trabaja sobre `withLength` (y no sobre el buffer original).

En el decoder:

- Se recupera el buffer decodificado completo (`raw`).
- Si `raw.length >= 4`, se lee `len = raw.readUInt32LE(0)` y se devuelve `raw.slice(4, 4 + len)`.
- Esto recorta padding de bits extra y asegura que la imagen (o cualquier archivo binario) tenga exactamente el tamaño original.

### Generación de frames y bloques

En `encodeFileToStream`:

1. Se calcula:
   - `COLS = WIDTH / BLOCK_SIZE = 48`.
   - `ROWS = HEIGHT / BLOCK_SIZE = 27`.
   - `FRAME_SIZE = WIDTH * HEIGHT * 3` (RGB24).
2. Para cada frame:
   - Se inicializa `frameBuffer` a negro (`fill(0)`).
   - Para cada fila de bloques (`row`) y cada columna (`col`):
     - Se leen **3 bits** del `BitReader` → valor `0..7` (`colorIndex`).
     - Si ya no hay bits y todavía no se ha pintado ningún bloque del frame:
       - Si el archivo es vacío, se manda un frame negro y se cierra stdin de FFmpeg.
       - Si no, se cierra stdin directamente.
     - Se obtiene `rgb = encoderConfig.PALETTE[colorIndex]`.
     - Se rellenan los 40×40 píxeles del bloque:
       - `pixelX = col * BLOCK_SIZE + x`, `pixelY = row * BLOCK_SIZE + y`.
       - Índice en el buffer: `pixelIndex = (pixelY * WIDTH + pixelX) * 3`.
3. Al terminar el frame:
   - Se hace `ffmpeg.stdin.write(frameBuffer)`.
   - Si el buffer de FFmpeg está lleno, se espera al evento `'drain'` y se llama de nuevo a `processNextFrame`.
   - Se usa `setImmediate` para no bloquear el event loop.

### Integración con FFmpeg

Encoder invoca FFmpeg vía `child_process.spawn`:

- Entrada (`stdin` de FFmpeg):
  - `-f rawvideo`, `-pixel_format rgb24`, `-video_size 1920x1080`, `-framerate 10`, `-i pipe:0`.
- Modo lossy (pensado para YouTube y round-trip decodificable):
  - `-r 10`, `-c:v libx264`, `-profile:v main`, `-preset medium`, `-crf 14`, `-pix_fmt yuv420p`, `-movflags +faststart`, salida `.mp4`.
- Modo lossless (pruebas locales):
  - `-c:v ffv1`, `-pix_fmt rgb24`, `-r 10`, salida `.mkv`.

La función devuelve una promesa que se resuelve cuando FFmpeg cierra con código 0 y rechaza si FFmpeg falla.

---

## Decoder: de video a archivo binario

Archivo principal: `src/decoder/decode.js`.

### Lectura de frames crudos desde FFmpeg

El decoder arranca un proceso FFmpeg:

- `-i inputPath`: lee cualquier contenedor (mp4, mkv, stream de YouTube descargado).
- `-r FPS`: normaliza a la misma tasa que el encoder (10 fps).
- `-f rawvideo -pix_fmt rgb24 -s 1920x1080 -`: FFmpeg escribe frames RGB24 en `stdout`.

En Node:

- Se concatena lo que llega por `ffmpeg.stdout` en un buffer.
- Mientras `buffer.length >= FRAME_SIZE`:
  - Se extrae un frame (`buffer.subarray(0, FRAME_SIZE)`).
  - Se mueve el resto (`buffer = buffer.subarray(FRAME_SIZE)`).

### Voto por mayoría por bloque (resistencia a compresión)

Debido a la compresión (H.264 + YUV420p), los colores rara vez llegan pixel-perfect.

Para cada bloque 40×40:

1. Se inicializa un array `counts[0..7] = 0`.
2. Para cada píxel del bloque:
   - Se toma su RGB desde el frame.
   - Se mapea con `rgbToPaletteIndex` al índice de paleta más cercano (distancia euclídea en espacio RGB).
   - Se incrementa `counts[i]`.
3. Se elige el índice con mayor conteo (`best`).
4. Se empujan sus 3 bits a un array global de bits:
   - `(best >> 2) & 1`, `(best >> 1) & 1`, `best & 1`.

Esto implementa un “voto de mayoría” robusto a ruido de compresión: incluso si algunos píxeles se degradan, el color dominante del bloque debería persistir.

### Reconstrucción del buffer y recorte por longitud

Al terminar el procesamiento de todos los frames:

1. El array de bits se empaqueta en un `Buffer` con `bitsToBuffer`:
   - Por cada bit:
     - `buf[i >> 3] |= 128 >> (i % 8)` si el bit es 1 (MSB first).
2. Se intenta leer la longitud original:
   - Si `raw.length >= 4`, se lee `len = raw.readUInt32LE(0)`.
   - Si `len > 0` y `len <= raw.length - 4`, se devuelve `raw.slice(4, 4 + len)`.
   - Si no, se devuelve `raw` completo (modo tolerante, por si el video no fue generado por este encoder o hubo corrupción severa).

La función `decodeVideoToFile` simplemente llama a `decodeVideoToBuffer`, escribe el archivo en disco y devuelve la ruta.

---

## API HTTP y Job Queue

Arquitectura asíncrona basada en jobs para sobrevivir a timeouts estrictos de PaaS (Railway, etc.).

### Endpoints principales

- **Healthcheck**
  - `GET /health`
  - `GET /api/health`

- **Encode**
  - `POST /api/encode`  
    - Form-data: `file=@archivo`  
    - Query opcional: `?lossless=true` (usa FFv1 + `.mkv`).
    - Responde `202` con:
      - `jobId`
      - `statusUrl` (`/api/status/:jobId`)

- **Decode desde archivo**
  - `POST /api/decode`  
    - Form-data: `file=@video.mp4` (o `.mkv` lossless).
    - Responde `202` con `jobId`.

- **Decode desde YouTube**
  - `POST /api/decode-from-youtube`  
    - Body JSON: `{ "url": "https://www.youtube.com/watch?v=..." }`
    - Valida la URL con `YOUTUBE_URL_REGEX` (solo `youtube.com/watch` y `youtu.be`).
    - Descarga el video con `youtube-dl-exec` (yt-dlp local) y lanza el decoder.

- **Estado del job**
  - `GET /api/status/:jobId`
  - Respuesta: `{ status: "processing" | "completed" | "error" }`

- **Descarga del resultado**
  - `GET /api/download/:jobId`
  - Si `status === completed`, devuelve:
    - El `.mp4`/`.mkv` (para encode).
    - El archivo binario original reconstruido (para decode).
  - Una vez descargado, se borra el archivo del disco y se limpia el job.

### JobStore en memoria

Archivo: `src/services/jobStore.js`.

- Implementado como `Map<string, Job>`.
- `set(jobId, data)`, `get(jobId)`, `remove(jobId)`.
- Suficiente para un MVP/single-instance; en producción se sustituiría por Redis o una BD.

---

## Sintaxis y patrones “raros” explicados

- `value = (value << 1) | bit`  
  - Operación bit a bit para ir acumulando un entero a partir de bits individuales.
  - `<< 1` desplaza a la izquierda (multiplica por 2), `| bit` añade el nuevo bit menos significativo.

- `buf[i >> 3] |= 128 >> (i % 8)`  
  - Empaquetado de bits en un buffer:
    - `i >> 3` es `Math.floor(i / 8)` (índice de byte).
    - `i % 8` es el índice de bit dentro del byte.
    - `128 >> k` es una máscara con un 1 en la posición de bit correcta (MSB first).

- `blockToPaletteIndexMajority(frame, row, col)`  
  - Recorre todos los píxeles del bloque, los mapea a un índice de paleta y se queda con el más frecuente.
  - Es un pequeño “filtro estadístico” para estabilizar colores degradados por compresión.

- `setImmediate(processNextFrame)`  
  - Deja que el event loop atienda otras tareas antes de procesar el siguiente frame.
  - Evita bloquear Node con un bucle de CPU intensivo.

- `youtube-dl-exec` en lugar de binarios globales:
  - El binario de `yt-dlp` se descarga automáticamente en `node_modules` durante `npm install`.
  - El servicio `downloadYouTubeVideo` solo llama a la función JS `youtubedl(url, flags)`; no hay que instalar nada con `brew` ni apt manualmente.

---

## Modos de uso

### 1. Encode / Decode local (modo lossy, compatible con YouTube)

**Arrancar servidor**:

```bash
npm install
npm start
```

**Encode (archivo → video .mp4)**:

```bash
curl -X POST http://localhost:3000/api/encode \
  -F "file=@test_case/objetivo.png"
```

**Ver estado**:

```bash
curl http://localhost:3000/api/status/JOB_ID
```

**Descargar video**:

```bash
curl -O -J http://localhost:3000/api/download/JOB_ID
```

**Decode (video .mp4 → archivo)**:

```bash
curl -X POST http://localhost:3000/api/decode \
  -F "file=@objetivo.mp4"
```

Mismo patrón: `status` → `download`.

### 2. Encode / Decode local (modo lossless, pruebas de fidelidad)

Para validar el algoritmo sin pérdida (ideal para tests):

```bash
# Encode lossless a .mkv
curl -X POST "http://localhost:3000/api/encode?lossless=true" \
  -F "file=@test_case/objetivo.png"
```

Descarga el `.mkv` resultante, luego:

```bash
curl -X POST http://localhost:3000/api/decode \
  -F "file=@objetivo.mkv"
```

El archivo descargado debería ser **idéntico** al original gracias a:

- Paleta discreta exacta (sin compresión de color).
- FFv1 + RGB24 (sin pérdida).
- Prefijo de longitud y recorte correcto.

### 3. Flujo YouTube (video alojado en YouTube → archivo)

1. **Encode lossy** (para subir a YouTube):

   ```bash
   curl -X POST http://localhost:3000/api/encode \
     -F "file=@test_case/objetivo.png"
   ```

   Sube el `.mp4` generado a YouTube y obtén la URL.

2. **Decode desde YouTube**:

   ```bash
   curl -X POST http://localhost:3000/api/decode-from-youtube \
     -H "Content-Type: application/json" \
     -d '{"url":"https://www.youtube.com/watch?v=TU_VIDEO_ID"}'
   ```

3. Usa `/api/status/:jobId` y `/api/download/:jobId` como en los otros modos.

Este flujo está sujeto a la compresión de YouTube; el voto de mayoría por bloque y el uso de una paleta discreta ayudan a que los datos sobrevivan, pero sigue siendo un entorno lossy por definición.

### 4. Docker

Build:

```bash
docker build -t youtube-infinite-storage .
```

Run:

```bash
docker run --rm -p 3000:3000 youtube-infinite-storage
```

FFmpeg y `youtube-dl-exec` quedan instalados dentro de la imagen; solo necesitas exponer el puerto.

### 4.1. Subir la imagen a Docker Hub

1. **Crear cuenta** en [Docker Hub](https://hub.docker.com) si no tienes una.

2. **Iniciar sesión** en la CLI:
   ```bash
   docker login
   ```
   (Usuario y contraseña de Docker Hub.)

3. **Construir** la imagen (si aún no lo hiciste):
   ```bash
   docker build -t youtube-infinite-storage .
   ```

4. **Etiquetar** la imagen con tu usuario y nombre del repositorio en Docker Hub:
   ```bash
   docker tag youtube-infinite-storage TU_USUARIO/youtube-infinite-storage:latest
   ```
   Sustituye `TU_USUARIO` por tu usuario de Docker Hub. Puedes usar otro nombre de repositorio (ej. `compresor`) y otra etiqueta (ej. `v1.0`) en lugar de `latest`.

5. **Subir** la imagen:
   ```bash
   docker push TU_USUARIO/youtube-infinite-storage:latest
   ```

6. **Ejecutar la imagen desde Docker Hub** (en otra máquina o para compartir):
   ```bash
   docker pull TU_USUARIO/youtube-infinite-storage:latest
   docker run --rm -p 3000:3000 TU_USUARIO/youtube-infinite-storage:latest
   ```

---

## Limitaciones actuales y posibles mejoras

- JobStore solo en memoria (no apto para múltiples réplicas ni reinicios).
- El decoder asume resolución fija 1920×1080 y bloques 40×40; cambiar esto rompe la compatibilidad binaria.
- El voto de mayoría es robusto pero pesado (40×40×1296 píxeles por frame). Se podría optimizar:
  - Muestreando una sub-rejilla de píxeles por bloque.
  - Usando `Uint32Array` y buffers tipados.
- No hay autenticación ni control de tamaño máximo de archivo/video (pendiente para un entorno multi-tenant).

