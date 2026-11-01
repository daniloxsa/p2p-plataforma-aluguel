import { ConflictException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service.ts';
import { StorageService } from '../fotos/storage.service.ts';
import { DocumentConfig } from './document.config.ts';
import { validateDocument } from './validate-document.ts';

const select = { id: true, tipo: true, status_validacao: true, criado_em: true, validade_ate: true, motivo_rejeicao: true } as const;
const order = [{ criado_em: 'desc' }, { id: 'desc' }] as const;
const expired = (row: { status_validacao: string; validade_ate: Date | null }) => row.status_validacao === 'EXPIRADO' ||
  (row.status_validacao === 'APROVADO' && !!row.validade_ate && row.validade_ate.toISOString().slice(0, 10) < new Date().toISOString().slice(0, 10));

@Injectable()
export class DocumentosService {
  private readonly logger = new Logger(DocumentosService.name);
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(StorageService) private readonly storage: StorageService,
    @Inject(DocumentConfig) private readonly config: DocumentConfig) {}

  private async owner(db: Prisma.TransactionClient, owner: string, id: string) {
    const row = await db.veiculo.findFirst({ where: { id, proprietario_id: owner } });
    if (!row) throw new NotFoundException('Veículo não encontrado.');
    return row;
  }
  private reason(vehicle: { desativado_em: Date | null; status_cadastro: string }, latest: { status_validacao: string; validade_ate: Date | null } | null) {
    if (vehicle.desativado_em) return 'Veículo desativado não permite envio de documentos.';
    if (!['PENDENTE', 'EM_ANALISE', 'REJEITADO'].includes(vehicle.status_cadastro)) return 'Renovação de veículo aprovado depende de um fluxo de revisão ainda não disponível.';
    if (latest && latest.status_validacao !== 'REJEITADO' && !expired(latest)) return 'Aguarde a análise do CRLV atual. Reenvio disponível após rejeição ou expiração.';
    return null;
  }
  async list(owner: string, id: string) {
    return this.prisma.$transaction(async tx => {
      const vehicle = await this.owner(tx, owner, id);
      const latest = await tx.documento_veiculo.findFirst({ where: { veiculo_id: id, tipo: 'CRLV' }, select, orderBy: [...order] });
      const bloqueio = this.reason(vehicle, latest);
      return { documento: latest ? { ...latest, status_validacao: expired(latest) ? 'EXPIRADO' : latest.status_validacao } : null,
        pode_enviar: !bloqueio, bloqueio, limite_bytes: this.config.maxBytes };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }
  async file(owner: string, id: string, documentId: string) {
    await this.owner(this.prisma, owner, id);
    const doc = await this.prisma.documento_veiculo.findFirst({ where: { id: documentId, veiculo_id: id } });
    if (!doc) throw new NotFoundException('Documento não encontrado.');
    return this.storage.signDocument(id, doc.id, doc.arquivo_url);
  }
  async upload(owner: string, id: string, file?: Express.Multer.File) {
    const initial = await this.list(owner, id);
    if (!initial.pode_enviar) throw new ConflictException(initial.bloqueio!);
    const validated = await validateDocument(file, this.config.maxBytes);
    const documentId = randomUUID(), path = `${id}/${documentId}.${validated.extension}`;
    let attempted = false;
    try {
      // Same vehicle row lock as B.1 decisions. Held through storage and insert so
      // another upload/administrative approval cannot race the latest-document check.
      await this.prisma.$transaction(async tx => {
        await tx.$queryRaw`SELECT id FROM public.veiculo WHERE id = ${id}::uuid FOR UPDATE`;
        const vehicle = await this.owner(tx, owner, id);
        const latest = await tx.documento_veiculo.findFirst({ where: { veiculo_id: id, tipo: 'CRLV' }, orderBy: [...order] });
        const reason = this.reason(vehicle, latest);
        if (reason) throw new ConflictException(reason);
        attempted = true;
        await this.storage.uploadDocument(id, documentId, path, validated.buffer, validated.mime);
        await tx.documento_veiculo.create({ data: { id: documentId, veiculo_id: id, tipo: 'CRLV', arquivo_url: path,
          status_validacao: 'PENDENTE', criado_em: new Date(Math.max(Date.now(), latest ? latest.criado_em.getTime() + 1 : 0)) } });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 60000, maxWait: 5000 });
    } catch (error) {
      if (attempted) {
        try {
          // A lost commit acknowledgement must never delete a committed document.
          const committed = await this.prisma.documento_veiculo.findUnique({ where: { id: documentId }, select: { id: true } });
          if (!committed) await this.storage.removeDocument(id, documentId, path);
        } catch { this.logger.error(`Reconciliação documental necessária. Operação ${documentId}.`); }
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2034', 'P2028', 'P2010'].includes(error.code))
        throw new ConflictException('Estado alterado ou envio concorrente. Atualize a documentação.');
      throw error;
    }
    return this.list(owner, id);
  }
}
