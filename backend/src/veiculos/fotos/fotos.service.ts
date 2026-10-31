import { BadRequestException, ConflictException, Inject, Injectable, Logger, NotFoundException, ServiceUnavailableException, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service.ts';
import { PhotoConfig } from './photo.config.ts';
import { StorageService } from './storage.service.ts';
import { validateImage } from './validate-image.ts';

type Tx = Prisma.TransactionClient;
type Operation = { id: string; veiculo_id: string; caminho: string; estado: string };
const order = [{ ordem: 'asc' }, { id: 'asc' }] as const;

@Injectable()
export class FotosService implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  private readonly logger = new Logger(FotosService.name);
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(StorageService) private readonly storage: StorageService,
    @Inject(PhotoConfig) private readonly config: PhotoConfig) {}

  async onModuleInit() {
    // Detect unapplied migration at startup; never apply it automatically.
    await this.prisma.$queryRaw`SELECT id FROM foto_storage_operacao LIMIT 0`;
    this.timer = setInterval(() => { void this.reconcile(); }, 60000);
    this.timer.unref();
    void this.reconcile();
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }

  private async owner(db: Tx, owner: string, id: string, mutable = false) {
    const row = await db.veiculo.findFirst({ where: { id, proprietario_id: owner } });
    if (!row) throw new NotFoundException('Veículo não encontrado.');
    if (mutable && row.desativado_em) throw new ConflictException('Veículo desativado não permite alterações de fotos.');
    return row;
  }
  private async locked<T>(owner: string, id: string, fn: (tx: Tx) => Promise<T>) {
    return this.prisma.$transaction(async tx => {
      // Shared row lock protocol for upload reservations, finalization, reorder and main photo.
      await tx.$queryRaw`SELECT id FROM veiculo WHERE id = ${id}::uuid FOR UPDATE`;
      await this.owner(tx, owner, id, true);
      return fn(tx);
    });
  }
  private async photo(tx: Tx, id: string, fotoId: string) {
    const row = await tx.foto_veiculo.findFirst({ where: { id: fotoId, veiculo_id: id } });
    if (!row) throw new NotFoundException('Foto não encontrada.');
    return row;
  }
  async list(owner: string, id: string) {
    await this.owner(this.prisma, owner, id);
    const rows = await this.prisma.foto_veiculo.findMany({ where: { veiculo_id: id }, orderBy: [...order] });
    return this.present(rows);
  }
  private async present(rows: Awaited<ReturnType<PrismaService['foto_veiculo']['findMany']>>) {
    for (const row of rows) {
      this.storage.assertPath(row.arquivo_url);
      if (!row.arquivo_url.startsWith(`${row.veiculo_id}/`)) throw new ServiceUnavailableException('Referência de foto incompatível; requer revisão.');
    }
    const urls = await this.storage.sign(rows.map(row => row.arquivo_url));
    const expira_em = new Date(Date.now() + this.config.ttl * 1000).toISOString();
    return rows.map(({ arquivo_url, conteudo_hash: _hash, ...row }) => ({ ...row, url: urls.get(arquivo_url), expira_em }));
  }
  async covers(owner: string, ids: string[]) {
    if (!ids.length) return {};
    const owned = await this.prisma.veiculo.findMany({ where: { id: { in: ids }, proprietario_id: owner }, select: { id: true } });
    const rows = await this.prisma.foto_veiculo.findMany({ where: { veiculo_id: { in: owned.map(v => v.id) }, principal: true } });
    const photos = await this.present(rows);
    return Object.fromEntries(photos.map(photo => [photo.veiculo_id, photo]));
  }
  async upload(owner: string, id: string, files: Express.Multer.File[]) {
    await this.owner(this.prisma, owner, id, true);
    if (!files?.length || files.length > this.config.maxCount) throw new BadRequestException('Selecione de 1 a 10 fotos.');
    // Sequential decode bounds memory/CPU; validate every file before any upload.
    const images: Awaited<ReturnType<typeof validateImage>>[] = [];
    for (const file of files) images.push(await validateImage(file, this.config.maxBytes));
    if (new Set(images.map(image => image.hash)).size !== images.length) throw new ConflictException('Há fotos repetidas na seleção.');
    const operations = images.map(image => ({ id: randomUUID(), path: '', image }));
    operations.forEach(op => { op.path = `${id}/${op.id}.${op.image.extension}`; });
    await this.locked(owner, id, async tx => {
      const photos = await tx.foto_veiculo.findMany({ where: { veiculo_id: id } });
      const pending = await tx.$queryRaw<{ conteudo_hash: string }[]>`SELECT conteudo_hash FROM foto_storage_operacao WHERE veiculo_id = ${id}::uuid AND estado = 'UPLOAD'`;
      if (photos.length + pending.length + images.length > this.config.maxCount) throw new ConflictException('Limite de fotos atingido ou uploads em andamento.');
      const hashes = new Set([...photos.map(p => p.conteudo_hash), ...pending.map(p => p.conteudo_hash)]);
      if (images.some(image => hashes.has(image.hash))) throw new ConflictException('Foto já enviada ou envio em andamento.');
      for (const op of operations) await tx.$executeRaw`INSERT INTO foto_storage_operacao(id, veiculo_id, caminho, conteudo_hash, estado, confirmar_apos) VALUES (${op.id}::uuid, ${id}::uuid, ${op.path}, ${op.image.hash}, 'UPLOAD', now() + interval '1 hour')`;
    });
    try {
      for (const op of operations) await this.storage.upload(op.path, op.image.buffer, op.image.mime);
      await this.locked(owner, id, async tx => {
        const pending = await tx.$queryRaw<Operation[]>`SELECT * FROM foto_storage_operacao WHERE veiculo_id = ${id}::uuid AND estado = 'UPLOAD' AND id::text IN (${Prisma.join(operations.map(op => op.id))})`;
        if (pending.length !== operations.length) throw new ConflictException('Envio expirado. Tente novamente.');
        const photos = await tx.foto_veiculo.findMany({ where: { veiculo_id: id } });
        // Recheck before commit, including changes made while storage was transferring.
        if (photos.length + operations.length > this.config.maxCount) throw new ConflictException('Limite de fotos atingido.');
        const start = photos.reduce((n, p) => Math.max(n, p.ordem), 0);
        for (const [index, op] of operations.entries()) await tx.foto_veiculo.create({ data: {
          id: op.id, veiculo_id: id, arquivo_url: op.path, conteudo_hash: op.image.hash,
          ordem: start + index + 1, principal: !photos.some(p => p.principal) && index === 0,
        } });
        await tx.$executeRaw`DELETE FROM foto_storage_operacao WHERE id::text IN (${Prisma.join(operations.map(op => op.id))})`;
      });
    } catch (error) {
      // Intent exists BEFORE network I/O. A crash or failed compensation remains recoverable.
      try {
        await this.prisma.$executeRaw`UPDATE foto_storage_operacao SET estado = 'LIMPEZA', conteudo_hash = NULL WHERE id::text IN (${Prisma.join(operations.map(op => op.id))})`;
        const cleanup = await this.prisma.$queryRaw<Operation[]>`SELECT * FROM foto_storage_operacao WHERE estado = 'LIMPEZA' AND id::text IN (${Prisma.join(operations.map(op => op.id))})`;
        // If commit succeeded but its acknowledgement was lost, intents are absent:
        // never remove committed photo objects on an ambiguous commit result.
        for (const op of cleanup) await this.cleanup(op);
      } catch { this.logger.warn('Compensação pendente; reconciliação automática tentará novamente.'); }
      throw error;
    }
    // Signing failure does not undo a committed upload. Reloading reveals the committed photos.
    return this.list(owner, id);
  }
  async principal(owner: string, id: string, fotoId: string) {
    await this.locked(owner, id, async tx => {
      await this.photo(tx, id, fotoId);
      // Two statements avoid violating immediate partial uniqueness during a swap.
      await tx.foto_veiculo.updateMany({ where: { veiculo_id: id, principal: true }, data: { principal: false } });
      await tx.foto_veiculo.update({ where: { id: fotoId }, data: { principal: true } });
    });
    return this.list(owner, id);
  }
  async reorder(owner: string, id: string, ids: string[]) {
    await this.locked(owner, id, async tx => {
      const rows = await tx.foto_veiculo.findMany({ where: { veiculo_id: id } });
      if (ids.length !== rows.length || new Set(ids).size !== ids.length || ids.some(photo => !rows.some(row => row.id === photo))) {
        throw new BadRequestException('Informe todas as fotos do veículo, sem repetições.');
      }
      for (const [index, fotoId] of ids.entries()) await tx.foto_veiculo.update({ where: { id: fotoId }, data: { ordem: index + 1 } });
    });
    return this.list(owner, id);
  }
  async remove(owner: string, id: string, fotoId: string) {
    const op = await this.locked(owner, id, async tx => {
      const photo = await tx.foto_veiculo.findFirst({ where: { id: fotoId, veiculo_id: id } });
      if (!photo) return null; // Idempotent; ownership is still checked.
      this.storage.assertPath(photo.arquivo_url);
      if (!photo.arquivo_url.startsWith(`${id}/`)) throw new ConflictException('Referência de foto incompatível.');
      const operation = { id: randomUUID(), veiculo_id: id, caminho: photo.arquivo_url, estado: 'LIMPEZA' };
      await tx.$executeRaw`INSERT INTO foto_storage_operacao(id, veiculo_id, caminho, estado) VALUES (${operation.id}::uuid, ${id}::uuid, ${operation.caminho}, 'LIMPEZA')`;
      await tx.foto_veiculo.delete({ where: { id: fotoId } });
      const remaining = await tx.foto_veiculo.findMany({ where: { veiculo_id: id }, orderBy: [...order] });
      for (const [index, row] of remaining.entries()) await tx.foto_veiculo.update({ where: { id: row.id }, data: {
        ordem: index + 1, ...(photo.principal ? { principal: index === 0 } : {}),
      } });
      return operation;
    });
    if (op) await this.cleanup(op); // 204 acknowledges logical deletion; outbox guarantees retry.
  }
  private async cleanup(op: Operation) {
    try {
      this.storage.assertPath(op.caminho);
      if (!op.caminho.startsWith(`${op.veiculo_id}/`)) throw new Error('Invalid stored path');
      await this.prisma.$executeRaw`UPDATE foto_storage_operacao SET tentado_em = now() WHERE id = ${op.id}::uuid AND estado = 'LIMPEZA'`;
      await this.storage.remove(op.caminho);
      // Retain failed-upload tombstones for an hour: an ambiguous network timeout
      // may finish remotely after the first removal. Repeated cleanup covers that window.
      await this.prisma.$executeRaw`DELETE FROM foto_storage_operacao WHERE id = ${op.id}::uuid AND estado = 'LIMPEZA' AND confirmar_apos <= now()`;
    } catch { this.logger.warn(`Limpeza de foto pendente: operação ${op.id}.`); }
  }
  async reconcile() {
    if (this.running) return;
    this.running = true;
    try {
      // Upload HTTP calls time out in 20s; batch is capped at 10. One hour allows a generous crash lease.
      const expired = await this.prisma.$queryRaw<Operation[]>`SELECT * FROM foto_storage_operacao WHERE estado = 'UPLOAD' AND criado_em < now() - interval '1 hour' LIMIT 50`;
      for (const op of expired) await this.prisma.$transaction(async tx => {
        // Same lock as finalization: never reap an intent concurrently committed as a photo.
        await tx.$queryRaw`SELECT id FROM veiculo WHERE id = ${op.veiculo_id}::uuid FOR UPDATE`;
        await tx.$executeRaw`UPDATE foto_storage_operacao SET estado = 'LIMPEZA', conteudo_hash = NULL WHERE id = ${op.id}::uuid AND estado = 'UPLOAD' AND criado_em < now() - interval '1 hour'`;
      });
      const ops = await this.prisma.$queryRaw<Operation[]>`SELECT * FROM foto_storage_operacao WHERE estado = 'LIMPEZA' ORDER BY tentado_em NULLS FIRST, criado_em, id LIMIT 50`;
      for (const op of ops) await this.cleanup(op);
    } catch { this.logger.warn('Reconciliação de fotos indisponível; nova tentativa em um minuto.'); }
    finally { this.running = false; }
  }
}
