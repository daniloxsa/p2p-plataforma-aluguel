-- B.1: apply manually before starting the updated API. Run once, fail on schema drift.
BEGIN;
ALTER TABLE public.documento_veiculo ADD COLUMN validade_ate date;
CREATE TABLE public.historico_revisao_veiculo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  veiculo_id uuid NOT NULL REFERENCES public.veiculo(id) ON DELETE NO ACTION,
  documento_id uuid REFERENCES public.documento_veiculo(id) ON DELETE NO ACTION,
  administrador_id uuid NOT NULL REFERENCES public.usuario(id) ON DELETE NO ACTION,
  alvo varchar(10) NOT NULL CHECK (alvo IN ('VEICULO','DOCUMENTO')),
  status_anterior varchar(30) NOT NULL,
  status_novo varchar(30) NOT NULL,
  justificativa varchar(1000),
  validade_ate date,
  criado_em timestamptz NOT NULL DEFAULT now(),
  CHECK ((alvo = 'DOCUMENTO' AND documento_id IS NOT NULL) OR (alvo = 'VEICULO' AND documento_id IS NULL)),
  CHECK (status_anterior <> status_novo),
  CHECK (status_novo <> 'REJEITADO' OR (justificativa IS NOT NULL AND length(btrim(justificativa)) BETWEEN 10 AND 1000))
);
CREATE INDEX idx_revisao_veiculo_data ON public.historico_revisao_veiculo(veiculo_id, criado_em DESC, id DESC);
CREATE INDEX idx_revisao_documento ON public.historico_revisao_veiculo(documento_id);
ALTER TABLE public.historico_revisao_veiculo ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.historico_revisao_veiculo FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON public.historico_revisao_veiculo FROM anon; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON public.historico_revisao_veiculo FROM authenticated; END IF;
END $$;
CREATE FUNCTION public.proteger_historico_revisao() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Histórico administrativo não permite alteração ou exclusão'; END;
$$;
CREATE TRIGGER trg_proteger_historico_revisao BEFORE UPDATE OR DELETE OR TRUNCATE
  ON public.historico_revisao_veiculo FOR EACH STATEMENT EXECUTE FUNCTION public.proteger_historico_revisao();
COMMIT;
