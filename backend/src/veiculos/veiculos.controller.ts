import { Body, Controller, Delete, Get, Header, HttpCode, Inject, Optional, Param, ParseUUIDPipe, Patch, Post, Query, ServiceUnavailableException, UseGuards, ValidationPipe } from '@nestjs/common';
import { FotosService } from './fotos/fotos.service.ts';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.ts';
import { CurrentUser } from '../auth/decorators/current-user.decorator.ts';
import { VeiculosService } from './veiculos.service.ts';
import { CreateVeiculoDto } from './dto/create-veiculo.dto.ts';
import { UpdateVeiculoDto } from './dto/update-veiculo.dto.ts';
import { QueryVeiculosDto } from './dto/query-veiculos.dto.ts';

const validated = (expectedType: new () => object) => new ValidationPipe({ expectedType, transform: true, whitelist: true, forbidNonWhitelisted: true });
@Controller('veiculos')
export class VeiculosController {
  constructor(@Inject(VeiculosService) private readonly vehicles: VeiculosService,
    @Optional() @Inject(FotosService) private readonly photos?: FotosService) {}
  @Post() @UseGuards(JwtAuthGuard)
  create(@CurrentUser() user: { id: string }, @Body(validated(CreateVeiculoDto)) dto: CreateVeiculoDto) { return this.vehicles.create(user.id, dto); }
  @Get('meus') @UseGuards(JwtAuthGuard) @Header('Cache-Control', 'no-store')
  async mine(@CurrentUser() user: { id: string }, @Query(validated(QueryVeiculosDto)) query: QueryVeiculosDto) {
    const data = await this.vehicles.mine(user.id, query);
    let covers: Record<string, unknown> = {}, fotos_indisponiveis = false;
    try { if (this.photos) covers = await this.photos.covers(user.id, data.items.map(v => v.id)); }
    catch (error) {
      if (!(error instanceof ServiceUnavailableException)) throw error;
      fotos_indisponiveis = true;
    }
    return { ...data, fotos_indisponiveis, items: data.items.map(v => ({ ...v, foto_principal: covers[v.id] ?? null })) };
  }
  @Get('meus/:id') @UseGuards(JwtAuthGuard)
  own(@CurrentUser() user: { id: string }, @Param('id', new ParseUUIDPipe()) id: string) { return this.vehicles.own(user.id, id); }
  @Get(':id')
  publicById(@Param('id', new ParseUUIDPipe()) id: string) { return this.vehicles.publicById(id); }
  @Patch(':id') @UseGuards(JwtAuthGuard)
  update(@CurrentUser() user: { id: string }, @Param('id', new ParseUUIDPipe()) id: string, @Body(validated(UpdateVeiculoDto)) dto: UpdateVeiculoDto) { return this.vehicles.update(user.id, id, dto); }
  @Delete(':id') @UseGuards(JwtAuthGuard) @HttpCode(204)
  deactivate(@CurrentUser() user: { id: string }, @Param('id', new ParseUUIDPipe()) id: string) { return this.vehicles.deactivate(user.id, id); }
}
