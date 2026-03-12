import fs from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { encodeFileToStream } from "../encoder/encode.js";
import * as jobStore from "../services/jobStore.js";
import { publishEvent } from "../services/rabbit.js";
import { paths } from "../config/index.js";

/**
 * POST /api/encode - Recibe archivo, lanza encoding en segundo plano, responde 202.
 */
export async function postEncode(req, res, next) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Archivo no proporcionado." });
    }

    const jobId = uuidv4();
    const lossless = req.query.lossless === "true";
    const ext = lossless ? "mkv" : "mp4";
    const inputPath = req.file.path;
    const outputPath = path.join(paths.outputs, `${jobId}.${ext}`);

    await jobStore.set(jobId, {
      status: "processing",
      filename: req.file.originalname,
    });
    void publishEvent("job.created", {
      jobId,
      type: "encode",
      filename: req.file.originalname,
    });

    encodeFileToStream(inputPath, outputPath, { lossless })
      .then(async () => {
        await jobStore.set(jobId, {
          status: "completed",
          file: outputPath,
          filename: req.file.originalname,
        });
        void publishEvent("job.completed", {
          jobId,
          type: "encode",
          filename: req.file.originalname,
        });
        fs.rmSync(inputPath, { force: true });
      })
      .catch((err) => {
        console.error(`Error en job ${jobId}:`, err);
        void jobStore.set(jobId, { status: "error", message: err.message });
        void publishEvent("job.failed", {
          jobId,
          type: "encode",
          message: err.message,
        });
        try {
          fs.rmSync(inputPath, { force: true });
        } catch (_) {}
      });

    return res.status(202).json({
      message: "Procesamiento iniciado",
      jobId,
      statusUrl: `/api/status/${jobId}`,
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * GET /api/status/:jobId - Polling de estado del job.
 */
export async function getStatus(req, res, next) {
  try {
    const job = await jobStore.get(req.params.jobId);
    if (!job) return res.status(404).json({ error: "Job no encontrado" });
    return res.json({ status: job.status });
  } catch (err) {
    return next(err);
  }
}

/**
 * GET /api/download/:jobId - Descarga el .mp4 y borra del servidor.
 */
export async function getDownload(req, res, next) {
  let job;
  try {
    job = await jobStore.get(req.params.jobId);
  } catch (err) {
    return next(err);
  }

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
      void jobStore.remove(req.params.jobId);
      void publishEvent("job.downloaded", {
        jobId: req.params.jobId,
        type: "download",
        filename: downloadName,
      });
    }
  });
}
