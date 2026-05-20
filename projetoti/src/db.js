const mysql = require('mysql2/promise');
require('dotenv').config();

const useSsl = String(process.env.MYSQL_SSL || process.env.DB_SSL || '').toLowerCase() === 'true';

const pool = mysql.createPool({
  host: process.env.MYSQLHOST || process.env.DB_HOST || 'localhost',
  port: Number(process.env.MYSQLPORT || process.env.DB_PORT || 3306),
  user: process.env.MYSQLUSER || process.env.DB_USER || 'root',
  password: process.env.MYSQLPASSWORD || process.env.DB_PASS || '',
  database: 'sistema_voos',
  ssl: useSsl ? { rejectUnauthorized: false } : undefined,
  waitForConnections: true,
  connectionLimit: 10
});

module.exports = pool;
