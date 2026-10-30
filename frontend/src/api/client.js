/**
 * Cliente HTTP simples baseado em fetch.
 *
 * Centraliza: base URL, timeout, headers, tratamento de erros e
 * serialização JSON. Futuramente é o único ponto a ajustar para consumir
 * uma API REST real (adicionar auth token, interceptors, retry, etc.).
 */

import { API_CONFIG } from "./config";

class ApiClient {
  constructor(baseURL = "") {
    this.baseURL = baseURL;
  }

  async _request(path, options = {}) {
    const url = this.baseURL ? `${this.baseURL}${path}` : path;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), API_CONFIG.timeout);

    try {
      const res = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          ...API_CONFIG.headers,
          ...options.headers,
        },
      });

      if (!res.ok) {
        const errorText = await res.text().catch(() => "");
        throw new Error(`API error ${res.status}: ${errorText}`);
      }

      const contentType = res.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        return await res.json();
      }
      return await res.text();
    } finally {
      clearTimeout(timeoutId);
    }
  }

  get(path, options = {}) {
    return this._request(path, { ...options, method: "GET" });
  }

  post(path, body, options = {}) {
    return this._request(path, {
      ...options,
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  put(path, body, options = {}) {
    return this._request(path, {
      ...options,
      method: "PUT",
      body: JSON.stringify(body),
    });
  }

  patch(path, body, options = {}) {
    return this._request(path, {
      ...options,
      method: "PATCH",
      body: JSON.stringify(body),
    });
  }

  delete(path, options = {}) {
    return this._request(path, { ...options, method: "DELETE" });
  }
}

export const apiClient = new ApiClient(API_CONFIG.baseURL);
