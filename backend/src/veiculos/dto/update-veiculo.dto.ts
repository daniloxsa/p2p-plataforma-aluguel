import { ValidateIf } from 'class-validator';
import { CreateVeiculoDto } from './create-veiculo.dto.ts';

// Inherit validators while skipping only absent properties; null remains invalid.
export class UpdateVeiculoDto extends CreateVeiculoDto {}
for (const field of ['placa', 'marca', 'modelo', 'ano_fabricacao', 'ano_modelo', 'categoria', 'cambio', 'combustivel', 'quantidade_lugares']) {
  ValidateIf((_object, value) => value !== undefined)(UpdateVeiculoDto.prototype, field);
}
