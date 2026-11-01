import { apiClient } from './client';
const path = id => `/veiculos/${encodeURIComponent(id)}/documentos`;
async function request(operation) {
  try { return await operation(); }
  catch (error) {
    const messages = {
      400: 'Documento inválido. Use PDF sem senha ou imagem JPEG, PNG ou WebP íntegra, com extensão compatível.',
      403: 'Você não tem permissão para acessar este documento.',
      404: 'Veículo ou documento não encontrado, ou sem acesso.',
      409: 'Envio bloqueado pelo estado atual ou por outra operação. Atualize a documentação.',
      413: 'Documento acima do limite de tamanho permitido.',
      429: 'Muitos envios. Aguarde um minuto antes de tentar novamente.',
      503: 'Armazenamento documental indisponível. Atualize a documentação antes de reenviar.',
    };
    if (messages[error.status]) error.message = messages[error.status];
    throw error;
  }
}
export const documentosVeiculosApi = {
  list: id => request(() => apiClient.get(path(id), { auth: true })),
  file: (id, doc) => request(() => apiClient.get(`${path(id)}/${encodeURIComponent(doc)}/arquivo`, { auth: true })),
  upload: (id, file) => {
    const body = new FormData(); body.append('arquivo', file);
    return request(() => apiClient.multipart(`${path(id)}/crlv`, body, { auth: true, expectedStatus: 201 }));
  },
};
