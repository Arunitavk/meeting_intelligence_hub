import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, 'meeting_intelligence.db');
const SCHEMA_PATH = join(__dirname, 'schema.sql');

let db;

export function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');   // better concurrent read performance
    db.pragma('foreign_keys = ON');

    const schema = readFileSync(SCHEMA_PATH, 'utf8');
    db.exec(schema);
  }
  return db;
}
