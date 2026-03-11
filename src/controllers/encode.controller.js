import fs from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { encodeFileToStream } from "../encoder/encode.js";
import * as jobStore from "../services/jobStore.js";
import { paths } from "../config/index.js";

/**
 * POST /api/encode - Recibe archivo, lanza encoding en segundo plano, responde 202.
 */
export function postEncode(req, res, next) {
  if (!req.file) {
    return res.status(400).json({ error: "Archivo no proporcionado." });
  }

  const jobId = uuidv4();
  const lossless = req.query.lossless === "true";
  const ext = lossless ? "mkv" : "mp4";
  const inputPath = req.file.path;
  const outputPath = path.join(paths.outputs, `${jobId}.${ext}`);

  jobStore.set(jobId, {
    status: "processing",
    filename: req.file.originalname,
  });

  encodeFileToStream(inputPath, outputPath, { lossless })
    .then(() => {
      jobStore.set(jobId, {
        status: "completed",
        file: outputPath,
        filename: req.file.originalname,
      });
      fs.rmSync(inputPath, { force: true });
    })
    .catch((err) => {
      console.error(`Error en job ${jobId}:`, err);
      jobStore.set(jobId, { status: "error", message: err.message });
      try {
        fs.rmSync(inputPath, { force: true });
      } catch (_) {}
    });

  res.status(202).json({
    message: "Procesamiento iniciado",
    jobId,
    statusUrl: `/api/status/${jobId}`,
  });
}

/**
 * GET /api/status/:jobId - Polling de estado del job.
 */
export function getStatus(req, res) {
  const job = jobStore.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: "Job no encontrado" });
  res.json({ status: job.status });
}

/**
 * GET /api/download/:jobId - Descarga el .mp4 y borra del servidor.
 */
export function getDownload(req, res) {
  const job = jobStore.get(req.params.jobId);

  if (!job || job.status !== "completed") {
    return res
      .status(400)
      .json({ error: "Video no disponible o aún procesando" });
  }

  const ext = job.file.endsWith(".mkv") ? "mkv" : "mp4";
  const base = job.filename.replace(/\.(mp4|mkv)$/i, "") || job.filename;
  const downloadName = `${base}.${ext}`;

  res.download(job.file, downloadName, (err) => {
    if (!err) {
      try {
        fs.rmSync(job.file, { force: true });
      } catch (_) {}
      jobStore.remove(req.params.jobId);
    }
  });
}
