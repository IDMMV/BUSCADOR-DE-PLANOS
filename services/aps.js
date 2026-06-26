const axios = require('axios');

const APS_BASE   = 'https://developer.api.autodesk.com';
const CLIENT_ID  = process.env.APS_CLIENT_ID;
const CLIENT_SEC = process.env.APS_CLIENT_SECRET || 'WLTEryhcX5MfItgRUr8W2buw3Xwl4ij9whKX7BVDIHgdhNSutmvGpPJwc0zabe6V';

function getBucket() {
  return process.env.APS_BUCKET || ('dwgvisor' + CLIENT_ID.toLowerCase().replace(/[^a-z0-9]/g,'').substring(0,20) + 'bkt');
}

let _token = null, _expiry = 0;

async function getToken() {
  if (_token && Date.now() < _expiry - 60000) return _token;

  // APS 2.0 usa Basic Auth con client_id:client_secret en Base64
  const credentials = Buffer.from(`${CLIENT_ID}:${CLIENT_SEC}`).toString('base64');

  const params = new URLSearchParams({
    grant_type: 'client_credentials',
    scope: 'data:read data:write data:create bucket:create bucket:read'
  });

  const { data } = await axios.post(
    `${APS_BASE}/authentication/v2/token`,
    params.toString(),
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${credentials}`
      }
    }
  );

  _token  = data.access_token;
  _expiry = Date.now() + data.expires_in * 1000;
  return _token;
}

async function ensureBucket() {
  const token  = await getToken();
  const bucket = getBucket();
  try {
    await axios.get(`${APS_BASE}/oss/v2/buckets/${bucket}/details`, {
      headers: { Authorization: 'Bearer ' + token }
    });
  } catch(e) {
    if (e.response?.status !== 404) {
      // bucket exists or other error
      if (e.response?.status !== 404) {
        try {
          await axios.post(`${APS_BASE}/oss/v2/buckets`,
            { bucketKey: bucket, policyKey: 'transient' },
            { headers: { Authorization: 'Bearer ' + token } }
          );
        } catch(e2) {
          if (e2.response?.status !== 409) throw e2;
        }
      }
    } else {
      await axios.post(`${APS_BASE}/oss/v2/buckets`,
        { bucketKey: bucket, policyKey: 'transient' },
        { headers: { Authorization: 'Bearer ' + token } }
      ).catch(e2 => { if (e2.response?.status !== 409) throw e2; });
    }
  }
  return bucket;
}

async function uploadFile(buffer, filename) {
  const token  = await getToken();
  const bucket = await ensureBucket();
  const key    = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  const { data } = await axios.put(
    `${APS_BASE}/oss/v2/buckets/${bucket}/objects/${key}`,
    buffer,
    {
      headers: {
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/octet-stream'
      },
      maxBodyLength: Infinity,
      maxContentLength: Infinity
    }
  );
  return data.objectId;
}

async function startTranslation(urnB64) {
  const token = await getToken();
  await axios.post(
    `${APS_BASE}/modelderivative/v2/designdata/job`,
    { input: { urn: urnB64 }, output: { formats: [{ type: 'svf2', views: ['2d', '3d'] }] } },
    { headers: { Authorization: 'Bearer ' + token, 'x-ads-force': 'true' } }
  );
}

async function getManifest(urnB64) {
  const token = await getToken();
  const { data } = await axios.get(
    `${APS_BASE}/modelderivative/v2/designdata/${urnB64}/manifest`,
    { headers: { Authorization: 'Bearer ' + token } }
  );
  return data;
}

module.exports = { getToken, uploadFile, startTranslation, getManifest };
