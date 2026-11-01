import 'dotenv/config';
import { Client } from 'pg';

// Metadata only. Do not read users, sessions, tokens or credentials.
const db = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000 });
try {
  await db.connect();
  await db.query('BEGIN READ ONLY');
  const columns = await db.query(`SELECT column_name, data_type, character_maximum_length, is_nullable, column_default
    FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'usuario' AND column_name = 'papel'`);
  const tables = await db.query(`SELECT tablename FROM pg_tables WHERE schemaname = 'public'
    AND (tablename ILIKE '%audit%' OR tablename ILIKE '%historico%') ORDER BY tablename`);
  const checks = await db.query(`SELECT conname, pg_get_constraintdef(oid) AS definition
    FROM pg_constraint WHERE conrelid = 'public.usuario'::regclass AND contype = 'c' ORDER BY conname`);
  console.log(JSON.stringify({ papel: columns.rows, auditTables: tables.rows, usuarioChecks: checks.rows }, null, 2));
  await db.query('ROLLBACK');
} catch {
  console.error('Não foi possível inspecionar os metadados. Nenhuma alteração foi aplicada.');
  process.exitCode = 1;
} finally { await db.end(); }
