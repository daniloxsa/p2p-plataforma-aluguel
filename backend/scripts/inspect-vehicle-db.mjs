import 'dotenv/config';
import { Client } from 'pg';
const client = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000 });
try {
  await client.connect();
  const checks = await client.query(`SELECT conrelid::regclass::text AS tabela, conname, pg_get_constraintdef(oid) AS definition
    FROM pg_constraint WHERE conrelid IN ('public.veiculo'::regclass, 'public.anuncio'::regclass, 'public.reserva'::regclass) AND contype = 'c' ORDER BY conname`);
  console.log(JSON.stringify({ checks: checks.rows }, null, 2));
} finally { await client.end(); }
