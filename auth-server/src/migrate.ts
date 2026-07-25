import { pool } from './db.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function migrate() {
  const sql = await fs.readFile(
    path.join(__dirname, '../migrations/001_init.sql'),
    'utf8'
  );
  await pool.query(sql);
}
