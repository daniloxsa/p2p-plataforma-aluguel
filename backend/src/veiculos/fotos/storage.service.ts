import { Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { PhotoConfig } from './photo.config.ts';

@Injectable()
export class StorageService {
  private readonly client?: SupabaseClient;
  constructor(@Inject(PhotoConfig) readonly config: PhotoConfig) {
    const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SECRET_KEY;
    if (!url || !key) {
      if (process.env.NODE_ENV === 'production') throw new Error('SUPABASE_URL e SUPABASE_SECRET_KEY obrigatórias.');
      return; // Local CRUD/auth remain usable; photo requests explicitly return 503.
    }
    if (new URL(url).protocol !== 'https:') throw new Error('SUPABASE_URL deve usar HTTPS.');
    this.client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: (url, options) => fetch(url, { ...options, signal: AbortSignal.timeout(20000) }) } });
  }
  private bucket() {
    if (!this.client) throw new ServiceUnavailableException('Armazenamento de fotos indisponível.');
    return this.client.storage.from(this.config.bucket);
  }
  assertPath(path: string) {
    if (!/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|png|webp)$/.test(path)) {
      throw new ServiceUnavailableException('Referência de foto incompatível; requer revisão.');
    }
  }
  async upload(path: string, buffer: Buffer, contentType: string) {
    this.assertPath(path);
    try {
      const { error } = await this.bucket().upload(path, buffer, { contentType, upsert: false, cacheControl: '0' });
      if (error) throw error;
    } catch { throw new ServiceUnavailableException('Não foi possível enviar a foto.'); }
  }
  async remove(path: string) {
    this.assertPath(path);
    try { const { error } = await this.bucket().remove([path]); if (error) throw error; }
    catch { throw new ServiceUnavailableException('Limpeza da foto pendente.'); }
  }
  async sign(paths: string[]) {
    if (!paths.length) return new Map<string, string>();
    paths.forEach(path => this.assertPath(path));
    try {
      const { data, error } = await this.bucket().createSignedUrls(paths, this.config.ttl);
      if (error || !data || data.some(item => item.error || !item.signedUrl)) throw error;
      return new Map(data.map(item => [item.path!, item.signedUrl]));
    } catch { throw new ServiceUnavailableException('Não foi possível carregar as fotos.'); }
  }
}
