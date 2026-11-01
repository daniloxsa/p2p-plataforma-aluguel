-- Fase B.0. Apply MANUALLY before starting the updated API; never during startup.
-- Run once. Any preexisting column/table/constraint with these names aborts the
-- entire transaction for operator review; no schema drift is silently ignored.
BEGIN;
ALTER TABLE public.usuario
  ADD COLUMN papel varchar(20) NOT NULL DEFAULT 'USUARIO',
  ADD CONSTRAINT chk_usuario_papel CHECK (papel IN ('USUARIO', 'ADMIN'));

CREATE TABLE public.auditoria_papel_usuario (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid NOT NULL,
  papel_anterior varchar(20) NOT NULL,
  papel_novo varchar(20) NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  operador varchar(150) NOT NULL,
  operador_banco text NOT NULL DEFAULT CURRENT_USER,
  ambiente varchar(10) NOT NULL,
  CONSTRAINT fk_auditoria_papel_usuario FOREIGN KEY (usuario_id)
    REFERENCES public.usuario(id) ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT chk_auditoria_papeis CHECK (
    papel_anterior IN ('USUARIO', 'ADMIN') AND papel_novo IN ('USUARIO', 'ADMIN') AND papel_anterior <> papel_novo),
  CONSTRAINT chk_auditoria_operador CHECK (length(btrim(operador)) BETWEEN 1 AND 150),
  CONSTRAINT chk_auditoria_ambiente CHECK (ambiente IN ('LOCAL', 'PRODUCAO'))
);
CREATE INDEX idx_auditoria_papel_usuario_data ON public.auditoria_papel_usuario(usuario_id, criado_em);

-- No browser/Supabase anonymous access. The operational DB role needs SELECT/INSERT
-- on this table (the table owner already has those privileges).
ALTER TABLE public.auditoria_papel_usuario ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.auditoria_papel_usuario FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE public.auditoria_papel_usuario FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE public.auditoria_papel_usuario FROM authenticated;
  END IF;
END $$;

-- Append-only history; also protects against accidental cleanup/TRUNCATE.
CREATE FUNCTION public.proteger_auditoria_papel_usuario() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Auditoria de papel não permite alteração ou exclusão';
END;
$$;
CREATE TRIGGER trg_proteger_auditoria_papel_usuario
  BEFORE UPDATE OR DELETE OR TRUNCATE ON public.auditoria_papel_usuario
  FOR EACH STATEMENT EXECUTE FUNCTION public.proteger_auditoria_papel_usuario();
COMMIT;
