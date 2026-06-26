const express = require('express');
const multer  = require('multer');
const router  = express.Router();
const { uploadFile, startTranslation, getManifest } = require('../services/aps');
const upload  = multer({ storage: multer.memoryStorage(), limits: { fileSize: 200 * 1024 * 1024 } });

router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No se recibió archivo' });
    const objectId = await uploadFile(req.file.buffer, req.file.originalname);
    const urnB64   = Buffer.from(objectId).toString('base64').replace(/=/g, '');
    await startTranslation(urnB64);
    res.json({ urn: urnB64 });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/status/:urn', async (req, res) => {
  try {
    const m = await getManifest(req.params.urn);
    res.json({ status: m.status, progress: m.progress || '0%' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
