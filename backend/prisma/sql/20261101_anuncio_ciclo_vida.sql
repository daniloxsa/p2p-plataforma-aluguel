-- B.2. Apply MANUALLY to local univia_db after reviewing the read-only inspection.
-- No existing row is changed/deleted. Duplicates abort the entire transaction.
BEGIN;
LOCK TABLE public.anuncio IN SHARE ROW EXCLUSIVE MODE;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.anuncio WHERE status IN ('RASCUNHO','ATIVO','PAUSADO') GROUP BY veiculo_id HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'Anuncios correntes duplicados: revisar manualmente antes da B.2';
  END IF;
END $$;
CREATE UNIQUE INDEX uq_anuncio_corrente_veiculo ON public.anuncio(veiculo_id)
  WHERE status IN ('RASCUNHO','ATIVO','PAUSADO');
DROP INDEX public.uq_anuncio_ativo_veiculo;

CREATE TABLE public.historico_anuncio (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  anuncio_id uuid NOT NULL REFERENCES public.anuncio(id) ON DELETE NO ACTION,
  usuario_id uuid NOT NULL REFERENCES public.usuario(id) ON DELETE NO ACTION,
  status_anterior varchar(30) NOT NULL,
  status_novo varchar(30) NOT NULL,
  operacao varchar(20) NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (operacao = 'PUBLICAR' AND status_anterior = 'RASCUNHO' AND status_novo = 'ATIVO') OR
    (operacao = 'PAUSAR' AND status_anterior = 'ATIVO' AND status_novo = 'PAUSADO') OR
    (operacao = 'REATIVAR' AND status_anterior = 'PAUSADO' AND status_novo = 'ATIVO') OR
    (operacao = 'ENCERRAR' AND status_anterior IN ('RASCUNHO','ATIVO','PAUSADO') AND status_novo = 'ENCERRADO')
  )
);
CREATE INDEX idx_historico_anuncio_data ON public.historico_anuncio(anuncio_id, criado_em DESC, id DESC);
ALTER TABLE public.historico_anuncio ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.historico_anuncio FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON public.historico_anuncio FROM anon; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON public.historico_anuncio FROM authenticated; END IF;
END $$;
CREATE FUNCTION public.proteger_historico_anuncio() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Historico de anuncio nao permite alteracao ou exclusao'; END;
$$;
CREATE TRIGGER trg_proteger_historico_anuncio BEFORE UPDATE OR DELETE OR TRUNCATE
  ON public.historico_anuncio FOR EACH STATEMENT EXECUTE FUNCTION public.proteger_historico_anuncio();

-- Future reservation writers must share the vehicle -> announcement lock order.
-- Protect acquisition of new obligations without blocking existing reservations
-- merely because their announcement was paused. No booking API is added in B.2.
CREATE FUNCTION public.proteger_reserva_anuncio_corrente() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE vehicle_uuid uuid; announcement_status varchar(30); acquiring boolean;
BEGIN
  SELECT veiculo_id INTO vehicle_uuid FROM public.anuncio WHERE id = NEW.anuncio_id;
  PERFORM id FROM public.veiculo WHERE id = vehicle_uuid FOR UPDATE;
  SELECT status INTO announcement_status FROM public.anuncio WHERE id = NEW.anuncio_id FOR UPDATE;
  acquiring := TG_OP = 'INSERT';
  IF TG_OP = 'UPDATE' THEN
    acquiring := NEW.anuncio_id IS DISTINCT FROM OLD.anuncio_id OR
      (OLD.status IN ('CONCLUIDA','CANCELADA','REJEITADA') AND NEW.status NOT IN ('CONCLUIDA','CANCELADA','REJEITADA'));
  END IF;
  IF acquiring AND NEW.status NOT IN ('CONCLUIDA','CANCELADA','REJEITADA') AND announcement_status IS DISTINCT FROM 'ATIVO' THEN
    RAISE EXCEPTION 'Anuncio nao aceita novas reservas' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_reserva_anuncio_corrente BEFORE INSERT OR UPDATE OF anuncio_id, status
  ON public.reserva FOR EACH ROW EXECUTE FUNCTION public.proteger_reserva_anuncio_corrente();
COMMIT;
