import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from '../src/db.js';

const dir = path.dirname(fileURLToPath(import.meta.url));
const sql = fs.readFileSync(path.join(dir, 'schema.sql'), 'utf8');
await pool.query(sql);
console.log('Database tables are ready.');
await pool.end();
