import { Transform } from 'class-transformer';
import { ValidateIf, IsString, Length, Matches } from 'class-validator';

export const trim = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value;

export class UpdateProfileDto {
  @ValidateIf((_object, value) => value !== undefined)
  @Transform(trim)
  @IsString()
  @Length(2, 150)
  @Matches(/^[^<>;]*$/)
  nome?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @Transform(trim)
  @IsString()
  @Length(8, 20)
  @Matches(/^[+\d()\s-]+$/)
  telefone?: string;
}

export type UpdateProfileResponse = {
  id: string;
  nome: string;
  email: string;
  telefone?: string;
  status: string;
  criado_em: Date;
};
