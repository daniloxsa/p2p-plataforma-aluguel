import { ConflictException, Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { StorageService } from '../veiculos/fotos/storage.service.ts';
import { CreateVeiculoDto } from '../veiculos/dto/create-veiculo.dto.ts';
import { CreateAnuncioDto } from './dto/create-anuncio.dto.ts';
import { publicationDay, validatedPhoto } from './publication-rules.ts';

export function lifecycleConflict(code: string, message: string): never { throw new ConflictException({ code, message }); }

@Injectable()
export class PublicationPolicyService {
  constructor(@Inject(StorageService) private readonly storage: StorageService) {}
  async snapshot(db: Prisma.TransactionClient, vehicleId: string) {
    const vehicle = await db.veiculo.findUnique({ where: { id: vehicleId } });
    if (!vehicle || vehicle.desativado_em) lifecycleConflict('VEICULO_DESATIVADO', 'Veículo desativado ou indisponível.');
    if (vehicle.status_cadastro !== 'APROVADO') lifecycleConflict('VEICULO_NAO_APROVADO', 'Seu veículo precisa ser aprovado antes da publicação.');
    const fields = ['placa','marca','modelo','ano_fabricacao','ano_modelo','categoria','cambio','combustivel','quantidade_lugares'] as const;
    const dto = plainToInstance(CreateVeiculoDto, Object.fromEntries(fields.map(key => [key, vehicle[key]])));
    if (validateSync(dto).length || dto.ano_modelo < dto.ano_fabricacao || dto.ano_modelo > dto.ano_fabricacao + 1)
      lifecycleConflict('DADOS_VEICULO_INVALIDOS', 'Confira os dados obrigatórios do veículo.');
    const document = await db.documento_veiculo.findFirst({ where: { veiculo_id: vehicleId, tipo: 'CRLV' }, orderBy: [{ criado_em: 'desc' }, { id: 'desc' }] });
    if (!document || document.status_validacao !== 'APROVADO' || !document.validade_ate || publicationDay(document.validade_ate) < publicationDay())
      lifecycleConflict('CRLV_INVALIDO', 'O CRLV mais recente precisa estar aprovado e dentro da validade.');
    const photos = (await db.foto_veiculo.findMany({ where: { veiculo_id: vehicleId }, orderBy: { id: 'asc' }, take: 100 }))
      .filter(photo => validatedPhoto(vehicleId, photo));
    if (!photos.length) lifecycleConflict('FOTO_AUSENTE', 'Adicione uma fotografia validada ao veículo.');
    const signature = JSON.stringify({ document: { id: document.id, path: document.arquivo_url, status: document.status_validacao, validity: document.validade_ate },
      photos: photos.map(photo => ({ id: photo.id, path: photo.arquivo_url, hash: photo.conteudo_hash })) });
    return { vehicleId, document, photos, signature };
  }
  validateAnnouncement(row: { veiculo_id: string; titulo: string; descricao: string | null; preco_diaria: Prisma.Decimal; valor_caucao: Prisma.Decimal; preco_seguro_dia: Prisma.Decimal; aceite_automatico: boolean }) {
    const dto = plainToInstance(CreateAnuncioDto, { veiculo_id: row.veiculo_id, titulo: row.titulo, descricao: row.descricao,
      preco_diaria: row.preco_diaria.toString(), valor_caucao: row.valor_caucao.toString(), preco_seguro_dia: row.preco_seguro_dia.toString(), aceite_automatico: row.aceite_automatico });
    if (validateSync(dto).length) lifecycleConflict('DADOS_ANUNCIO_INVALIDOS', 'Preencha os dados obrigatórios do anúncio antes de publicar.');
  }
  async verifyStorage(snapshot: Awaited<ReturnType<PublicationPolicyService['snapshot']>>) {
    try { await this.storage.verifyDocument(snapshot.vehicleId, snapshot.document.id, snapshot.document.arquivo_url); }
    catch (error) {
      if (!(error instanceof ServiceUnavailableException)) throw error;
      throw new ServiceUnavailableException({ code: 'DOCUMENTO_INDISPONIVEL', message: 'Não foi possível confirmar o CRLV no armazenamento privado.' });
    }
    const deadline = Date.now() + 20000;
    for (const photo of snapshot.photos) {
      if (Date.now() >= deadline) break;
      try { await this.storage.verifyPhoto(photo.arquivo_url); return; }
      catch (error) { if (!(error instanceof ServiceUnavailableException)) throw error; }
    }
    throw new ServiceUnavailableException({ code: 'FOTO_INDISPONIVEL', message: 'Não foi possível confirmar a disponibilidade da fotografia.' });
  }
}
