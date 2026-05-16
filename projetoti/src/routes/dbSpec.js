// src/dbSpec.js
const mysql = require('mysql2/promise');
require('dotenv').config();

const poolSpec = mysql.createPool({
  host: process.env.MYSQLHOST || process.env.DB_HOST || 'localhost',
  port: Number(process.env.MYSQLPORT || process.env.DB_PORT || 3306),
  user: process.env.MYSQLUSER || process.env.DB_USER || 'root',
  password: process.env.MYSQLPASSWORD || process.env.DB_PASS || '',
  database: 'sistema_voos_spec', // <- banco SPEC de usuário/LGPD
  waitForConnections: true,
  connectionLimit: 10
});

module.exports = poolSpec;
