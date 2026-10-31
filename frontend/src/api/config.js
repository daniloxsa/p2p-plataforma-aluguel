export const API_CONFIG = {
  baseURL: (import.meta.env.VITE_API_URL || "http://localhost:3000/api").replace(/\/+$/, ""),
  timeout: 10000,
  headers: { "Content-Type": "application/json" },
};

// Anúncios públicos e reservas continuam demonstrativos. O CRUD privado usa veiculos.js.
export function isMockMode() { return true; }

