import { IsIn } from 'class-validator';
import { QueryVeiculosDto } from '../../veiculos/dto/query-veiculos.dto.ts';

export class QueryAnunciosDto extends QueryVeiculosDto {
  @IsIn(['criado_em', 'preco_diaria', 'titulo'])
  orderBy: 'criado_em' | 'preco_diaria' | 'titulo' = 'criado_em';

  @IsIn(['asc', 'desc'])
  order: 'asc' | 'desc' = 'desc';
}
