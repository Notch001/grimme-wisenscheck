import pg from 'pg';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// NUMERIC als Zahl statt String liefern
pg.types.setTypeParser(1700, (v) => (v === null ? null : parseFloat(v)));

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://wissenscheck:wissenscheck@localhost:5432/wissenscheck',
});

export const q = (text, params) => pool.query(text, params);

export async function initDb(retries = 30) {
  const schema = readFileSync(fileURLToPath(new URL('./schema.sql', import.meta.url)), 'utf8');
  for (let i = 0; ; i++) {
    try {
      await pool.query(schema);
      return;
    } catch (err) {
      if (i >= retries) throw err;
      console.log(`Warte auf Datenbank (${err.code || err.message}) …`);
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}
