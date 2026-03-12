import jwt from 'jsonwebtoken';
import { infraConfig } from '../config/index.js';

export function requireMaintenanceJwt(req, res, next) {
  if (!infraConfig.cleanupJwtSecret) {
    return res.status(500).json({
      error: 'CLEANUP_JWT_SECRET no configurado en el servidor.',
    });
  }

  const auth = req.headers.authorization ?? '';
  const [scheme, token] = auth.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Token Bearer requerido.' });
  }

  try {
    jwt.verify(token, infraConfig.cleanupJwtSecret, { algorithms: ['HS256'] });
    return next();
  } catch (_err) {
    return res.status(401).json({ error: 'Token inválido o expirado.' });
  }
}
