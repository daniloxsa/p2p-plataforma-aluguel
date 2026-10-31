import { ArrayMaxSize, ArrayUnique, IsArray, IsUUID } from 'class-validator';
export class ReorderFotosDto {
  @IsArray() @ArrayMaxSize(10) @ArrayUnique() @IsUUID('all', { each: true })
  ids!: string[];
}
