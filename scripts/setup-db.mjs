import dotenv from '../backend/node_modules/dotenv/lib/main.js';
import mysql from '../backend/node_modules/mysql2/promise.js';
import { fileURLToPath } from 'node:url';

dotenv.config({ path: fileURLToPath(new URL('../.env', import.meta.url)) });
const { DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD } = process.env;
if (!DB_NAME || !DB_USER || !DB_PASSWORD) throw new Error('Run npm run setup and configure .env first.');
if (!['localhost', '127.0.0.1'].includes(DB_HOST)) {
  throw new Error('This setup script only provisions a local development database.');
}
const connection = await mysql.createConnection({
  host: DB_HOST,
  port: Number(DB_PORT || 3306),
  user: process.env.DB_SETUP_USER || 'root',
  password: process.env.DB_SETUP_PASSWORD || '',
});
try {
  await connection.query('CREATE DATABASE IF NOT EXISTS ?? CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci', [DB_NAME]);
  await connection.query("CREATE USER IF NOT EXISTS ?@'localhost' IDENTIFIED BY ?", [DB_USER, DB_PASSWORD]);
  await connection.query("GRANT ALL PRIVILEGES ON ??.* TO ?@'localhost'", [DB_NAME, DB_USER]);
  console.info('Local database and application user are ready. Existing users and data were preserved.');
} finally {
  await connection.end();
}
