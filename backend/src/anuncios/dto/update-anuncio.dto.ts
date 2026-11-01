import { ValidateIf } from 'class-validator';
import { AnuncioFieldsDto } from './create-anuncio.dto.ts';

export class UpdateAnuncioDto extends AnuncioFieldsDto {}
for (const field of ['titulo', 'preco_diaria']) {
  ValidateIf((_object, value) => value !== undefined)(UpdateAnuncioDto.prototype, field);
}
