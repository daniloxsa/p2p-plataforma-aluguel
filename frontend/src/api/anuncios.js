import { apiClient } from './client';

const errorMessages = {
  VEICULO_NAO_APROVADO: 'Seu veículo precisa ser aprovado antes da publicação.',
  VEICULO_DESATIVADO: 'Veículo desativado ou indisponível. Não é possível publicar ou reativar.',
  DADOS_VEICULO_INVALIDOS: 'Confira os dados obrigatórios do veículo.',
  DADOS_ANUNCIO_INVALIDOS: 'Preencha os dados obrigatórios do anúncio antes de publicar.',
  CRLV_INVALIDO: 'O CRLV mais recente precisa estar aprovado e dentro da validade.',
  FOTO_AUSENTE: 'Adicione uma fotografia validada ao veículo.',
  FOTO_INDISPONIVEL: 'Não foi possível confirmar a disponibilidade da fotografia.',
  DOCUMENTO_INDISPONIVEL: 'Não foi possível confirmar o CRLV no armazenamento privado.',
  ANUNCIO_CORRENTE: 'Este veículo já possui um anúncio corrente. Gerencie ou encerre esse anúncio antes de criar outro.',
  TRANSICAO_INVALIDA: 'Operação incompatível com o estado atual do anúncio. Atualize os dados.',
  ESTADO_ALTERADO: 'Anúncio, documentação ou fotos alterados. Atualize os dados antes de tentar novamente.',
  RESERVAS_PENDENTES: 'Há reservas pendentes ou em andamento. Resolva essas obrigações antes de encerrar.',
  CICLO_NAO_CONFIGURADO: 'O ciclo de vida está indisponível. A configuração do banco precisa ser concluída pelo operador.',
};

async function request(operation) {
  try { return await operation(); }
  catch (error) {
    const messages = {
      400: 'Confira o título e os valores. Use até duas casas decimais e diária maior que zero.',
      404: 'Anúncio ou veículo indisponível, ou sem acesso.',
      409: 'O anúncio ou veículo foi alterado. Os dados serão atualizados; confira o estado antes de tentar novamente.',
    };
    if (!error.code && messages[error.status]) error.message = messages[error.status];
    throw error;
  }
}

export const anunciosApi = {
  mine: (page = 1, limit = 20, orderBy = 'criado_em', order = 'desc') => request(() =>
    apiClient.get(`/anuncios/meus?${new URLSearchParams({ page, limit, orderBy, order })}`, { auth: true })),
  own: id => request(() => apiClient.get(`/anuncios/meus/${encodeURIComponent(id)}`, { auth: true })),
  create: data => request(() => apiClient.post('/anuncios', data, { auth: true, expectedStatus: 201, errorMessages })),
  update: (id, data) => request(() => apiClient.patch(`/anuncios/${encodeURIComponent(id)}`, data, { auth: true, errorMessages })),
  close: id => request(() => apiClient.patch(`/anuncios/${encodeURIComponent(id)}/encerrar`, {}, { auth: true, errorMessages })),
  publish: id => request(() => apiClient.patch(`/anuncios/${encodeURIComponent(id)}/publicar`, {}, { auth: true, errorMessages, timeout: 150000 })),
  pause: id => request(() => apiClient.patch(`/anuncios/${encodeURIComponent(id)}/pausar`, {}, { auth: true, errorMessages })),
  reactivate: id => request(() => apiClient.patch(`/anuncios/${encodeURIComponent(id)}/reativar`, {}, { auth: true, errorMessages, timeout: 150000 })),
  history: (id, page = 1) => request(() => apiClient.get(`/anuncios/meus/${encodeURIComponent(id)}/historico?${new URLSearchParams({ page, limit: 20 })}`, { auth: true })),
};
