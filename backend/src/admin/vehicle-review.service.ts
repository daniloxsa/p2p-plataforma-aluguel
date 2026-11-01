import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { isUUID, validateSync } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service.ts';
import { StorageService } from '../veiculos/fotos/storage.service.ts';
import { vehicleSelect } from '../veiculos/veiculos.service.ts';
import { ApproveDocumentDto, DecisionDto, RejectDto, ReviewQueryDto, HistoryQueryDto } from './dto/review.dto.ts';

const summarySelect = { ...vehicleSelect, usuario: { select: { id: true, nome: true } },
  _count: { select: { foto_veiculo: true, documento_veiculo: true } },
  documento_veiculo: { orderBy: [{ criado_em: 'desc' }, { id: 'desc' }], take: 1,
    select: { id: true, tipo: true, status_validacao: true, validade_ate: true } },
} satisfies Prisma.veiculoSelect;
const docSelect = { id: true, veiculo_id: true, tipo: true, ano_exercicio: true, status_validacao: true,
  motivo_rejeicao: true, validado_em: true, validade_ate: true, criado_em: true } satisfies Prisma.documento_veiculoSelect;
const editable = ['PENDENTE','EM_ANALISE','REJEITADO'];
export const documentExpired = (date: Date | null, now = new Date()) => !date || date.toISOString().slice(0,10) < now.toISOString().slice(0,10);

