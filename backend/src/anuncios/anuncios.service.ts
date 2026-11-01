import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { isUUID, validateSync } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service.ts';
import { CreateAnuncioDto } from './dto/create-anuncio.dto.ts';
import { UpdateAnuncioDto } from './dto/update-anuncio.dto.ts';
import { QueryAnunciosDto } from './dto/query-anuncios.dto.ts';
import { PublicationPolicyService, lifecycleConflict } from './publication-policy.service.ts';
import { AnnouncementHistoryQueryDto } from './dto/history-query.dto.ts';

const anuncioSelect = {
  id: true, veiculo_id: true, titulo: true, descricao: true, preco_diaria: true,
  valor_caucao: true, preco_seguro_dia: true, aceite_automatico: true, status: true, criado_em: true,
  veiculo: { select: { id: true, marca: true, modelo: true, ano_modelo: true, categoria: true, status_cadastro: true, desativado_em: true } },
} satisfies Prisma.anuncioSelect;
type Row = Prisma.anuncioGetPayload<{ select: typeof anuncioSelect }>;

@Injectable()
export class AnunciosService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PublicationPolicyService) private readonly policy: PublicationPolicyService) {}

  private validated<T extends object>(type: new () => T, value: T): T {
    const dto = plainToInstance(type, value);
    const errors = validateSync(dto, { whitelist: true, forbidNonWhitelisted: true, forbidUnknownValues: true });
    if (errors.length) throw new BadRequestException('Campos do anúncio inválidos.');
    return dto;
  }
  private id(id: string) {
    if (!isUUID(id)) throw new BadRequestException('Identificador inválido.');
  }
  private present(row: Row) {
    return { ...row, preco_diaria: row.preco_diaria.toFixed(2), valor_caucao: row.valor_caucao.toFixed(2),
      preco_seguro_dia: row.preco_seguro_dia.toFixed(2) };
  }
  private fields(dto: UpdateAnuncioDto) {
    const data: Prisma.anuncioUpdateManyMutationInput = {};
    if (dto.titulo !== undefined) data.titulo = dto.titulo;
    if (dto.descricao !== undefined) data.descricao = dto.descricao;
    if (dto.aceite_automatico !== undefined) data.aceite_automatico = dto.aceite_automatico;
    for (const key of ['preco_diaria', 'valor_caucao', 'preco_seguro_dia'] as const) {
      if (dto[key] !== undefined) data[key] = new Prisma.Decimal(dto[key]);
    }
    return data;
  }
  private conflict(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2021')
      throw new ServiceUnavailableException({ code: 'CICLO_NAO_CONFIGURADO', message: 'Ciclo de vida indisponível. A configuração do banco precisa ser concluída pelo operador.' });
    if (error instanceof Prisma.PrismaClientKnownRequestError && (['P2034', 'P2002', 'P2028'].includes(error.code) ||
      (error.code === 'P2010' && ['40001', '40P01'].includes(String(error.meta?.code))))) {
      throw new ConflictException('Anúncio ou veículo alterado simultaneamente. Tente novamente.');
    }
    throw error;
  }
  async create(owner: string, input: CreateAnuncioDto) {
    const dto = this.validated(CreateAnuncioDto, input);
    try {
      return await this.prisma.$transaction(async tx => {
        await tx.$queryRaw`SELECT id FROM public.veiculo WHERE id = ${dto.veiculo_id}::uuid FOR UPDATE`;
        const vehicle = await tx.veiculo.findFirst({ where: { id: dto.veiculo_id, proprietario_id: owner },
          select: { id: true, desativado_em: true } });
        if (!vehicle) throw new NotFoundException('Veículo não encontrado.');
        if (vehicle.desativado_em) throw new ConflictException('Veículo desativado não pode ser anunciado.');
        if (await tx.anuncio.count({ where: { veiculo_id: vehicle.id, status: { in: ['RASCUNHO', 'ATIVO', 'PAUSADO'] } } }))
          lifecycleConflict('ANUNCIO_CORRENTE', 'Este veículo já possui um anúncio corrente.');
        const row = await tx.anuncio.create({ data: {
          veiculo_id: vehicle.id, titulo: dto.titulo, descricao: dto.descricao,
          preco_diaria: new Prisma.Decimal(dto.preco_diaria), valor_caucao: new Prisma.Decimal(dto.valor_caucao ?? 0),
          preco_seguro_dia: new Prisma.Decimal(dto.preco_seguro_dia ?? 0), aceite_automatico: dto.aceite_automatico ?? false,
          status: 'RASCUNHO',
        }, select: anuncioSelect });
        return this.present(row);
      }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
    } catch (error) { return this.conflict(error); }
  }
  async mine(owner: string, input: QueryAnunciosDto) {
    const { page, limit, orderBy, order } = this.validated(QueryAnunciosDto, input);
    const where = { veiculo: { proprietario_id: owner } };
    return this.prisma.$transaction(async tx => {
      const rows = await tx.anuncio.findMany({ where, select: anuncioSelect,
        orderBy: [{ [orderBy]: order }, { id: order }], skip: (page - 1) * limit, take: limit });
      const total = await tx.anuncio.count({ where });
      return { items: rows.map(row => this.present(row)), total, page, limit };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }
  async own(owner: string, id: string) {
    this.id(id);
    const row = await this.prisma.anuncio.findFirst({ where: { id, veiculo: { proprietario_id: owner } }, select: anuncioSelect });
    if (!row) throw new NotFoundException('Anúncio não encontrado.');
    return this.present(row);
  }
  async update(owner: string, id: string, input: UpdateAnuncioDto) {
    const data = this.fields(this.validated(UpdateAnuncioDto, input));
    if (!Object.keys(data).length) throw new BadRequestException('Informe ao menos um campo.');
    return this.mutate(owner, id, data);
  }
  async close(owner: string, id: string) {
    return this.transition(owner, id, 'encerrar');
  }
  private async mutate(owner: string, id: string, data: Prisma.anuncioUpdateManyMutationInput) {
    this.id(id);
    return this.locked(owner, id, async (tx, row) => {
      if (!['RASCUNHO','PAUSADO'].includes(row.status)) lifecycleConflict('TRANSICAO_INVALIDA', 'Somente rascunhos e anúncios pausados permitem edição.');
      const changed = await tx.anuncio.updateMany({ where: { id, status: row.status }, data });
      if (changed.count !== 1) lifecycleConflict('ESTADO_ALTERADO', 'Anúncio alterado simultaneamente.');
      return this.present((await tx.anuncio.findFirst({ where: { id }, select: anuncioSelect }))!);
    });
  }
  private async owned(db: Prisma.TransactionClient, owner: string, id: string) {
    const row = await db.anuncio.findFirst({ where: { id, veiculo: { proprietario_id: owner } }, select: anuncioSelect });
    if (!row) throw new NotFoundException('Anúncio não encontrado.');
    return row;
  }
  private async locked<T>(owner: string, id: string, operation: (tx: Prisma.TransactionClient, row: Row) => Promise<T>) {
    this.id(id);
    const source = await this.owned(this.prisma, owner, id);
    try {
      return await this.prisma.$transaction(async tx => {
        // Global order: vehicle, then announcement. All related writers lock the
        // vehicle first. READ COMMITTED sees fresh state AFTER a competing lock
        // is released, including photo writers that do not update the vehicle row.
        await tx.$queryRaw`SELECT id FROM public.veiculo WHERE id = ${source.veiculo_id}::uuid FOR UPDATE`;
        await tx.$queryRaw`SELECT id FROM public.anuncio WHERE id = ${id}::uuid FOR UPDATE`;
        const row = await this.owned(tx, owner, id);
        return operation(tx, row);
      }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 15000, maxWait: 5000 });
    } catch (error) { return this.conflict(error); }
  }
  async transition(owner: string, id: string, action: 'publicar' | 'pausar' | 'reativar' | 'encerrar') {
    this.id(id);
    const sources = { publicar: ['RASCUNHO'], pausar: ['ATIVO'], reativar: ['PAUSADO'], encerrar: ['RASCUNHO','ATIVO','PAUSADO'] };
    const target = { publicar: 'ATIVO', pausar: 'PAUSADO', reativar: 'ATIVO', encerrar: 'ENCERRADO' };
    const initial = await this.owned(this.prisma, owner, id);
    if (!sources[action]?.includes(initial.status)) lifecycleConflict('TRANSICAO_INVALIDA', 'Operação incompatível com o estado atual do anúncio.');
    let checked: Awaited<ReturnType<PublicationPolicyService['snapshot']>> | undefined;
    if (action === 'publicar' || action === 'reativar') {
      this.policy.validateAnnouncement(initial);
      checked = await this.prisma.$transaction(tx => this.policy.snapshot(tx, initial.veiculo_id), { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
      // No remote I/O under the mutation locks. Recheck all relevant DB state below.
      await this.policy.verifyStorage(checked);
    }
    return this.locked(owner, id, async (tx, row) => {
      if (row.status !== initial.status) lifecycleConflict('ESTADO_ALTERADO', 'Anúncio alterado simultaneamente. Atualize os dados.');
      if (checked) {
        this.policy.validateAnnouncement(row);
        const current = await this.policy.snapshot(tx, row.veiculo_id);
        if (current.signature !== checked.signature) lifecycleConflict('ESTADO_ALTERADO', 'Documentação ou fotos alteradas. Atualize os dados antes de publicar.');
        if (await tx.anuncio.count({ where: { veiculo_id: row.veiculo_id, id: { not: id }, status: { in: ['RASCUNHO','ATIVO','PAUSADO'] } } }))
          lifecycleConflict('ANUNCIO_CORRENTE', 'Este veículo já possui outro anúncio corrente.');
      }
      if (action === 'encerrar' && await tx.reserva.count({ where: { anuncio_id: id, status: { notIn: ['CONCLUIDA','CANCELADA','REJEITADA'] } } }))
        lifecycleConflict('RESERVAS_PENDENTES', 'Há reservas pendentes ou em andamento. Resolva essas obrigações antes de encerrar.');
      const changed = await tx.anuncio.updateMany({ where: { id, status: initial.status }, data: { status: target[action] } });
      if (changed.count !== 1) lifecycleConflict('ESTADO_ALTERADO', 'Anúncio alterado simultaneamente.');
      await tx.historico_anuncio.create({ data: { anuncio_id: id, usuario_id: owner, status_anterior: initial.status, status_novo: target[action], operacao: action.toUpperCase() } });
      return this.present((await tx.anuncio.findFirst({ where: { id }, select: anuncioSelect }))!);
    });
  }
  async history(owner: string, id: string, input: AnnouncementHistoryQueryDto) {
    this.id(id);
    const { page, limit } = this.validated(AnnouncementHistoryQueryDto, input);
    return this.prisma.$transaction(async tx => {
      await this.owned(tx, owner, id);
      return { items: await tx.historico_anuncio.findMany({ where: { anuncio_id: id },
        select: { id: true, status_anterior: true, status_novo: true, operacao: true, criado_em: true },
        orderBy: [{ criado_em: 'desc' }, { id: 'desc' }], skip: (page - 1) * limit, take: limit }),
        total: await tx.historico_anuncio.count({ where: { anuncio_id: id } }), page, limit };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead }).catch(error => this.conflict(error));
  }
}
