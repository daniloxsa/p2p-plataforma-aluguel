import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { isUUID, validateSync } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service.ts';
import { StorageService } from '../veiculos/fotos/storage.service.ts';
import { CatalogoQueryDto } from './catalogo-query.dto.ts';
import { publicEligibility } from './public-eligibility.ts';
import { validatedPhoto } from '../anuncios/publication-rules.ts';

const photoSelect = { id: true, arquivo_url: true, conteudo_hash: true, descricao: true } as const;
const publicSelect = {
  id: true, titulo: true, descricao: true, preco_diaria: true, valor_caucao: true, preco_seguro_dia: true,
  criado_em: true,
  veiculo: { select: { id: true, marca: true, modelo: true, ano_fabricacao: true, ano_modelo: true,
    categoria: true, cambio: true, combustivel: true, quantidade_lugares: true,
    foto_veiculo: { select: photoSelect, orderBy: [{ principal: 'desc' }, { ordem: 'asc' }, { id: 'asc' }], take: 10 } } },
} satisfies Prisma.anuncioSelect;
type Row = Prisma.anuncioGetPayload<{ select: typeof publicSelect }>;
const orders = {
  recentes: Prisma.sql`a.criado_em DESC, a.id DESC`,
  menor_preco: Prisma.sql`a.preco_diaria ASC, a.id ASC`,
  maior_preco: Prisma.sql`a.preco_diaria DESC, a.id DESC`,
};
// Escape LIKE metacharacters so user text remains a literal substring.
const contains = (text: string) => `%${text.replace(/[\\%_]/g, '\\$&')}%`;

@Injectable()
export class CatalogoService {
  constructor(@Inject(PrismaService) private readonly db: PrismaService,
    @Inject(StorageService) private readonly storage: StorageService) {}

  private query(value: CatalogoQueryDto) {
    const dto = plainToInstance(CatalogoQueryDto, value);
    if (validateSync(dto, { whitelist: true, forbidNonWhitelisted: true, forbidUnknownValues: true }).length ||
      (dto.preco_min !== undefined && dto.preco_max !== undefined && new Prisma.Decimal(dto.preco_min).gt(dto.preco_max)))
      throw new BadRequestException('Filtros do catálogo inválidos.');
    return dto;
  }
  private filters(dto: CatalogoQueryDto) {
    const clauses = [publicEligibility()];
    if (dto.q) clauses.push(Prisma.sql`(a.titulo ILIKE ${contains(dto.q.trim())} OR v.marca ILIKE ${contains(dto.q.trim())} OR v.modelo ILIKE ${contains(dto.q.trim())})`);
    if (dto.categoria) clauses.push(Prisma.sql`lower(v.categoria) = lower(${dto.categoria.trim()})`);
    if (dto.cambio) clauses.push(Prisma.sql`lower(v.cambio) = lower(${dto.cambio.trim()})`);
    if (dto.combustivel) clauses.push(Prisma.sql`lower(v.combustivel) = lower(${dto.combustivel.trim()})`);
    if (dto.preco_min !== undefined) clauses.push(Prisma.sql`a.preco_diaria >= ${dto.preco_min}::numeric`);
    if (dto.preco_max !== undefined) clauses.push(Prisma.sql`a.preco_diaria <= ${dto.preco_max}::numeric`);
    return Prisma.join(clauses, ' AND ');
  }
  async list(value: CatalogoQueryDto) {
    const dto = this.query(value), where = this.filters(dto);
    const { rows, total } = await this.db.$transaction(async tx => {
      const count = await tx.$queryRaw<{ total: bigint }[]>(Prisma.sql`SELECT count(*) AS total FROM anuncio a JOIN veiculo v ON v.id = a.veiculo_id WHERE ${where}`);
      const ids = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`SELECT a.id FROM anuncio a JOIN veiculo v ON v.id = a.veiculo_id WHERE ${where} ORDER BY ${orders[dto.ordem]} LIMIT ${dto.limit} OFFSET ${(dto.page - 1) * dto.limit}`);
      const found = ids.length ? await tx.anuncio.findMany({ where: { id: { in: ids.map(row => row.id) } }, select: publicSelect }) : [];
      const byId = new Map(found.map(row => [row.id, row]));
      return { rows: ids.map(({ id }) => byId.get(id)!), total: Number(count[0].total) };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
    return { items: await this.present(rows, false), total, page: dto.page, limit: dto.limit, pages: Math.ceil(total / dto.limit) };
  }
  async detail(id: string) {
    if (!isUUID(id)) throw new NotFoundException('Anúncio indisponível.');
    const row = await this.db.$transaction(async tx => {
      const ids = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`SELECT a.id FROM anuncio a JOIN veiculo v ON v.id = a.veiculo_id WHERE a.id = ${id}::uuid AND ${publicEligibility()}`);
      return ids.length ? tx.anuncio.findUnique({ where: { id }, select: publicSelect }) : null;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
    if (!row) throw new NotFoundException('Anúncio indisponível.');
    return (await this.present([row], true))[0];
  }
  private async present(rows: Row[], detail: boolean) {
    const selected = rows.map(row => row.veiculo.foto_veiculo.filter(photo => {
      try { this.storage.assertPath(photo.arquivo_url); }
      catch { return false; }
      return validatedPhoto(row.veiculo.id, photo);
    }).slice(0, detail ? 10 : 1));
    // One batch for the whole page; independent missing objects don't discard good images.
    let urls = new Map<string, string>();
    try { urls = await this.storage.signPublicPhotos([...new Set(selected.flat().map(photo => photo.arquivo_url))]); }
    catch { /* Storage outage: preserve catalog data and use the image placeholder. */ }
    const expira_em = new Date(Date.now() + 60_000).toISOString();
    return rows.map((row, index) => {
      const v = row.veiculo;
      return { id: row.id, titulo: row.titulo, ...(detail ? { descricao: row.descricao } : {}),
        preco_diaria: row.preco_diaria.toFixed(2), valor_caucao: row.valor_caucao.toFixed(2),
        preco_seguro_dia: row.preco_seguro_dia.toFixed(2), criado_em: row.criado_em,
        veiculo: { marca: v.marca, modelo: v.modelo, ano_fabricacao: v.ano_fabricacao, ano_modelo: v.ano_modelo,
          categoria: v.categoria, cambio: v.cambio, combustivel: v.combustivel, quantidade_lugares: v.quantidade_lugares },
        fotos: selected[index].flatMap(photo => urls.has(photo.arquivo_url) ? [{ id: photo.id, descricao: photo.descricao, url: urls.get(photo.arquivo_url)!, expira_em }] : []),
      };
    });
  }
}
