import { Router } from 'express';
import healthRoutes from './health.routes.js';
import encodeRoutes from './encode.routes.js';

const router = Router();

router.use('/health', healthRoutes);
router.use('/', encodeRoutes);

export default router;
