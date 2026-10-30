import { readFileSync, appendFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { parse } from 'dotenv';

const path = new URL('../.env', import.meta.url);
const current = parse(readFileSync(path));
if (!current.DATABASE_URL) throw new Error('Configure DATABASE_URL no backend/.env antes de continuar.');
const defaults = {
  JWT_ACCESS_SECRET: randomBytes(48).toString('base64url'),
  JWT_ACCESS_EXPIRES_IN: '15m',
  REFRESH_TOKEN_EXPIRES_DAYS: '7',
  CORS_ORIGINS: 'http://localhost:5173,https://p2p-plataforma-aluguel.vercel.app',
};
const missing = Object.entries(defaults).filter(([key]) => !current[key]);
if (missing.length) appendFileSync(path, '\n' + missing.map(([key, value]) => `${key}="${value}"`).join('\n') + '\n');
console.log(`Ambiente local configurado: ${missing.map(([key]) => key).join(', ') || 'nenhuma variavel ausente'}. Segredos nao exibidos.`);
