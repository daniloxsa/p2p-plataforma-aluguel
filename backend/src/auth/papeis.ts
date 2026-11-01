import type { PublicUser } from '../usuarios/usuarios.service.ts';

export const PAPEL = { USUARIO: 'USUARIO', ADMIN: 'ADMIN' } as const;
export type Papel = typeof PAPEL[keyof typeof PAPEL];
// Internal context only. This value is read from PostgreSQL for every request.
export type AuthenticatedUser = PublicUser & { papel: string };
