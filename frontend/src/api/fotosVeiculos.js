import { apiClient } from './client';
const path = id => `/veiculos/${encodeURIComponent(id)}/fotos`;
async function request(operation) {
  try { return await operation(); }
  catch (error) {
    const messages = {
      400: 'Seleção inválida. Use imagens íntegras de até 20 megapixels e confira a ordem das fotos.',
      404: 'Veículo ou foto não encontrado, ou sem acesso.',
      409: 'Foto repetida, limite atingido, envio em andamento ou veículo desativado. Atualize a galeria.',
      413: 'Cada foto deve ter no máximo 5 MB.',
      415: 'Use apenas imagens JPEG, PNG ou WebP com tipo válido.',
      503: 'Não foi possível acessar o armazenamento. Atualize a galeria antes de tentar enviar novamente.',
    };
    if (messages[error.status]) error.message = messages[error.status];
    throw error;
  }
}
export const fotosVeiculosApi = {
  list: id => request(() => apiClient.get(path(id), { auth: true })),
  upload: (id, files) => {
    const body = new FormData();
    files.forEach(file => body.append('fotos', file));
    return request(() => apiClient.multipart(path(id), body, { auth: true, expectedStatus: 201 }));
  },
  principal: (id, fotoId) => request(() => apiClient.patch(`${path(id)}/${encodeURIComponent(fotoId)}/principal`, {}, { auth: true })),
  reorder: (id, ids) => request(() => apiClient.patch(`${path(id)}/ordem`, { ids }, { auth: true })),
  remove: (id, fotoId) => request(() => apiClient.delete(`${path(id)}/${encodeURIComponent(fotoId)}`, { auth: true, expectedStatus: 204 })),
};
