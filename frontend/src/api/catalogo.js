import { apiClient } from './client';

const options = { cache: 'no-store', timeout: 45000 };
export const catalogoApi = {
  list: query => apiClient.get(`/catalogo/anuncios?${query}`, options),
  detail: id => apiClient.get(`/catalogo/anuncios/${encodeURIComponent(id)}`, options),
};
