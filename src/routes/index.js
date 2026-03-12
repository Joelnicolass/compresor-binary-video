import { Router } from 'express';
import healthRoutes from './health.routes.js';
import encodeRoutes from './encode.routes.js';
import maintenanceRoutes from './maintenance.routes.js';

const router = Router();

router.use('/health', healthRoutes);
router.use('/', encodeRoutes);
router.use('/maintenance', maintenanceRoutes);

export default router;
