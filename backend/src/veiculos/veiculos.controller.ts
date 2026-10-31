import { Body, Controller, Delete, Get, HttpCode, Inject, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards, ValidationPipe } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.ts';
import { CurrentUser } from '../auth/decorators/current-user.decorator.ts';
import { VeiculosService } from './veiculos.service.ts';
import { CreateVeiculoDto } from './dto/create-veiculo.dto.ts';
import { UpdateVeiculoDto } from './dto/update-veiculo.dto.ts';
import { QueryVeiculosDto } from './dto/query-veiculos.dto.ts';

const validated = (expectedType: new () => object) => new ValidationPipe({ expectedType, transform: true, whitelist: true, forbidNonWhitelisted: true });
@Controller('veiculos')
export class VeiculosController {
  constructor(@Inject(VeiculosService) private readonly vehicles: VeiculosService) {}
  @Post() @UseGuards(JwtAuthGuard)
  create(@CurrentUser() user: { id: string }, @Body(validated(CreateVeiculoDto)) dto: CreateVeiculoDto) { return this.vehicles.create(user.id, dto); }
  @Get('meus') @UseGuards(JwtAuthGuard)
  mine(@CurrentUser() user: { id: string }, @Query(validated(QueryVeiculosDto)) query: QueryVeiculosDto) { return this.vehicles.mine(user.id, query); }
  @Get('meus/:id') @UseGuards(JwtAuthGuard)
  own(@CurrentUser() user: { id: string }, @Param('id', new ParseUUIDPipe()) id: string) { return this.vehicles.own(user.id, id); }
  @Get(':id')
  publicById(@Param('id', new ParseUUIDPipe()) id: string) { return this.vehicles.publicById(id); }
  @Patch(':id') @UseGuards(JwtAuthGuard)
  update(@CurrentUser() user: { id: string }, @Param('id', new ParseUUIDPipe()) id: string, @Body(validated(UpdateVeiculoDto)) dto: UpdateVeiculoDto) { return this.vehicles.update(user.id, id, dto); }
  @Delete(':id') @UseGuards(JwtAuthGuard) @HttpCode(204)
  deactivate(@CurrentUser() user: { id: string }, @Param('id', new ParseUUIDPipe()) id: string) { return this.vehicles.deactivate(user.id, id); }
}
