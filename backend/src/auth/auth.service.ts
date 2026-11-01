import { ConflictException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.ts';
import { UsuariosService, canLogin, publicUser, type PublicUser } from '../usuarios/usuarios.service.ts';
import { AuthConfig } from './auth.config.ts';
import { RegisterDto } from './dto/register.dto.ts';
import { LoginDto } from './dto/login.dto.ts';
import { PAPEL, type AuthenticatedUser } from './papeis.ts';

export const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');
const unauthorized = () => new UnauthorizedException('Credenciais ou sessao invalidas.');

@Injectable()
export class AuthService {
  private readonly dummyHash = argon2.hash(randomBytes(32), { type: argon2.argon2id });
  constructor(
    @Inject(UsuariosService) private readonly usuarios: UsuariosService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(JwtService) private readonly jwt: JwtService,
    @Inject(AuthConfig) private readonly config: AuthConfig,
  ) {}

  async register(dto: RegisterDto) {
    // Explicit allowlist: even an internal caller cannot mass-assign a privileged role.
    const { senha, nome, cpf, email, telefone } = dto;
    const senha_hash = await argon2.hash(senha, { type: argon2.argon2id, memoryCost: 65536, timeCost: 3, parallelism: 1 });
    try {
      return await this.usuarios.create({ nome, cpf, email, telefone, senha_hash, status: 'PENDENTE_VERIFICACAO', papel: PAPEL.USUARIO });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('E-mail ou CPF ja cadastrado.');
      }
      throw error;
    }
  }

  private sessionData(usuario_id: string) {
    const refreshToken = randomBytes(32).toString('base64url');
    return { refreshToken, data: { usuario_id, token_hash: tokenHash(refreshToken), expira_em: new Date(Date.now() + this.config.refreshMs) } };
  }

  private async response(user: PublicUser, sessionId: string, refreshToken: string) {
    const accessToken = await this.jwt.signAsync({ sub: user.id, type: 'access', sid: sessionId }, {
      secret: this.config.secret, algorithm: 'HS256', expiresIn: this.config.accessSeconds, issuer: 'univia', audience: 'univia-api',
    });
    return { accessToken, tokenType: 'Bearer', expiresIn: this.config.accessSeconds, user: publicUser(user), refreshToken };
  }

  async login(dto: LoginDto) {
    const user = await this.usuarios.byEmail(dto.email);
    let valid = false;
    try { valid = await argon2.verify(user?.senha_hash ?? await this.dummyHash, dto.senha); } catch { /* Invalid stored hash: fail closed. */ }
    if (!user || !valid || !canLogin(user)) throw unauthorized();
    const { refreshToken, data } = this.sessionData(user.id);
    const session = await this.prisma.sessao_usuario.create({ data });
    return this.response(user, session.id, refreshToken);
  }

  async refresh(token: string) {
    const hash = tokenHash(token);
    return this.prisma.$transaction(async tx => {
      const session = await tx.sessao_usuario.findUnique({ where: { token_hash: hash }, include: { usuario: true } });
      if (!session || session.revogado_em || session.expira_em <= new Date() || !canLogin(session.usuario)) throw unauthorized();
      // Conditional update makes a refresh token single-use, including concurrent requests.
      const claimed = await tx.sessao_usuario.updateMany({
        where: { id: session.id, revogado_em: null, expira_em: { gt: new Date() } }, data: { revogado_em: new Date() },
      });
      if (claimed.count !== 1) throw unauthorized();
      const { refreshToken, data } = this.sessionData(session.usuario_id);
      const replacement = await tx.sessao_usuario.create({ data });
      return this.response(session.usuario, replacement.id, refreshToken);
    });
  }

  async logout(token?: string) {
    if (token) await this.prisma.sessao_usuario.updateMany({ where: { token_hash: tokenHash(token), revogado_em: null }, data: { revogado_em: new Date() } });
  }

  async authenticate(token: string): Promise<AuthenticatedUser> {
    let claims: { sub?: string; type?: string; sid?: string };
    try {
      claims = await this.jwt.verifyAsync(token, { secret: this.config.secret, algorithms: ['HS256'], issuer: 'univia', audience: 'univia-api' });
    } catch { throw unauthorized(); }
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (claims.type !== 'access' || !claims.sub || !claims.sid || !uuid.test(claims.sub) || !uuid.test(claims.sid)) throw unauthorized();
    const session = await this.prisma.sessao_usuario.findFirst({ where: { id: claims.sid, usuario_id: claims.sub, revogado_em: null, expira_em: { gt: new Date() } } });
    const user = await this.usuarios.byId(claims.sub);
    if (!session || !user || !canLogin(user)) throw unauthorized();
    return { ...publicUser(user), papel: user.papel };
  }
}
