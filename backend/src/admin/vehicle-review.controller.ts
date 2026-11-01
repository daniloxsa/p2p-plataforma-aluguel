import { Body, Controller, Get, Header, Inject, Param, ParseUUIDPipe, Patch, Query, UseGuards, ValidationPipe } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.ts';
import { AdminGuard } from '../auth/guards/admin.guard.ts';
import { CurrentUser } from '../auth/decorators/current-user.decorator.ts';
import { VehicleReviewService } from './vehicle-review.service.ts';
import { ApproveDocumentDto, DecisionDto, RejectDto, ReviewQueryDto, HistoryQueryDto } from './dto/review.dto.ts';
const validated = (expectedType: new () => object) => new ValidationPipe({ expectedType, transform: true, whitelist: true, forbidNonWhitelisted: true });
@Controller('admin') @UseGuards(JwtAuthGuard, AdminGuard)
export class VehicleReviewController {
  constructor(@Inject(VehicleReviewService) private readonly review: VehicleReviewService) {}
  @Get('resumo') @Header('Cache-Control', 'no-store') stats() { return this.review.stats(); }
  @Get('veiculos') @Header('Cache-Control', 'no-store') list(@Query(validated(ReviewQueryDto)) query: ReviewQueryDto) { return this.review.list(query); }
  @Get('veiculos/:id') @Header('Cache-Control', 'no-store') detail(@Param('id', new ParseUUIDPipe()) id: string) { return this.review.detail(id); }
  @Get('veiculos/:id/documentos') @Header('Cache-Control', 'no-store') documents(@Param('id', new ParseUUIDPipe()) id: string, @Query(validated(HistoryQueryDto)) query: HistoryQueryDto) { return this.review.documents(id, query); }
  @Get('veiculos/:id/historico') @Header('Cache-Control', 'no-store') history(@Param('id', new ParseUUIDPipe()) id: string, @Query(validated(HistoryQueryDto)) query: HistoryQueryDto) { return this.review.history(id, query); }
  @Get('documentos/:id/arquivo') @Header('Cache-Control', 'no-store') file(@Param('id', new ParseUUIDPipe()) id: string) { return this.review.documentFile(id); }
  @Patch('veiculos/:id/aprovar') approve(@CurrentUser() user: { id: string }, @Param('id', new ParseUUIDPipe()) id: string, @Body(validated(DecisionDto)) dto: DecisionDto) { return this.review.decideVehicle(user.id, id, 'APROVADO', dto); }
  @Patch('veiculos/:id/rejeitar') reject(@CurrentUser() user: { id: string }, @Param('id', new ParseUUIDPipe()) id: string, @Body(validated(RejectDto)) dto: RejectDto) { return this.review.decideVehicle(user.id, id, 'REJEITADO', dto); }
  @Patch('veiculos/:id/reabrir') reopen(@CurrentUser() user: { id: string }, @Param('id', new ParseUUIDPipe()) id: string, @Body(validated(DecisionDto)) dto: DecisionDto) { return this.review.decideVehicle(user.id, id, 'PENDENTE', dto); }
  @Patch('documentos/:id/aprovar') approveDocument(@CurrentUser() user: { id: string }, @Param('id', new ParseUUIDPipe()) id: string, @Body(validated(ApproveDocumentDto)) dto: ApproveDocumentDto) { return this.review.decideDocument(user.id, id, 'APROVADO', dto); }
  @Patch('documentos/:id/rejeitar') rejectDocument(@CurrentUser() user: { id: string }, @Param('id', new ParseUUIDPipe()) id: string, @Body(validated(RejectDto)) dto: RejectDto) { return this.review.decideDocument(user.id, id, 'REJEITADO', dto); }
}
