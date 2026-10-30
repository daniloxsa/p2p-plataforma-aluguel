import { Transform } from 'class-transformer';
import { IsEmail, IsString, Length } from 'class-validator';
import { email } from './register.dto.ts';

export class LoginDto {
  @Transform(email) @IsEmail() @Length(3, 255)
  email!: string;

  @IsString() @Length(1, 128)
  senha!: string;
}
