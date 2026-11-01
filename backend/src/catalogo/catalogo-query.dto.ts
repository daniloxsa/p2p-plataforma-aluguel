import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Length, Matches, Max, Min } from 'class-validator';

const integer = ({ value }: { value: unknown }) => typeof value === 'string' && /^[1-9]\d{0,5}$/.test(value) ? Number(value) : value;
export class CatalogoQueryDto {
  @Transform(integer) @IsInt() @Min(1) @Max(10000)
  page = 1;
  @Transform(integer) @IsInt() @Min(1) @Max(24)
  limit = 12;
  @IsOptional() @IsString() @Length(1, 100) @Matches(/\S/)
  q?: string;
  @IsOptional() @IsString() @Length(1, 50) @Matches(/\S/)
  categoria?: string;
  @IsOptional() @IsString() @Length(1, 30) @Matches(/\S/)
  cambio?: string;
  @IsOptional() @IsString() @Length(1, 30) @Matches(/\S/)
  combustivel?: string;
  @IsOptional() @Matches(/^\d{1,10}(?:\.\d{1,2})?$/)
  preco_min?: string;
  @IsOptional() @Matches(/^\d{1,10}(?:\.\d{1,2})?$/)
  preco_max?: string;
  @IsIn(['recentes', 'menor_preco', 'maior_preco'])
  ordem: 'recentes' | 'menor_preco' | 'maior_preco' = 'recentes';
}
