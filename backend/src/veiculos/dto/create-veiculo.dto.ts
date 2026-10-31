import { Transform } from 'class-transformer';
import { IsInt, IsString, Length, Matches, Max, Min } from 'class-validator';

export const normalizePlate = (value: unknown) => typeof value === 'string' ? value.trim().toUpperCase().replace(/[-\s]/g, '') : value;
const trim = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value;

export class CreateVeiculoDto {
  @Transform(({ value }) => normalizePlate(value))
  @Matches(/^[A-Z]{3}(?:\d{4}|\d[A-Z]\d{2})$/)
  placa!: string;

  @Transform(trim) @IsString() @Length(1, 80)
  marca!: string;
  @Transform(trim) @IsString() @Length(1, 100)
  modelo!: string;
  @IsInt() @Min(1900) @Max(new Date().getFullYear() + 1)
  ano_fabricacao!: number;
  @IsInt() @Min(1900) @Max(new Date().getFullYear() + 1)
  ano_modelo!: number;
  @Transform(trim) @IsString() @Length(1, 50)
  categoria!: string;
  @Transform(trim) @IsString() @Length(1, 30)
  cambio!: string;
  @Transform(trim) @IsString() @Length(1, 30)
  combustivel!: string;
  @IsInt() @Min(1) @Max(60)
  quantidade_lugares!: number;
}

