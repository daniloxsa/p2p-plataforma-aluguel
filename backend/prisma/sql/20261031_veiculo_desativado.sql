-- Additive migration. Preserves all records, constraints and relationships.
BEGIN;
ALTER TABLE public.veiculo ADD COLUMN IF NOT EXISTS desativado_em timestamptz;
COMMIT;
