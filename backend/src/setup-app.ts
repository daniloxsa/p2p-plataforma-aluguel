import { type INestApplication, ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { AuthConfig } from './auth/auth.config.ts';
import { validationOptions } from './auth/auth.controller.ts';

export function setupApp(app: INestApplication) {
  const config = app.get(AuthConfig);
  app.setGlobalPrefix('api');
  app.use(cookieParser());
  app.useGlobalPipes(new ValidationPipe(validationOptions));
  app.enableCors({ origin: config.origins, credentials: true, methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'], allowedHeaders: ['Content-Type', 'Authorization', 'X-UniVia-CSRF'] });
  app.use(['/api/auth', '/api/catalogo'], (_req: unknown, res: { setHeader(name: string, value: string): void }, next: () => void) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
}
