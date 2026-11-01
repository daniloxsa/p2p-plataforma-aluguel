import 'dotenv/config';
import { Client } from 'pg';

// Metadata only: no row data, credentials or schema changes.
const client = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000 });
try {
  await client.connect();
  await client.query('BEGIN READ ONLY');
  const constraints = await client.query(`SELECT conname, pg_get_constraintdef(oid) AS definition
    FROM pg_constraint WHERE conrelid = 'public.anuncio'::regclass ORDER BY conname`);
  const indexes = await client.query(`SELECT indexname, indexdef FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'anuncio' ORDER BY indexname`);
  const triggers = await client.query(`SELECT t.tgname, pg_get_triggerdef(t.oid) AS definition,
    pg_get_functiondef(t.tgfoid) AS function_definition FROM pg_trigger t
    WHERE t.tgrelid = 'public.anuncio'::regclass AND NOT t.tgisinternal ORDER BY t.tgname`);
  console.log(JSON.stringify({ constraints: constraints.rows, indexes: indexes.rows, triggers: triggers.rows }, null, 2));
  await client.query('ROLLBACK');
} finally { await client.end(); }
