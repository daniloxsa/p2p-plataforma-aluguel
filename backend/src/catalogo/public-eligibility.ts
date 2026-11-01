import { Prisma } from '@prisma/client';
import { publicationDay } from '../anuncios/publication-rules.ts';

// Same latest-CRLV ordering, UTC validity and validated-photo minimum as B.2.
// Reading never changes status or performs private-document Storage operations.
export function publicEligibility(now = new Date()) {
  return Prisma.sql`a.status = 'ATIVO' AND v.status_cadastro = 'APROVADO' AND v.desativado_em IS NULL
    AND EXISTS (
      SELECT 1 FROM documento_veiculo d
      WHERE d.veiculo_id = v.id AND d.tipo = 'CRLV' AND d.status_validacao = 'APROVADO'
        AND d.validade_ate >= ${publicationDay(now)}::date
        AND NOT EXISTS (SELECT 1 FROM documento_veiculo newer
          WHERE newer.veiculo_id = v.id AND newer.tipo = 'CRLV'
            AND (newer.criado_em, newer.id) > (d.criado_em, d.id))
    ) AND EXISTS (SELECT 1 FROM foto_veiculo f WHERE f.veiculo_id = v.id
      AND f.conteudo_hash ~ '^[a-f0-9]{64}$'
      AND f.arquivo_url ~ ('^' || v.id::text || '/[0-9a-f-]{36}[.](jpg|png|webp)$'))`;
}
