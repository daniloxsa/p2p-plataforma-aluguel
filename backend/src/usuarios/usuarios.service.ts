import { Inject, Injectable } from '@nestjs/common';
import { Prisma, type usuario } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.ts';

export const publicUserSelect = { id: true, nome: true, email: true, telefone: true, status: true, criado_em: true } satisfies Prisma.usuarioSelect;
export type PublicUser = Pick<usuario, 'id' | 'nome' | 'email' | 'telefone' | 'status' | 'criado_em'>;
export function publicUser(user: PublicUser): PublicUser {
  return { id: user.id, nome: user.nome, email: user.email, telefone: user.telefone, status: user.status, criado_em: user.criado_em };
}
export function canLogin(user: PublicUser): boolean {
  return ['PENDENTE_VERIFICACAO', 'ATIVO', 'VERIFICADO'].includes(user.status);
}

@Injectable()
export class UsuariosService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}
  byEmail(email: string) { return this.prisma.usuario.findUnique({ where: { email } }); }
  byId(id: string) { return this.prisma.usuario.findUnique({ where: { id }, select: publicUserSelect }); }
  create(data: Prisma.usuarioCreateInput) { return this.prisma.usuario.create({ data, select: publicUserSelect }); }

  async updateProfile(id: string, data: Partial<{ nome: string; telefone: string }>) {
    return this.prisma.usuario.update({
      where: { id },
      data,
      select: publicUserSelect,
    });
  }
}
