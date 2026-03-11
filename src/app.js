import express from 'express';
import routes from './routes/index.js';

const app = express();

app.use(express.json());

app.use('/api', routes);

// Healthcheck también en raíz para convención PaaS (ej. GET /health)
app.get('/health', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    env: process.env.NODE_ENV ?? 'development',
  });
});

// 404
app.use((_req, res) => {
  res.status(404).json({ error: 'Not Found' });
});

// Error handler global
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status ?? 500).json({
    error: err.message ?? 'Internal Server Error',
  });
});

export default app;
