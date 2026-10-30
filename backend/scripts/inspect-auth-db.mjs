import 'dotenv/config';
import { Client } from 'pg';

const client = new Client({ connectionString: process.env.DATABASE_URL });
try {
  await client.connect();
  const tables = await client.query("SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename");
  const constraints = await client.query("SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid = 'public.usuario'::regclass AND contype = 'c'");
  console.log(JSON.stringify({ tables: tables.rows.map(r => r.tablename), usuarioChecks: constraints.rows }, null, 2));
} finally { await client.end(); }
