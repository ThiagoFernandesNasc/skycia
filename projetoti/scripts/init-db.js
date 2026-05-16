const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config();

async function runSqlFile(connection, fileName) {
  const filePath = path.resolve(__dirname, '..', fileName);
  const sql = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
  await connection.query(sql);
  console.log(`Banco inicializado: ${fileName}`);
}

async function initDatabases() {
  const connection = await mysql.createConnection({
    host: process.env.MYSQLHOST || process.env.DB_HOST || 'localhost',
    port: Number(process.env.MYSQLPORT || process.env.DB_PORT || 3306),
    user: process.env.MYSQLUSER || process.env.DB_USER || 'root',
    password: process.env.MYSQLPASSWORD || process.env.DB_PASS || '',
    multipleStatements: true,
  });

  try {
    await runSqlFile(connection, 'operacional.sql');
    await runSqlFile(connection, 'spec.sql');
  } finally {
    await connection.end();
  }
}

if (require.main === module) {
  initDatabases().catch((err) => {
    console.error(`Falha ao inicializar banco: ${err.code || err.name || 'ERROR'} ${err.message || err}`);
    process.exit(1);
  });
}

module.exports = { initDatabases };
