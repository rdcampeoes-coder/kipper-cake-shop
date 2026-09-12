import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

export const hasDatabase = Boolean(process.env.DATABASE_URL);
export const pool = hasDatabase ? new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized:false } : false
}) : null;

export async function initDatabase(){
  if(!pool) return false;
  const schema = fs.readFileSync(path.join(rootDir,'sql','schema.sql'),'utf8');
  await pool.query(schema);
  return true;
}
