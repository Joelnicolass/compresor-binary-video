import { Router } from 'express';
import { postCleanupTmp } from '../controllers/maintenance.controller.js';
import { requireMaintenanceJwt } from '../middlewares/maintenance-auth.js';

const router = Router();

router.post('/cleanup', requireMaintenanceJwt, postCleanupTmp);

export default router;
