import { Transform } from 'class-transformer';
import { IsEmail, IsOptional, IsString, Length, Matches, registerDecorator } from 'class-validator';

export function validCpf(value: unknown): boolean {
  if (typeof value !== 'string' || !/^\d{11}$/.test(value) || /^(\d)\1{10}$/.test(value)) return false;
  for (const size of [9, 10]) {
    let sum = 0;
    for (let i = 0; i < size; i++) sum += Number(value[i]) * (size + 1 - i);
    const digit = (sum * 10) % 11 % 10;
    if (digit !== Number(value[size])) return false;
  }
  return true;
}

function IsCpf(): PropertyDecorator {
  return (target, propertyKey) => registerDecorator({
    name: 'isCpf', target: target.constructor, propertyName: String(propertyKey),
    options: { message: 'cpf deve ser um CPF valido.' }, validator: { validate: validCpf },
  });
}

export const trim = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value;
export const email = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim().toLowerCase() : value;

export class RegisterDto {
  @Transform(trim) @IsString() @Length(2, 150)
  nome!: string;

  @Transform(({ value }) => typeof value === 'string' && /^(\d{11}|\d{3}\.\d{3}\.\d{3}-\d{2})$/.test(value.trim()) ? value.replace(/\D/g, '') : value)
  @IsString() @IsCpf()
  cpf!: string;

  @Transform(email) @IsEmail() @Length(3, 255)
  email!: string;

  @IsOptional() @Transform(trim) @IsString() @Length(8, 20) @Matches(/^[+\d()\s-]+$/)
  telefone?: string;

  @IsString() @Length(12, 128) @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/s, {
    message: 'senha deve conter maiuscula, minuscula, numero e simbolo (12 a 128 caracteres).',
  })
  senha!: string;
}
