import { apiClient } from './client';

async function request(operation) {
  try { return await operation(); }
  catch (error) {
    const messages = {
      400: 'Confira o título e os valores. Use até duas casas decimais e diária maior que zero.',
      404: 'Anúncio ou veículo indisponível, ou sem acesso.',
      409: 'O anúncio ou veículo foi alterado. Os dados serão atualizados; confira o estado antes de tentar novamente.',
    };
    if (messages[error.status]) error.message = messages[error.status];
    throw error;
  }
}

export const anunciosApi = {
  mine: (page = 1, limit = 20, orderBy = 'criado_em', order = 'desc') => request(() =>
    apiClient.get(`/anuncios/meus?${new URLSearchParams({ page, limit, orderBy, order })}`, { auth: true })),
  own: id => request(() => apiClient.get(`/anuncios/meus/${encodeURIComponent(id)}`, { auth: true })),
  create: data => request(() => apiClient.post('/anuncios', data, { auth: true, expectedStatus: 201 })),
  update: (id, data) => request(() => apiClient.patch(`/anuncios/${encodeURIComponent(id)}`, data, { auth: true })),
  close: id => request(() => apiClient.patch(`/anuncios/${encodeURIComponent(id)}/encerrar`, {}, { auth: true })),
};
