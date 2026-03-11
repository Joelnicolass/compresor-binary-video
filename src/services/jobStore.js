/**
 * Almacén en memoria de jobs de codificación.
 * En producción conviene sustituir por Redis o BD.
 */
const jobs = new Map();

export function set(jobId, data) {
  jobs.set(jobId, data);
}

export function get(jobId) {
  return jobs.get(jobId);
}

export function remove(jobId) {
  jobs.delete(jobId);
}
