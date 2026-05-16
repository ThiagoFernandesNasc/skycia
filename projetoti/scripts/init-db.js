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
    host: process.env.DB_HOST || process.env.MYSQLHOST || 'localhost',
    port: Number(process.env.DB_PORT || process.env.MYSQLPORT || 3306),
    user: process.env.DB_USER || process.env.MYSQLUSER || 'root',
    password: process.env.DB_PASS || process.env.MYSQLPASSWORD || '',
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
    console.error(`Falha ao inicializar banco: ${err.message}`);
    process.exit(1);
  });
}

module.exports = { initDatabases };
