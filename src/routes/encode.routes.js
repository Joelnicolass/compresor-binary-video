import { Router } from 'express';
import multer from 'multer';
import { paths } from '../config/index.js';
import { postEncode, getStatus, getDownload } from '../controllers/encode.controller.js';
import { postDecode, postDecodeFromYoutube } from '../controllers/decode.controller.js';

const router = Router();

const upload = multer({
  dest: paths.uploads,
});

router.post('/encode', upload.single('file'), postEncode);
router.post('/decode', upload.single('file'), postDecode);
router.post('/decode-from-youtube', postDecodeFromYoutube);
router.get('/status/:jobId', getStatus);
router.get('/download/:jobId', getDownload);

export default router;
