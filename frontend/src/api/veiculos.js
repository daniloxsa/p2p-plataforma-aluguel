import { apiClient } from './client';
async function request(operation) {
  try { return await operation(); }
  catch (error) {
    const messages = {
      400: 'Confira a placa, os campos obrigatórios, os anos e a quantidade de lugares.',
      404: 'Veículo não encontrado ou sem acesso.',
      409: 'Conflito: placa já cadastrada ou veículo com validação, anúncio ou reservas que impedem esta alteração.',
    };
    if (messages[error.status]) error.message = messages[error.status];
    throw error;
  }
}
export const veiculosApi = {
  create: data => request(() => apiClient.post('/veiculos', data, { auth: true, expectedStatus: 201 })),
  mine: (page = 1, limit = 20) => request(() => apiClient.get(`/veiculos/meus?page=${page}&limit=${limit}`, { auth: true })),
  own: id => request(() => apiClient.get(`/veiculos/meus/${encodeURIComponent(id)}`, { auth: true })),
  publicById: id => request(() => apiClient.get(`/veiculos/${encodeURIComponent(id)}`)),
  update: (id, data) => request(() => apiClient.patch(`/veiculos/${encodeURIComponent(id)}`, data, { auth: true })),
  deactivate: id => request(() => apiClient.delete(`/veiculos/${encodeURIComponent(id)}`, { auth: true, expectedStatus: 204 })),
};
