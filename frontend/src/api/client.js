import { API_CONFIG } from "./config";

const messages = {
  400: "Confira os campos informados e tente novamente.",
  401: "Credenciais inválidas ou sessão expirada. Entre novamente.",
  403: "Acesso não autorizado. Tente entrar novamente.",
  409: "E-mail ou CPF já cadastrado.",
  429: "Muitas tentativas. Aguarde um minuto e tente novamente.",
  500: "Ocorreu um erro interno. Tente novamente mais tarde.",
  503: "Serviço indisponível. Tente novamente mais tarde.",
};

export class ApiError extends Error {
  constructor(status, message = messages[status] || "Não foi possível concluir a solicitação.") {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export class ApiClient {
  constructor(baseURL = API_CONFIG.baseURL) {
    this.baseURL = baseURL;
    this.auth = null;
  }

  configureAuth(handlers) { this.auth = handlers; }

  async _request(path, options = {}) {
    const { auth = false, retryAuth = true, expectedStatus, timeout = API_CONFIG.timeout, ...fetchOptions } = options;
    const token = auth ? this.auth?.getToken() : null;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    const headers = { ...API_CONFIG.headers, ...fetchOptions.headers };
    if (fetchOptions.body instanceof FormData) delete headers['Content-Type'];
    let response;
    try {
      response = await fetch(`${this.baseURL}${path}`, {
        ...fetchOptions,
        credentials: "include",
        signal: controller.signal,
        headers: {
          ...headers,
          ...(fetchOptions.method === "POST" && path.startsWith("/auth/") ? { "X-UniVia-CSRF": "1" } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
    } catch {
      throw new ApiError(0, "Não foi possível conectar ao servidor. Confira sua conexão e tente novamente.");
    } finally {
      clearTimeout(timeoutId);
    }

    if (response.status === 401 && auth && retryAuth && this.auth) {
      // A resposta pode pertencer ao token antigo de uma renovação já concluída.
      if (!this.auth.getToken() || this.auth.getToken() === token) await this.auth.refresh();
      return this._request(path, { ...options, retryAuth: false });
    }
    if (!response.ok) {
      if (response.status === 401 && auth) this.auth?.invalidate();
      throw new ApiError(response.status);
    }
    if (expectedStatus && response.status !== expectedStatus) throw new ApiError(500);
    if (response.status === 204) return undefined;
    try {
      return (response.headers.get("content-type") || "").includes("application/json")
        ? await response.json() : await response.text();
    } catch { throw new ApiError(500); }
  }

  get(path, options = {}) { return this._request(path, { ...options, method: "GET" }); }
  post(path, body = {}, options = {}) { return this._request(path, { ...options, method: "POST", body: JSON.stringify(body) }); }
  multipart(path, body, options = {}) { return this._request(path, { ...options, method: 'POST', body, timeout: 240000 }); }
  put(path, body, options = {}) { return this._request(path, { ...options, method: "PUT", body: JSON.stringify(body) }); }
  patch(path, body, options = {}) { return this._request(path, { ...options, method: "PATCH", body: JSON.stringify(body) }); }
  delete(path, options = {}) { return this._request(path, { ...options, method: "DELETE" }); }
}

export const apiClient = new ApiClient();

