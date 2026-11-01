import { Transform } from 'class-transformer';
import { IsBoolean, IsString, IsUUID, Length, ValidateBy, ValidateIf } from 'class-validator';

export const validMoney = (value: unknown, positive: boolean) => {
  if (typeof value !== 'string' && typeof value !== 'number') return false;
  const text = String(value);
  // NUMERIC(12,2): ten integer digits and at most two fractional digits.
  if (text !== text.trim() || !/^\d{1,10}(?:\.\d{1,2})?$/.test(text)) return false;
  return !positive || /[1-9]/.test(text);
};
const money = (positive = false) => ValidateBy({
  name: 'money', validator: { validate: value => validMoney(value, positive),
    defaultMessage: args => `${args?.property} deve ser um decimal ${positive ? 'positivo' : 'não negativo'} com até duas casas e no máximo 9999999999.99.` },
});
const trim = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value;

export class AnuncioFieldsDto {
  @Transform(trim) @IsString() @Length(1, 150)
  titulo!: string;

  @Transform(({ value }) => typeof value === 'string' ? value.trim() || null : value)
  @ValidateIf((_object, value) => value !== undefined && value !== null) @IsString()
  descricao?: string | null;

  @money(true)
  preco_diaria!: string | number;

  @ValidateIf((_object, value) => value !== undefined) @money()
  valor_caucao?: string | number;

  @ValidateIf((_object, value) => value !== undefined) @money()
  preco_seguro_dia?: string | number;

  @ValidateIf((_object, value) => value !== undefined) @IsBoolean()
  aceite_automatico?: boolean;
}

export class CreateAnuncioDto extends AnuncioFieldsDto {
  @IsUUID()
  veiculo_id!: string;
}
