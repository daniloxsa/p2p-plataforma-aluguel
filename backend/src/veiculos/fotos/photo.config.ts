import { Injectable } from '@nestjs/common';

function integer(name: string, fallback: number, max: number) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < 1 || value > max) throw new Error(`${name} inválida (1 a ${max}).`);
  return value;
}
@Injectable()
export class PhotoConfig {
  readonly maxCount = integer('VEHICLE_PHOTO_MAX_COUNT', 10, 10);
  readonly maxBytes = integer('VEHICLE_PHOTO_MAX_SIZE_MB', 5, 5) * 1024 * 1024;
  readonly ttl = integer('VEHICLE_PHOTO_SIGNED_URL_TTL_SECONDS', 300, 900);
  readonly bucket = process.env.SUPABASE_VEHICLE_BUCKET || 'veiculos-fotos';
}
