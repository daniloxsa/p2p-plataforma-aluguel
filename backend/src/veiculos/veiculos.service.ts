import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.ts';
import { CreateVeiculoDto } from './dto/create-veiculo.dto.ts';
import { UpdateVeiculoDto } from './dto/update-veiculo.dto.ts';
import { QueryVeiculosDto } from './dto/query-veiculos.dto.ts';

export const vehicleSelect = {
  id: true, placa: true, marca: true, modelo: true, ano_fabricacao: true, ano_modelo: true,
  categoria: true, cambio: true, combustivel: true, quantidade_lugares: true,
  status_cadastro: true, criado_em: true, desativado_em: true,
} satisfies Prisma.veiculoSelect;
const announcementSelect = { id: true, titulo: true, status: true, preco_diaria: true, valor_caucao: true } as const;

@Injectable()
export class VeiculosService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  private years(data: { ano_modelo: number; ano_fabricacao: number }) {
    if (data.ano_modelo < data.ano_fabricacao || data.ano_modelo > data.ano_fabricacao + 1) {
      throw new BadRequestException('Ano do modelo deve ser igual ao de fabricação ou ao ano seguinte.');
    }
  }
  private conflict(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') throw new ConflictException('Placa já cadastrada.');
      if (error.code === 'P2034') throw new ConflictException('Veículo alterado simultaneamente. Tente novamente.');
      if (error.code === 'P2025') throw new NotFoundException('Veículo não encontrado.');
    }
    throw error;
  }
  async create(owner: string, dto: CreateVeiculoDto) {
    this.years(dto);
    try {
      return await this.prisma.veiculo.create({ data: { ...dto, proprietario_id: owner }, select: vehicleSelect });
    } catch (error) { return this.conflict(error); }
  }
  async mine(owner: string, { page, limit }: QueryVeiculosDto) {
    const where = { proprietario_id: owner };
    return this.prisma.$transaction(async tx => {
      const rows = await tx.veiculo.findMany({ where, select: vehicleSelect,
        orderBy: [{ criado_em: 'desc' }, { id: 'desc' }], skip: (page - 1) * limit, take: limit });
      // The schema introspects a partial unique index as a singular relation.
      // Query announcements directly so multiple drafts/historical announcements remain safe.
      const items = await Promise.all(rows.map(async row => ({ ...row, anuncio: await tx.anuncio.findFirst({
        where: { veiculo_id: row.id }, select: announcementSelect, orderBy: [{ criado_em: 'desc' }, { id: 'desc' }],
      }) })));
      const total = await tx.veiculo.count({ where });
      return { items, total, page, limit };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }
  async own(owner: string, id: string) {
    const row = await this.prisma.veiculo.findFirst({ where: { id, proprietario_id: owner }, select: vehicleSelect });
    if (!row) throw new NotFoundException('Veículo não encontrado.');
    return { ...row, anuncio: await this.prisma.anuncio.findFirst({ where: { veiculo_id: id }, select: announcementSelect, orderBy: [{ criado_em: 'desc' }, { id: 'desc' }] }) };
  }
  async publicById(id: string) {
    const row = await this.prisma.veiculo.findFirst({
      where: { id, desativado_em: null, status_cadastro: 'APROVADO', anuncio: { is: { status: 'ATIVO' } } },
      select: { id: true, marca: true, modelo: true, ano_modelo: true, categoria: true, cambio: true,
        combustivel: true, quantidade_lugares: true },
    });
    if (!row) throw new NotFoundException('Veículo não encontrado.');
    return { ...row, anuncio: await this.prisma.anuncio.findFirst({ where: { veiculo_id: id, status: 'ATIVO' }, select: announcementSelect }) };
  }
  async update(owner: string, id: string, dto: UpdateVeiculoDto) {
    dto = Object.fromEntries(Object.entries(dto).filter(([, value]) => value !== undefined)) as UpdateVeiculoDto;
    if (!Object.keys(dto).length) throw new BadRequestException('Informe ao menos um campo.');
    try {
      return await this.prisma.$transaction(async tx => {
        const row = await tx.veiculo.findFirst({ where: { id, proprietario_id: owner } });
        if (!row) throw new NotFoundException('Veículo não encontrado.');
        if (row.desativado_em) throw new ConflictException('Veículo desativado não pode ser editado.');
        // Until a reverification workflow exists, identity changes are restricted to undocumented pending vehicles.
        const changed = Object.entries(dto).some(([key, value]) => value !== row[key as keyof typeof row]);
        if (changed && (row.status_cadastro !== 'PENDENTE' ||
          await tx.documento_veiculo.count({ where: { veiculo_id: id } }) ||
          await tx.anuncio.count({ where: { veiculo_id: id } }))) {
          throw new ConflictException('Veículo com validação, documentos ou anúncio exige revisão antes de editar.');
        }
        this.years({ ...row, ...dto });
        return tx.veiculo.update({ where: { id, proprietario_id: owner }, data: dto, select: vehicleSelect });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) { return this.conflict(error); }
  }
  async deactivate(owner: string, id: string) {
    try {
      await this.prisma.$transaction(async tx => {
        const row = await tx.veiculo.findFirst({ where: { id, proprietario_id: owner } });
        if (!row) throw new NotFoundException('Veículo não encontrado.');
        if (row.desativado_em) return;
        // All announcements are queried directly: Prisma's introspected optional relation represents a partial unique index.
        if (await tx.reserva.count({ where: { anuncio: { veiculo_id: id }, status: { notIn: ['CONCLUIDA', 'CANCELADA', 'REJEITADA'] } } })) {
          throw new ConflictException('Há reservas pendentes ou em operação para este veículo.');
        }
        if (await tx.anuncio.count({ where: { veiculo_id: id, status: 'ATIVO' } })) {
          throw new ConflictException('Despublique o anúncio antes de desativar o veículo.');
        }
        await tx.veiculo.update({ where: { id, proprietario_id: owner }, data: { desativado_em: new Date() } });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) { this.conflict(error); }
  }
}
