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
  async signPublicPhotos(paths: string[]) {
    if (!paths.length) return new Map<string, string>();
    paths.forEach(path => this.assertPath(path));
    try {
      if (!this.client) throw new Error('Unavailable');
      const privacy = await this.client.storage.getBucket(this.config.bucket);
      if (privacy.error || privacy.data?.public !== false) throw new Error('Private bucket required');
      const { data, error } = await this.bucket().createSignedUrls(paths, 60);
      if (error || !data) throw new Error('Signing failed');
      return new Map(data.filter(item => !item.error && item.path && paths.includes(item.path) && item.signedUrl)
        .map(item => [item.path!, item.signedUrl!]));
    } catch { throw new ServiceUnavailableException('Fotografias temporariamente indisponíveis.'); }
  }
  documentReference(vehicleId: string, documentId: string, reference: string) {
    const bucket = process.env.SUPABASE_VEHICLE_DOCUMENT_BUCKET;
    if (!bucket || !/^[a-zA-Z0-9_-]+$/.test(bucket)) throw new ServiceUnavailableException('Bucket privado de documentos não configurado.');
    let path = reference;
    if (/^https?:/i.test(path)) {
      let url: URL;
      try { url = new URL(path); } catch { throw new ServiceUnavailableException('Referência documental inválida.'); }
      const project = process.env.SUPABASE_URL;
      const prefix = `/storage/v1/object/${bucket}/`;
      const authenticated = `/storage/v1/object/authenticated/${bucket}/`;
      if (!project || url.username || url.password || url.origin !== new URL(project).origin || url.search || url.hash ||
        (!url.pathname.startsWith(prefix) && !url.pathname.startsWith(authenticated))) {
        throw new ServiceUnavailableException('Referência documental exige revisão segura.');
      }
      path = url.pathname.slice(url.pathname.startsWith(authenticated) ? authenticated.length : prefix.length);
    }
    if (!new RegExp(`^${vehicleId}/${documentId}\\.(pdf|jpg|png|webp)$`, 'i').test(path)) {
      throw new ServiceUnavailableException('Documento fora do caminho privado do veículo.');
    }
    return { bucket, path };
  }
  private async readableObject(bucket: string, path: string, types: string[]) {
    if (!this.client) throw new ServiceUnavailableException('Armazenamento privado indisponível.');
    try {
      const privacy = await this.client.storage.getBucket(bucket);
      if (privacy.error || !privacy.data || privacy.data.public !== false) throw new Error('Bucket not private');
      const result = await this.client.storage.from(bucket).info(path);
      const mime = result.data?.contentType ?? result.data?.metadata?.mimetype;
      const size = Number(result.data?.size ?? result.data?.metadata?.size);
      if (result.error || !result.data || !types.includes(String(mime)) || !Number.isFinite(size) || size <= 0) {
        throw new Error('Missing or incompatible object');
      }
    } catch { throw new ServiceUnavailableException('Arquivo privado ausente, incompatível ou indisponível.'); }
  }
  async verifyPhoto(path: string) {
    this.assertPath(path);
    await this.readableObject(this.config.bucket, path, ['image/jpeg','image/png','image/webp']);
  }
  async verifyDocument(vehicleId: string, documentId: string, reference: string) {
    const location = this.documentReference(vehicleId, documentId, reference);
    await this.readableObject(location.bucket, location.path, ['application/pdf','image/jpeg','image/png','image/webp']);
    return location;
  }
  async signDocument(vehicleId: string, documentId: string, reference: string) {
    const { bucket, path } = await this.verifyDocument(vehicleId, documentId, reference);
    try {
      const result = await this.client!.storage.from(bucket).createSignedUrl(path, this.config.ttl);
      if (result.error || !result.data?.signedUrl) throw new Error('Signing failed');
      return { url: result.data.signedUrl, expira_em: new Date(Date.now() + this.config.ttl * 1000).toISOString() };
    } catch { throw new ServiceUnavailableException('Não foi possível abrir o documento privado.'); }
  }
  async uploadDocument(vehicleId: string, documentId: string, reference: string, buffer: Buffer, contentType: string) {
    const { bucket, path } = this.documentReference(vehicleId, documentId, reference);
    try {
      if (!this.client) throw new Error('Unavailable');
      const privacy = await this.client.storage.getBucket(bucket);
      if (privacy.error || privacy.data?.public !== false) throw new Error('Private bucket required');
      const result = await this.client.storage.from(bucket).upload(path, buffer, { contentType, upsert: false, cacheControl: '0' });
      if (result.error) throw result.error;
    } catch { throw new ServiceUnavailableException('Não foi possível enviar o documento ao armazenamento privado.'); }
  }
  async removeDocument(vehicleId: string, documentId: string, reference: string) {
    const { bucket, path } = this.documentReference(vehicleId, documentId, reference);
    try {
      if (!this.client) throw new Error('Unavailable');
      const result = await this.client.storage.from(bucket).remove([path]);
      if (result.error) throw result.error;
    } catch { throw new ServiceUnavailableException('Limpeza documental pendente.'); }
  }
}
