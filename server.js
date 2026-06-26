'use strict';

const express = require('express');
const path = require('path');
const { PORT } = require('./config.js');

const app = express();

app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(require('./routes/auth.js'));
app.use(require('./routes/models.js'));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'DWG Buscador Web' });
});

app.use((err, _req, res, _next) => {
  console.error(err);
  const message = err?.response?.data?.diagnostic
    || err?.axiosError?.response?.data?.diagnostic
    || err?.message
    || 'Error interno del servidor.';
  res.status(err?.status || 500).json({ error: message });
});

app.listen(PORT, () => {
  console.log(`DWG Buscador Web disponible en http://localhost:${PORT}`);
});
