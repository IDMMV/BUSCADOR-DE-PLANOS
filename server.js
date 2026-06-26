const express = require('express');
const cors    = require('cors');
const path    = require('path');
const axios   = require('axios');
const multer  = require('multer');

const app    = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 200 * 1024 * 1024 } });

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const APS_BASE   = 'https://developer.api.autodesk.com';
const CLIENT_ID  = process.env.APS_CLIENT_ID  || '';
const CLIENT_SEC = process.env.APS_CLIENT_SECRET || '';

function getBucket() {
  const base = CLIENT_ID.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 20);
  return process.env.APS_BUCKET || ('dwgvisor' + base + 'bkt');
}

let _token = null, _expiry = 0;

async function getToken() {
  if (_token && Date.now() < _expiry - 60000) return _token;
  const credentials = Buffer.from(`${CLIENT_ID}:${CLIENT_SEC}`).toString('base64');
  const params = 'grant_type=client_credentials&scope=data%3Aread%20data%3Awrite%20data%3Acreate%20bucket%3Acreate%20bucket%3Aread';
  const { data } = await axios.post(`${APS_BASE}/authentication/v2/token`, params, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Authorization': `Basic ${credentials}` }
  });
  _token  = data.access_token;
  _expiry = Date.now() + data.expires_in * 1000;
  return _token;
}

async function ensureBucket(token) {
  const bucket = getBucket();
  try {
    await axios.get(`${APS_BASE}/oss/v2/buckets/${bucket}/details`, { headers: { Authorization: 'Bearer ' + token } });
  } catch {
    await axios.post(`${APS_BASE}/oss/v2/buckets`, { bucketKey: bucket, policyKey: 'transient' },
      { headers: { Authorization: 'Bearer ' + token } }
    ).catch(e => { if (e.response?.status !== 409) throw e; });
  }
  return bucket;
}

async function uploadFileNew(token, bucket, key, buffer) {
  const { data: urlData } = await axios.get(
    `${APS_BASE}/oss/v2/buckets/${bucket}/objects/${key}/signeds3upload?minutesExpiration=10`,
    { headers: { Authorization: 'Bearer ' + token } }
  );
  const uploadKey = urlData.uploadKey;
  const urls      = urlData.urls || [urlData.url];
  await axios.put(urls[0], buffer, {
    headers: { 'Content-Type': 'application/octet-stream' },
    maxBodyLength: Infinity
  });
  const { data } = await axios.post(
    `${APS_BASE}/oss/v2/buckets/${bucket}/objects/${key}/signeds3upload`,
    { uploadKey },
    { headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' } }
  );
  return data.objectId || data.object_id || `urn:adsk.objects:os.object:${bucket}/${key}`;
}

app.get('/api/auth/token', async (req, res) => {
  try {
    const token = await getToken();
    res.json({ access_token: token, expires_in: 3600 });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/models/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No se recibió archivo' });
    const token  = await getToken();
    const bucket = await ensureBucket(token);
    const key    = req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    const objectId = await uploadFileNew(token, bucket, key, req.file.buffer);
    const urnB64   = Buffer.from(objectId).toString('base64').replace(/=/g, '');
    await axios.post(`${APS_BASE}/modelderivative/v2/designdata/job`,
      { input: { urn: urnB64 }, output: { formats: [{ type: 'svf2', views: ['2d', '3d'] }] } },
      { headers: { Authorization: 'Bearer ' + token, 'x-ads-force': 'true' } }
    );
    res.json({ urn: urnB64 });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/models/status/:urn', async (req, res) => {
  try {
    const token = await getToken();
    const { data } = await axios.get(
      `${APS_BASE}/modelderivative/v2/designdata/${req.params.urn}/manifest`,
      { headers: { Authorization: 'Bearer ' + token } }
    );
    res.json({ status: data.status, progress: data.progress || '0%' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('✅ DWG Visor corriendo en puerto ' + PORT));
