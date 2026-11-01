import { Body, Controller, Get, Header, Inject, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards, ValidationPipe } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator.ts';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.ts';
import { AnunciosService } from './anuncios.service.ts';
import { CreateAnuncioDto } from './dto/create-anuncio.dto.ts';
import { UpdateAnuncioDto } from './dto/update-anuncio.dto.ts';
import { QueryAnunciosDto } from './dto/query-anuncios.dto.ts';

const validated = (expectedType: new () => object) => new ValidationPipe({ expectedType, transform: true, whitelist: true, forbidNonWhitelisted: true });
class EncerrarAnuncioDto {}

@Controller('anuncios')
@UseGuards(JwtAuthGuard)
export class AnunciosController {
  constructor(@Inject(AnunciosService) private readonly anuncios: AnunciosService) {}

  @Post()
  create(@CurrentUser() user: { id: string }, @Body(validated(CreateAnuncioDto)) dto: CreateAnuncioDto) {
    return this.anuncios.create(user.id, dto);
  }
  @Get('meus') @Header('Cache-Control', 'no-store')
  mine(@CurrentUser() user: { id: string }, @Query(validated(QueryAnunciosDto)) dto: QueryAnunciosDto) {
    return this.anuncios.mine(user.id, dto);
  }
  @Get('meus/:id') @Header('Cache-Control', 'no-store')
  own(@CurrentUser() user: { id: string }, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.anuncios.own(user.id, id);
  }
  @Patch(':id')
  update(@CurrentUser() user: { id: string }, @Param('id', new ParseUUIDPipe()) id: string,
    @Body(validated(UpdateAnuncioDto)) dto: UpdateAnuncioDto) {
    return this.anuncios.update(user.id, id, dto);
  }
  @Patch(':id/encerrar')
  close(@CurrentUser() user: { id: string }, @Param('id', new ParseUUIDPipe()) id: string,
    // Object metadata skips the global unknown-value check for a DTO with no fields.
    // The explicit local pipe still rejects every supplied property.
    @Body(validated(EncerrarAnuncioDto)) _dto: object) {
    return this.anuncios.close(user.id, id);
  }
}
