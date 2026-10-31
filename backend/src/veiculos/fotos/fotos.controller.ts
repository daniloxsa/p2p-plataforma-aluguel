import { Body, Controller, Delete, Get, Header, HttpCode, Inject, Param, ParseUUIDPipe, Patch, Post, UploadedFiles, UseGuards, UseInterceptors, ValidationPipe } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.ts';
import { CurrentUser } from '../../auth/decorators/current-user.decorator.ts';
import { FotosService } from './fotos.service.ts';
import { ReorderFotosDto } from './dto/reorder-fotos.dto.ts';
import type {} from 'multer';
import { UploadBudgetInterceptor } from './upload-budget.interceptor.ts';

@Controller('veiculos/:id/fotos') @UseGuards(JwtAuthGuard)
export class FotosController {
  constructor(@Inject(FotosService) private readonly photos: FotosService) {}
  @Get() @Header('Cache-Control', 'no-store')
  list(@CurrentUser() user: { id: string }, @Param('id', new ParseUUIDPipe()) id: string) { return this.photos.list(user.id, id); }
  @Post() @Header('Cache-Control', 'no-store')
  @UseInterceptors(UploadBudgetInterceptor, FilesInterceptor('fotos', 10, { limits: { fileSize: 5 * 1024 * 1024, files: 10, fields: 0, parts: 10 } }))
  upload(@CurrentUser() user: { id: string }, @Param('id', new ParseUUIDPipe()) id: string, @UploadedFiles() files: Express.Multer.File[]) { return this.photos.upload(user.id, id, files); }
  @Patch('ordem') @Header('Cache-Control', 'no-store')
  reorder(@CurrentUser() user: { id: string }, @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ValidationPipe({ expectedType: ReorderFotosDto, whitelist: true, forbidNonWhitelisted: true, transform: true })) dto: ReorderFotosDto) { return this.photos.reorder(user.id, id, dto.ids); }
  @Patch(':fotoId/principal') @Header('Cache-Control', 'no-store')
  principal(@CurrentUser() user: { id: string }, @Param('id', new ParseUUIDPipe()) id: string, @Param('fotoId', new ParseUUIDPipe()) photo: string) { return this.photos.principal(user.id, id, photo); }
  @Delete(':fotoId') @HttpCode(204)
  remove(@CurrentUser() user: { id: string }, @Param('id', new ParseUUIDPipe()) id: string, @Param('fotoId', new ParseUUIDPipe()) photo: string) { return this.photos.remove(user.id, id, photo); }
}
