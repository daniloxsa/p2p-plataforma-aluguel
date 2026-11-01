import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { isUUID, validateSync } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service.ts';
import { CreateAnuncioDto } from './dto/create-anuncio.dto.ts';
import { UpdateAnuncioDto } from './dto/update-anuncio.dto.ts';
import { QueryAnunciosDto } from './dto/query-anuncios.dto.ts';

const anuncioSelect = {
  id: true, veiculo_id: true, titulo: true, descricao: true, preco_diaria: true,
  valor_caucao: true, preco_seguro_dia: true, aceite_automatico: true, status: true, criado_em: true,
  veiculo: { select: { id: true, marca: true, modelo: true, ano_modelo: true, categoria: true } },
} satisfies Prisma.anuncioSelect;
type Row = Prisma.anuncioGetPayload<{ select: typeof anuncioSelect }>;

@Injectable()
export class AnunciosService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

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
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
      throw new ConflictException('Anúncio ou veículo alterado simultaneamente. Tente novamente.');
    }
    throw error;
  }
  async create(owner: string, input: CreateAnuncioDto) {
    const dto = this.validated(CreateAnuncioDto, input);
    try {
      return await this.prisma.$transaction(async tx => {
        const vehicle = await tx.veiculo.findFirst({ where: { id: dto.veiculo_id, proprietario_id: owner },
          select: { id: true, desativado_em: true } });
        if (!vehicle) throw new NotFoundException('Veículo não encontrado.');
        if (vehicle.desativado_em) throw new ConflictException('Veículo desativado não pode ser anunciado.');
        const row = await tx.anuncio.create({ data: {
          veiculo_id: vehicle.id, titulo: dto.titulo, descricao: dto.descricao,
          preco_diaria: new Prisma.Decimal(dto.preco_diaria), valor_caucao: new Prisma.Decimal(dto.valor_caucao ?? 0),
          preco_seguro_dia: new Prisma.Decimal(dto.preco_seguro_dia ?? 0), aceite_automatico: dto.aceite_automatico ?? false,
          status: 'RASCUNHO',
        }, select: anuncioSelect });
        return this.present(row);
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
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
    return this.mutate(owner, id, data, false);
  }
  async close(owner: string, id: string) {
    return this.mutate(owner, id, { status: 'ENCERRADO' }, true);
  }
  private async mutate(owner: string, id: string, data: Prisma.anuncioUpdateManyMutationInput, closing: boolean) {
    this.id(id);
    try {
      return await this.prisma.$transaction(async tx => {
        const where = { id, veiculo: { proprietario_id: owner } };
        // PostgreSQL rechecks this predicate after waiting for a competing row update.
        // The row lock is held until commit, including the response read below.
        const changed = await tx.anuncio.updateMany({ where: { ...where, status: 'RASCUNHO' }, data });
        const row = await tx.anuncio.findFirst({ where, select: anuncioSelect });
        if (!row) throw new NotFoundException('Anúncio não encontrado.');
        if (!changed.count && !(closing && row.status === 'ENCERRADO')) {
          throw new ConflictException('Somente anúncios em RASCUNHO permitem esta operação.');
        }
        return this.present(row);
      });
    } catch (error) { return this.conflict(error); }
  }
}
