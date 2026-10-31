-- Apply manually before deploying the photo module. Additive; preserves existing photos/FKs.
BEGIN;
-- Fail safely on unexpected live schema drift instead of dropping constraints.
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_index i JOIN pg_attribute a
      ON a.attrelid = i.indrelid AND a.attname = 'veiculo_id'
    WHERE i.indrelid = 'foto_veiculo'::regclass AND i.indisunique
      AND i.indpred IS NULL AND i.indnkeyatts = 1 AND i.indkey[0] = a.attnum
  ) THEN
    RAISE EXCEPTION 'foto_veiculo has total unique veiculo_id index; audit required before photo migration';
  END IF;
END $$;
ALTER TABLE foto_veiculo ADD COLUMN IF NOT EXISTS conteudo_hash varchar(64);
CREATE UNIQUE INDEX IF NOT EXISTS uq_foto_conteudo ON foto_veiculo(veiculo_id, conteudo_hash);
CREATE INDEX IF NOT EXISTS idx_foto_veiculo_ordem ON foto_veiculo(veiculo_id, ordem, id);
-- Preserve the existing partial unique index, never replace it with total uniqueness.
CREATE UNIQUE INDEX IF NOT EXISTS uq_foto_principal_veiculo ON foto_veiculo(veiculo_id) WHERE principal = true;
-- Durable upload reservations and deletion outbox. Intentionally no cascading FK:
-- cleanup must survive removal of a vehicle.
CREATE TABLE IF NOT EXISTS foto_storage_operacao (
  id uuid PRIMARY KEY,
  veiculo_id uuid NOT NULL,
  caminho text NOT NULL UNIQUE,
  conteudo_hash varchar(64),
  estado varchar(12) NOT NULL CHECK (estado IN ('UPLOAD', 'LIMPEZA')),
  criado_em timestamptz NOT NULL DEFAULT now(),
  confirmar_apos timestamptz NOT NULL DEFAULT now(),
  tentado_em timestamptz,
  UNIQUE(veiculo_id, conteudo_hash)
);
CREATE INDEX IF NOT EXISTS idx_foto_storage_pendente ON foto_storage_operacao(estado, criado_em);
ALTER TABLE foto_storage_operacao ENABLE ROW LEVEL SECURITY;
COMMIT;
