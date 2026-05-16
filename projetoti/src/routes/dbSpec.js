// src/dbSpec.js
const mysql = require('mysql2/promise');
require('dotenv').config();

const poolSpec = mysql.createPool({
  host: process.env.DB_HOST || process.env.MYSQLHOST || 'localhost',
  port: Number(process.env.DB_PORT || process.env.MYSQLPORT || 3306),
  user: process.env.DB_USER || process.env.MYSQLUSER || 'root',
  password: process.env.DB_PASS || process.env.MYSQLPASSWORD || '',
  database: 'sistema_voos_spec', // <- banco SPEC de usuário/LGPD
  waitForConnections: true,
  connectionLimit: 10
});

module.exports = poolSpec;
