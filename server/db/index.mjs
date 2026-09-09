import fs from 'node:fs';
import path from 'node:path';
import { AsyncLocalStorage } from 'node:async_hooks';
import { DatabaseSync } from 'node:sqlite';
import { config } from '../config.mjs';
import { schemaSql } from './schema.mjs';

let sqlite = null;
let pool = null;
let initialized = false;
const txStore = new AsyncLocalStorage();

export const databaseEngine = config.databaseUrl ? 'postgres' : 'sqlite';

function pgSql(sql) {
  let out = '';
  let index = 1;
  let single = false;
  let double = false;
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    const prev = sql[i - 1];
    if (ch === "'" && !double && prev !== '\\') single = !single;
    else if (ch === '"' && !single && prev !== '\\') double = !double;
    if (ch === '?' && !single && !double) out += `$${index++}`;
    else out += ch;
  }
  return out;
}

function postgresSchema(sql) {
  return sql
    .replace(/^PRAGMA[^;]+;\s*/gmi, '')
    .replace(/\s+COLLATE\s+NOCASE/gi, '')
    .replace(/INSERT\s+OR\s+IGNORE\s+INTO/gi, 'INSERT INTO')
    .replace(/MAX\(0\s*,\s*stock-/gi, 'GREATEST(0,stock-')
    .replace(/MAX\(0\s*,\s*reserved-/gi, 'GREATEST(0,reserved-');
}

async function target() {
  if (databaseEngine === 'sqlite') return sqlite;
  return txStore.getStore() || pool;
}

export async function initDb() {
  if (initialized) return;
  if (databaseEngine === 'sqlite') {
    fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });
    sqlite = new DatabaseSync(config.dbPath);
    sqlite.exec(schemaSql);
  } else {
    const { Pool } = await import('pg');
    pool = new Pool({
      connectionString: config.databaseUrl,
      ssl: config.databaseSsl ? { rejectUnauthorized: false } : undefined,
      max: config.databasePoolMax,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000
    });
    await pool.query(postgresSchema(schemaSql));
  }
  const { migrateDatabase } = await import('./migrations.mjs');
  await migrateDatabase();
  const { seedDatabase } = await import('./seed.mjs');
  await seedDatabase();
  initialized = true;
}

export async function closeDb() {
  if (sqlite) { try { sqlite.close(); } catch {} sqlite = null; }
  if (pool) { await pool.end(); pool = null; }
  initialized = false;
}

export async function dbGet(sql, params = []) {
  if (databaseEngine === 'sqlite') return sqlite.prepare(sql).get(...params);
  const client = await target();
  const result = await client.query(pgSql(sql), params);
  return result.rows[0];
}

export async function dbAll(sql, params = []) {
  if (databaseEngine === 'sqlite') return sqlite.prepare(sql).all(...params);
  const client = await target();
  const result = await client.query(pgSql(sql), params);
  return result.rows;
}

export async function dbRun(sql, params = []) {
  if (databaseEngine === 'sqlite') return sqlite.prepare(sql).run(...params);
  const client = await target();
  let query = pgSql(sql);
  if (/^\s*INSERT\s+INTO\s+/i.test(query) && /ON\s+CONFLICT\s+DO\s+NOTHING/i.test(query) === false && /INSERT\s+OR\s+IGNORE/i.test(sql)) {
    query += ' ON CONFLICT DO NOTHING';
  }
  const result = await client.query(query, params);
  return { changes: result.rowCount ?? 0 };
}

export async function dbExec(sql) {
  if (databaseEngine === 'sqlite') { sqlite.exec(sql); return; }
  const client = await target();
  await client.query(postgresSchema(sql));
}

export async function transaction(fn) {
  if (databaseEngine === 'sqlite') {
    sqlite.exec('BEGIN IMMEDIATE');
    try {
      const result = await fn();
      sqlite.exec('COMMIT');
      return result;
    } catch (error) {
      try { sqlite.exec('ROLLBACK'); } catch {}
      throw error;
    }
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await txStore.run(client, fn);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch {}
    throw error;
  } finally {
    client.release();
  }
}

export function jsonValue(text, fallback) {
  try { return text ? JSON.parse(text) : fallback; } catch { return fallback; }
}

export const __dbTest = Object.freeze({ pgSql, postgresSchema });
