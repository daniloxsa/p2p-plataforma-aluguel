import { Prisma } from '@prisma/client';
import { isUUID } from 'class-validator';
import { PAPEL, type Papel } from '../auth/papeis.ts';
import { canLogin, loginStatuses } from '../usuarios/usuarios.service.ts';
import type { PrismaService } from '../prisma/prisma.service.ts';

export class AdminOperationError extends Error {}
export type RoleOperation = {
  usuarioId: string; novoPapel: Papel; operador: string; ambiente: 'LOCAL' | 'PRODUCAO';
};
const select = { id: true, papel: true, status: true } as const;

export function validateRoleOperation(input: RoleOperation) {
  if (!isUUID(input.usuarioId)) throw new AdminOperationError('Informe um UUID de usuário válido.');
  if (![PAPEL.ADMIN, PAPEL.USUARIO].includes(input.novoPapel)) throw new AdminOperationError('Papel inválido.');
  if (!['LOCAL', 'PRODUCAO'].includes(input.ambiente)) throw new AdminOperationError('Ambiente inválido.');
  if (typeof input.operador !== 'string' || !input.operador.trim() || input.operador.length > 150 || /\p{C}/u.test(input.operador)) {
    throw new AdminOperationError('Informe uma identificação de operador de 1 a 150 caracteres, sem controles.');
  }
}

function eligible<T extends { papel: string; status: string }>(row: T | null, target: Papel): T {
  if (!row) throw new AdminOperationError('Usuário não encontrado.');
  if (row.papel !== PAPEL.ADMIN && row.papel !== PAPEL.USUARIO) throw new AdminOperationError('Papel atual inválido; revisão necessária.');
  if (target === PAPEL.ADMIN && !canLogin(row)) throw new AdminOperationError('Conta não elegível: o status atual não permite login.');
  return row;
}

export async function planRoleOperation(prisma: PrismaService, input: RoleOperation) {
  validateRoleOperation(input);
  return eligible(await prisma.usuario.findUnique({ where: { id: input.usuarioId }, select }), input.novoPapel);
}

// Only the operational CLI calls this function. Never registered as an HTTP service.
export async function changeUserRole(prisma: PrismaService, input: RoleOperation, expectedRole: string) {
  validateRoleOperation(input);
  return prisma.$transaction(async tx => {
    // The confirmation happens BEFORE this short transaction. A table lock also
    // serializes direct concurrent user status writes during the last-admin check.
    await tx.$executeRaw`SET LOCAL lock_timeout = '5s'`;
    await tx.$executeRaw`LOCK TABLE public.usuario IN SHARE ROW EXCLUSIVE MODE`;
    const row = eligible(await tx.usuario.findUnique({ where: { id: input.usuarioId }, select }), input.novoPapel);
    if (row.papel !== expectedRole) throw new AdminOperationError('Papel alterado desde a confirmação. Execute novamente.');
    if (row.papel === input.novoPapel) return { id: row.id, papel: row.papel, changed: false };
    if (input.novoPapel === PAPEL.USUARIO && canLogin(row)) {
      const count = await tx.usuario.count({ where: { papel: PAPEL.ADMIN, status: { in: loginStatuses } } });
      if (count <= 1) throw new AdminOperationError('Não é permitido revogar o último administrador com login habilitado.');
    }
    const updated = await tx.usuario.update({ where: { id: row.id, papel: row.papel },
      data: { papel: input.novoPapel }, select: { id: true, papel: true } });
    // Failure here rolls the role update back. No privilege change without audit.
    await tx.auditoria_papel_usuario.create({ data: {
      usuario_id: row.id, papel_anterior: row.papel, papel_novo: input.novoPapel,
      operador: input.operador.trim(), ambiente: input.ambiente,
    } });
    return { ...updated, changed: true };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, maxWait: 5000, timeout: 10000 });
}