@Injectable()
export class VehicleReviewService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService, @Inject(StorageService) private readonly storage: StorageService) {}
  private validate<T extends object>(type: new () => T, value: T) {
    const dto = plainToInstance(type, value);
    if (validateSync(dto, { whitelist: true, forbidNonWhitelisted: true, forbidUnknownValues: true }).length) throw new BadRequestException('Dados de análise inválidos.');
    return dto;
  }
  private async vehicle(db: Prisma.TransactionClient, id: string) {
    const row = await db.veiculo.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Veículo não encontrado.');
    return row;
  }
  async stats() {
    return this.prisma.$transaction(async tx => {
      const groups = await tx.veiculo.groupBy({ by: ['status_cadastro'], _count: { _all: true } });
      const count = (status: string) => groups.find(row => row.status_cadastro === status)?._count._all || 0;
      return { total: groups.reduce((sum, row) => sum + row._count._all, 0), pendentes: count('PENDENTE'),
        em_analise: count('EM_ANALISE'), aprovados: count('APROVADO'), rejeitados: count('REJEITADO') };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }
  async list(input: ReviewQueryDto) {
    const { page, limit, status, busca, orderBy, order } = this.validate(ReviewQueryDto, input);
    const where: Prisma.veiculoWhereInput = { ...(status ? { status_cadastro: status } : {}),
      ...(busca ? { OR: [ ...(isUUID(busca) ? [{ id: busca }] : []),
        ...['marca','modelo','placa'].map(field => ({ [field]: { contains: busca, mode: 'insensitive' } })) ] } : {}) };
    return this.prisma.$transaction(async tx => ({
      items: await tx.veiculo.findMany({ where, select: summarySelect, orderBy: [{ [orderBy]: order }, { id: order }], skip: (page - 1) * limit, take: limit }),
      total: await tx.veiculo.count({ where }), page, limit,
    }), { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }
  async documents(id: string, input: HistoryQueryDto) {
    const { page, limit } = this.validate(HistoryQueryDto, input);
    return this.prisma.$transaction(async tx => {
      await this.vehicle(tx, id);
      const rows = await tx.documento_veiculo.findMany({ where: { veiculo_id: id }, select: docSelect,
        orderBy: [{ criado_em: 'desc' }, { id: 'desc' }], skip: (page - 1) * limit, take: limit });
      return { items: rows.map(row => ({ ...row, expirado: documentExpired(row.validade_ate) })),
        total: await tx.documento_veiculo.count({ where: { veiculo_id: id } }), page, limit };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }
  async history(id: string, input: HistoryQueryDto) {
    const { page, limit } = this.validate(HistoryQueryDto, input);
    return this.prisma.$transaction(async tx => {
      await this.vehicle(tx, id);
      return { items: await tx.historico_revisao_veiculo.findMany({ where: { veiculo_id: id },
        select: { id: true, documento_id: true, alvo: true, status_anterior: true, status_novo: true,
          justificativa: true, validade_ate: true, criado_em: true, administrador: { select: { id: true, nome: true } } },
        orderBy: [{ criado_em: 'desc' }, { id: 'desc' }], skip: (page - 1) * limit, take: limit }),
        total: await tx.historico_revisao_veiculo.count({ where: { veiculo_id: id } }), page, limit };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }
  async detail(id: string) {
    const vehicle = await this.prisma.veiculo.findUnique({ where: { id }, select: summarySelect });
    if (!vehicle) throw new NotFoundException('Veículo não encontrado.');
    const photos = await this.prisma.foto_veiculo.findMany({ where: { veiculo_id: id }, orderBy: [{ ordem: 'asc' }, { id: 'asc' }], take: 100 });
    const safe = photos.map(({ arquivo_url, conteudo_hash: _hash, ...row }) => ({ ...row, url: null as string | null, indisponivel: true }));
    try {
      const compatible = photos.filter(row => row.arquivo_url.startsWith(`${id}/`));
      const urls = await this.storage.sign(compatible.map(row => row.arquivo_url));
      for (const row of safe) {
        const source = compatible.find(p => p.id === row.id);
        if (source && urls.get(source.arquivo_url)) { row.url = urls.get(source.arquivo_url)!; row.indisponivel = false; }
      }
    } catch (error) { if (!(error instanceof ServiceUnavailableException)) throw error; }
    return { ...vehicle, fotos: safe, fotos_expira_em: new Date(Date.now() + this.storage.config.ttl * 1000).toISOString() };
  }
  async documentFile(id: string) {
    const row = await this.prisma.documento_veiculo.findUnique({ where: { id }, select: { id: true, veiculo_id: true, arquivo_url: true } });
    if (!row) throw new NotFoundException('Documento não encontrado.');
    return this.storage.signDocument(row.veiculo_id, row.id, row.arquivo_url);
  }
  private async locked<T>(id: string, operation: (tx: Prisma.TransactionClient) => Promise<T>) {
    try {
      return await this.prisma.$transaction(async tx => {
        await tx.$queryRaw`SELECT id FROM public.veiculo WHERE id = ${id}::uuid FOR UPDATE`;
        const vehicle = await this.vehicle(tx, id);
        if (vehicle.desativado_em) throw new ConflictException('Veículo desativado não permite decisões.');
        return operation(tx);
      // The vehicle lock serializes related writers. Fresh statement snapshots
      // must include photo/document changes committed while waiting for that lock.
      }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 60000 });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && (['P2034','P2025'].includes(error.code) ||
        (error.code === 'P2010' && ['40001','40P01'].includes(String(error.meta?.code))))) {
        throw new ConflictException('Estado alterado simultaneamente. Atualize os dados.');
      }
      throw error;
    }
  }
  async decideVehicle(admin: string, id: string, target: 'APROVADO' | 'REJEITADO' | 'PENDENTE', input: DecisionDto | RejectDto) {
    const dto = this.validate(target === 'REJEITADO' ? RejectDto : DecisionDto, input);
    return this.locked(id, async tx => {
      const row = await this.vehicle(tx, id);
      if (row.status_cadastro !== dto.status_esperado || !editable.includes(row.status_cadastro) || row.status_cadastro === target ||
        (target === 'PENDENTE' && row.status_cadastro !== 'REJEITADO')) throw new ConflictException('Transição de cadastro inválida ou desatualizada.');
      if (target === 'APROVADO') {
        const latest = await tx.documento_veiculo.findFirst({ where: { veiculo_id: id, tipo: 'CRLV' }, orderBy: [{ criado_em: 'desc' }, { id: 'desc' }] });
        if (!latest || latest.status_validacao !== 'APROVADO' || documentExpired(latest.validade_ate)) throw new ConflictException('O CRLV mais recente precisa estar aprovado e dentro da validade.');
        await this.storage.verifyDocument(id, latest.id, latest.arquivo_url);
        const photos = await tx.foto_veiculo.findMany({ where: { veiculo_id: id }, take: 100 });
        let validPhoto = false;
        for (const photo of photos) {
          if (!photo.arquivo_url.startsWith(`${id}/`) || !/^[a-f0-9]{64}$/.test(photo.conteudo_hash || '')) continue;
          try { await this.storage.verifyPhoto(photo.arquivo_url); validPhoto = true; break; }
          catch (error) { if (!(error instanceof ServiceUnavailableException)) throw error; }
        }
        if (!validPhoto) throw new ConflictException('Exige ao menos uma foto validada e acessível no armazenamento privado.');
      }
      const updated = await tx.veiculo.updateMany({ where: { id, status_cadastro: dto.status_esperado, desativado_em: null }, data: { status_cadastro: target } });
      if (updated.count !== 1) throw new ConflictException('Cadastro alterado simultaneamente.');
      await tx.historico_revisao_veiculo.create({ data: { veiculo_id: id, administrador_id: admin, alvo: 'VEICULO',
        status_anterior: row.status_cadastro, status_novo: target, justificativa: 'justificativa' in dto ? String(dto.justificativa) : null } });
      return { id, status_cadastro: target };
    });
  }
  async decideDocument(admin: string, id: string, target: 'APROVADO' | 'REJEITADO', input: ApproveDocumentDto | RejectDto) {
    const dto = this.validate(target === 'APROVADO' ? ApproveDocumentDto : RejectDto, input);
    const source = await this.prisma.documento_veiculo.findUnique({ where: { id }, select: { veiculo_id: true } });
    if (!source) throw new NotFoundException('Documento não encontrado.');
    return this.locked(source.veiculo_id, async tx => {
      const vehicle = await this.vehicle(tx, source.veiculo_id);
      if (!editable.includes(vehicle.status_cadastro)) throw new ConflictException('Cadastro aprovado não permite alterar a documentação nesta fase.');
      const row = await tx.documento_veiculo.findUnique({ where: { id } });
      if (!row || row.veiculo_id !== source.veiculo_id) throw new NotFoundException('Documento não encontrado.');
      if (row.status_validacao !== dto.status_esperado || row.status_validacao === target || !['PENDENTE','EM_ANALISE','REJEITADO','EXPIRADO'].includes(row.status_validacao)) throw new ConflictException('Transição documental inválida ou desatualizada.');
      let validity: Date | null = null;
      if (target === 'APROVADO') {
        validity = new Date((dto as ApproveDocumentDto).validade_ate);
        if (documentExpired(validity)) throw new BadRequestException('Informe a validade documental atual ou futura, conferida no CRLV.');
        if (row.tipo !== 'CRLV') throw new ConflictException('Tipo documental não suportado.');
        await this.storage.verifyDocument(row.veiculo_id, id, row.arquivo_url);
      }
      const justification = 'justificativa' in dto ? String(dto.justificativa) : null;
      const changed = await tx.documento_veiculo.updateMany({ where: { id, veiculo_id: row.veiculo_id, status_validacao: dto.status_esperado },
        data: { status_validacao: target, motivo_rejeicao: justification, validado_em: new Date(), validade_ate: validity } });
      if (changed.count !== 1) throw new ConflictException('Documento alterado simultaneamente.');
      await tx.historico_revisao_veiculo.create({ data: { veiculo_id: row.veiculo_id, documento_id: id, administrador_id: admin,
        alvo: 'DOCUMENTO', status_anterior: row.status_validacao, status_novo: target, justificativa: justification, validade_ate: validity } });
      return { id, veiculo_id: row.veiculo_id, status_validacao: target };
    });
  }
}
