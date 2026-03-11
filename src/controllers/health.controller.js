/**
 * Controlador del healthcheck.
 * Útil para load balancers, PaaS (Railway, etc.) y monitoreo.
 */
export function getHealth(_req, res) {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    env: process.env.NODE_ENV ?? 'development',
  });
}
