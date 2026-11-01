// Shared by publication and public reading; validity is inclusive on the UTC date.
export const publicationDay = (now = new Date()) => now.toISOString().slice(0, 10);
export const validatedPhoto = (vehicleId: string, photo: { arquivo_url: string; conteudo_hash: string | null }) =>
  photo.arquivo_url.startsWith(`${vehicleId}/`) && /^[a-f0-9]{64}$/.test(photo.conteudo_hash || '');
