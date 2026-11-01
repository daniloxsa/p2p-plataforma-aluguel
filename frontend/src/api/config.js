export const API_CONFIG = {
  baseURL: (import.meta.env.VITE_API_URL || "http://localhost:3000/api").replace(/\/+$/, ""),
  timeout: 10000,
  headers: { "Content-Type": "application/json" },
};

// Serviços legados do painel são demonstrativos. Catálogo público usa catalogo.js.
export function isMockMode() { return true; }

