/**
 * Repositório de Reservas.
 *
 * Camada de acesso a dados. Implementação padrão: mock.
 * Para conectar a API real: substitua ReservaRepositoryMock por uma
 * classe que use src/api/client (fetch). O serviço e o AppContext
 * continuam inalterados.
 */

import { reservasSeed } from "../data/mock";
import { isMockMode } from "../api/config";

/** @typedef {Object} Reserva
 * @property {string} id
 * @property {string} veiculoId
 * @property {string} locatario
 * @property {string} inicio  // ISO date string
 * @property {string} fim     // ISO date string
 * @property {"SOLICITADA"|"APROVADA"|"CONCLUIDA"|"CANCELADA"|"RECUSADA"} status
 * @property {number} total
 * @property {number} caucao
 * @property {boolean} [avaliado]
 * @property {Array<{from: "me"|"them", text: string}>} [chat]
 */

/**
 * Contrato do repositório de reservas.
 */
export class ReservaRepository {
  /** @returns {Promise<Reserva[]>} */
  async list() {
    throw new Error("método não implementado");
  }

  /** @param {Object} _data @returns {Promise<Reserva>} */
  async create(_data) {
    throw new Error("método não implementado");
  }

  /** @param {string} _id @param {Object} _patch @returns {Promise<Reserva | null>} */
  async update(_id, _patch) {
    throw new Error("método não implementado");
  }
}

/**
 * Implementação mock do repositório de reservas.
 */
export class ReservaRepositoryMock extends ReservaRepository {
  constructor() {
    super();
    this._cache = [...reservasSeed];
  }

  async list() {
    await new Promise((r) => setTimeout(r, 200));
    return [...this._cache];
  }

  async create(data) {
    await new Promise((r) => setTimeout(r, 250));
    const reserva = {
      id: "R-" + Math.floor(1000 + Math.random() * 9000),
      status: "SOLICITADA",
      chat: [],
      avaliado: false,
      ...data,
    };
    this._cache.unshift(reserva);
    return reserva;
  }

  async update(id, patch) {
    await new Promise((r) => setTimeout(r, 150));
    const idx = this._cache.findIndex((r) => r.id === id);
    if (idx === -1) return null;
    this._cache[idx] = { ...this._cache[idx], ...patch };
    return this._cache[idx];
  }
}

/**
 * Instância do repositório. Seleciona mock ou real conforme configuração.
 */
export const reservaRepository = isMockMode()
  ? new ReservaRepositoryMock()
  : null; // TODO: instanciar repositório real (ex: ReservaRepositoryApi)
