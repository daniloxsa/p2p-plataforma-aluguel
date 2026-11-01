import { Controller, Get, Header, Inject, Param, ParseUUIDPipe, Post, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.ts';
import { AuthThrottlerGuard } from '../../auth/guards/auth-throttler.guard.ts';
import { CurrentUser } from '../../auth/decorators/current-user.decorator.ts';
import { UploadBudgetInterceptor } from '../fotos/upload-budget.interceptor.ts';
import { DocumentosService } from './documentos.service.ts';

@Controller('veiculos/:id/documentos') @UseGuards(JwtAuthGuard)
export class DocumentosController {
  constructor(@Inject(DocumentosService) private readonly documents: DocumentosService) {}
  @Get() @Header('Cache-Control', 'no-store')
  list(@CurrentUser() user: { id: string }, @Param('id', new ParseUUIDPipe()) id: string) { return this.documents.list(user.id, id); }
  @Get(':documentoId/arquivo') @Header('Cache-Control', 'no-store')
  file(@CurrentUser() user: { id: string }, @Param('id', new ParseUUIDPipe()) id: string,
    @Param('documentoId', new ParseUUIDPipe()) doc: string) { return this.documents.file(user.id, id, doc); }
  @Post('crlv') @Header('Cache-Control', 'no-store')
  @UseGuards(AuthThrottlerGuard) @Throttle({ default: { limit: 5, ttl: 60000 } })
  @UseInterceptors(UploadBudgetInterceptor, FileInterceptor('arquivo', { limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 0, parts: 1 } }))
  upload(@CurrentUser() user: { id: string }, @Param('id', new ParseUUIDPipe()) id: string,
    @UploadedFile() file?: Express.Multer.File) { return this.documents.upload(user.id, id, file); }
}
