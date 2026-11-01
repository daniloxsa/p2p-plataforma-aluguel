import { Transform } from 'class-transformer';
import { IsIn, IsISO8601, IsString, Length, ValidateIf, Matches } from 'class-validator';
import { QueryVeiculosDto } from '../../veiculos/dto/query-veiculos.dto.ts';

const trim = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value;
export class ReviewQueryDto extends QueryVeiculosDto {
  @ValidateIf((_o, v) => v !== undefined) @IsIn(['PENDENTE','EM_ANALISE','APROVADO','REJEITADO'])
  status?: string;
  @ValidateIf((_o, v) => v !== undefined) @Transform(trim) @IsString() @Length(0, 100)
  busca?: string;
  @IsIn(['criado_em','marca','status_cadastro']) orderBy = 'criado_em';
  @IsIn(['asc','desc']) order: 'asc' | 'desc' = 'desc';
}
export class HistoryQueryDto extends QueryVeiculosDto {}
export class DecisionDto {
  @IsString() @IsIn(['PENDENTE','EM_ANALISE','APROVADO','REJEITADO','EXPIRADO'])
  status_esperado!: string;
}
export class RejectDto extends DecisionDto {
  @Transform(trim) @IsString() @Length(10, 1000) @Matches(/^[^\x00-\x08\x0b\x0c\x0e-\x1f<>]*$/)
  justificativa!: string;
}
export class ApproveDocumentDto extends DecisionDto {
  @IsISO8601({ strict: true }) @Matches(/^\d{4}-\d{2}-\d{2}$/)
  validade_ate!: string;
}
