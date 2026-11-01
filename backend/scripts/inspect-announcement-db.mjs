import 'dotenv/config';
import { Client } from 'pg';

// Read-only local inspection. Never print connection strings, credentials or PII.
const connection = process.env.DATABASE_URL;
let target;
try { target = new URL(connection); } catch {}
if (!target || !['localhost', '127.0.0.1', '[::1]'].includes(target.hostname) || target.pathname !== '/univia_db') {
  console.error('Inspeção permitida apenas no banco local univia_db. Nenhuma conexão aberta.');
  process.exitCode = 1;
} else {
  const db = new Client({ connectionString: connection, connectionTimeoutMillis: 5000 });
  try {
    await db.connect(); await db.query('BEGIN READ ONLY');
    const constraints = await db.query(`SELECT conrelid::regclass::text AS tabela, conname, pg_get_constraintdef(oid) AS definition
      FROM pg_constraint WHERE conrelid IN ('public.anuncio'::regclass,'public.reserva'::regclass,'public.bloqueio_disponibilidade'::regclass) ORDER BY conname`);
    const indexes = await db.query("SELECT indexname,indexdef FROM pg_indexes WHERE schemaname='public' AND tablename='anuncio'");
    const duplicates = await db.query("SELECT veiculo_id, count(*)::int AS quantidade FROM public.anuncio WHERE status IN ('RASCUNHO','ATIVO','PAUSADO') GROUP BY veiculo_id HAVING count(*) > 1 ORDER BY veiculo_id");
    const history = await db.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND (table_name LIKE '%historico%' OR table_name LIKE '%auditoria%') ORDER BY table_name");
    console.log(JSON.stringify({ constraints: constraints.rows, indexes: indexes.rows, duplicates: duplicates.rows, history: history.rows }, null, 2));
    await db.query('ROLLBACK');
  } catch { console.error('Inspeção local indisponível; nenhuma alteração aplicada.'); process.exitCode = 1; }
  finally { await db.end(); }
}
