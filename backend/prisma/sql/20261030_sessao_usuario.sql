-- Additive migration for the existing introspected database. Run once via prisma db execute.
BEGIN;
CREATE TABLE public.sessao_usuario (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id UUID NOT NULL,
    token_hash VARCHAR(64) NOT NULL UNIQUE,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    expira_em TIMESTAMPTZ NOT NULL,
    revogado_em TIMESTAMPTZ,
    CONSTRAINT fk_sessao_usuario FOREIGN KEY (usuario_id) REFERENCES public.usuario(id) ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT ck_sessao_expira CHECK (expira_em > criado_em)
);
CREATE INDEX idx_sessao_usuario ON public.sessao_usuario(usuario_id);
CREATE INDEX idx_sessao_expira ON public.sessao_usuario(expira_em);
COMMIT;
