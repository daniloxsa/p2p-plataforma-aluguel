import { Controller, Get, Header, Inject, Param, Query, ValidationPipe } from '@nestjs/common';
import { CatalogoService } from './catalogo.service.ts';
import { CatalogoQueryDto } from './catalogo-query.dto.ts';

@Controller('catalogo/anuncios')
export class CatalogoController {
  constructor(@Inject(CatalogoService) private readonly catalogo: CatalogoService) {}
  @Get() @Header('Cache-Control', 'no-store')
  list(@Query(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true, forbidUnknownValues: true, expectedType: CatalogoQueryDto })) query: CatalogoQueryDto) {
    return this.catalogo.list(query);
  }
  @Get(':id') @Header('Cache-Control', 'no-store')
  detail(@Param('id') id: string) { return this.catalogo.detail(id); }
}
