/**
 * Configuração da camada de API.
 *
 * Para conectar a um backend real no futuro, basta definir a variável de
 * ambiente VITE_API_URL (arquivo .env) e ajustar os endpoints em
 * src/repositories. A implementação mock continua funcionando enquanto
 * VITE_API_URL não estiver definida.
 */

export const API_CONFIG = {
  // URL base da API backend. Vazia = usa mocks locais.
  baseURL: import.meta.env.VITE_API_URL || "",
  timeout: 10000,
  headers: {
    "Content-Type": "application/json",
  },
};

/**
 * Retorna true se deve usar a camada mock (sem backend configurado).
 */
export function isMockMode() {
  return !API_CONFIG.baseURL;
}
