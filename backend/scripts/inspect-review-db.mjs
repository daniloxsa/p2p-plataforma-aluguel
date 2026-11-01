import 'dotenv/config';
import { Client } from 'pg';
const db = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000 });
try {
  await db.connect(); await db.query('BEGIN READ ONLY');
  const result = await db.query(`SELECT conrelid::regclass::text AS tabela, conname, pg_get_constraintdef(oid) AS definition
    FROM pg_constraint WHERE conrelid IN ('public.veiculo'::regclass, 'public.documento_veiculo'::regclass) ORDER BY conname`);
  const documents = await db.query(`SELECT tipo, status_validacao, count(*)::int AS quantidade FROM public.documento_veiculo GROUP BY tipo,status_validacao`);
  console.log(JSON.stringify({ constraints: result.rows, documents: documents.rows }, null, 2));
  await db.query('ROLLBACK');
} catch { console.error('Inspeção de metadados indisponível; nenhuma alteração aplicada.'); process.exitCode = 1; }
finally { await db.end(); }
