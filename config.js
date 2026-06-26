'use strict';

require('dotenv').config();

let { APS_CLIENT_ID, APS_CLIENT_SECRET, APS_BUCKET, PORT } = process.env;

if (!APS_CLIENT_ID || !APS_CLIENT_SECRET) {
  console.error('Faltan APS_CLIENT_ID o APS_CLIENT_SECRET. Copia .env.example como .env y completa las credenciales.');
  process.exit(1);
}

APS_BUCKET = (APS_BUCKET || `${APS_CLIENT_ID.toLowerCase()}-dwg-search`)
  .replace(/[^a-z0-9_-]/g, '-')
  .slice(0, 128);
PORT = Number(PORT || 8080);

module.exports = {
  APS_CLIENT_ID,
  APS_CLIENT_SECRET,
  APS_BUCKET,
  PORT
};
