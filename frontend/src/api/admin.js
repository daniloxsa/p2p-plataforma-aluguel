import { apiClient } from './client';
const listeners = new Set();
export const onAdminDenied = listener => { listeners.add(listener); return () => listeners.delete(listener); };
async function request(operation) {
  try { return await operation(); } catch (error) {
    if (error.status === 403) listeners.forEach(listener => listener());
    const messages = { 400: 'Confira o motivo (10 a 1000 caracteres), a validade e os campos informados.', 403: 'Acesso administrativo negado.',
      404: 'Veículo ou documento não encontrado.', 409: 'Estado alterado ou requisitos não atendidos. Atualize a análise e confira CRLV, validade e fotos.',
      503: 'Arquivo privado indisponível ou armazenamento não configurado. A aprovação permanece bloqueada.' };
    if (messages[error.status]) error.message = messages[error.status]; throw error;
  }
}
export const adminApi = {
  me: () => request(() => apiClient.get('/admin/me', { auth: true })),
  stats: () => request(() => apiClient.get('/admin/resumo', { auth: true })),
  list: query => request(() => apiClient.get(`/admin/veiculos?${new URLSearchParams(Object.entries(query).filter(([,v]) => v !== ''))}`, { auth: true })),
  detail: id => request(() => apiClient.get(`/admin/veiculos/${encodeURIComponent(id)}`, { auth: true, timeout: 25000 })),
  documents: (id,page=1) => request(() => apiClient.get(`/admin/veiculos/${encodeURIComponent(id)}/documentos?page=${page}&limit=20`, { auth: true })),
  history: (id,page=1) => request(() => apiClient.get(`/admin/veiculos/${encodeURIComponent(id)}/historico?page=${page}&limit=20`, { auth: true })),
  file: id => request(() => apiClient.get(`/admin/documentos/${encodeURIComponent(id)}/arquivo`, { auth: true, timeout: 65000 })),
  decide: (kind,id,action,body) => request(() => apiClient.patch(`/admin/${kind}/${encodeURIComponent(id)}/${action}`, body, { auth: true, timeout: 65000 })),
};
