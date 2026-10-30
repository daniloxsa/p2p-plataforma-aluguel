import { Body, Controller, Get, Inject, Patch, UseGuards, BadRequestException, ValidationPipe } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.ts';
import { CurrentUser } from '../auth/decorators/current-user.decorator.ts';
import { UsuariosService } from './usuarios.service.ts';
import { UpdateProfileDto, UpdateProfileResponse } from './dto/update-profile.dto.ts';
import { PublicUser } from './usuarios.service.ts';

@UseGuards(JwtAuthGuard)
@Controller('usuarios')
export class UsuariosController {
  constructor(@Inject(UsuariosService) private readonly usuarios: UsuariosService) {}

  @Get('me')
  me(@CurrentUser() user: PublicUser): UpdateProfileResponse {
    return {
      id: user.id,
      nome: user.nome,
      email: user.email,
      telefone: user.telefone || undefined,
      status: user.status,
      criado_em: user.criado_em,
    };
  }

  @Patch('me')
  async updateMe(
    @CurrentUser() user: PublicUser,
    @Body(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true, forbidUnknownValues: true, expectedType: UpdateProfileDto })) dto: UpdateProfileDto,
  ): Promise<UpdateProfileResponse> {
    // Verify payload is not empty
    if (dto.nome === undefined && dto.telefone === undefined) {
      throw new BadRequestException('Payload não pode estar vazio. Forneça pelo menos um campo para atualizar.');
    }

    const updateData: Partial<{ nome: string; telefone: string }> = {};

    if (dto.nome !== undefined) {
      updateData.nome = dto.nome;
    }

    if (dto.telefone !== undefined) {
      updateData.telefone = dto.telefone;
    }

    const updated = await this.usuarios.updateProfile(user.id, updateData);

    return {
      id: updated.id,
      nome: updated.nome,
      email: updated.email,
      telefone: updated.telefone || undefined,
      status: updated.status,
      criado_em: updated.criado_em,
    };
  }
}
