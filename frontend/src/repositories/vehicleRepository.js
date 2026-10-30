/**
 * Repositório de Veículos.
 *
 * Camada de acesso a dados. Expõe uma interface estável para o service.
 * Implementação padrão: mock (usa src/data/mock.js).
 *
 * Para conectar a API real: substitua VehicleRepositoryMock por uma
 * classe que use src/api/client (fetch) chamando os endpoints do backend.
 * O serviço e o AppContext continuam inalterados.
 */

import { vehiclesSeed } from "../data/mock";
import { isMockMode } from "../api/config";

/** @typedef {Object} Veiculo
 * @property {string} id
 * @property {string} marca
 * @property {string} modelo
 * @property {number} ano
 * @property {string} categoria
 * @property {string} cidade
 * @property {number} precoDiaria
 * @property {number} score
 * @property {number} avaliacoes
 * @property {string} proprietario
 * @property {string} cambio
 * @property {string} combustivel
 * @property {number} lugares
 * @property {string} emoji
 * @property {"DISPONIVEL"|"RESERVADO"} status
 * @property {boolean} aceiteAuto
 * @property {number} caucao
 * @property {number} seguroDia
 * @property {string} desc
 * @property {number} fotos
 * @property {boolean} docsOk
 */

/**
 * Contrato do repositório de veículos.
 */
export class VehicleRepository {
  /** @returns {Promise<Veiculo[]>} */
  async list() {
    throw new Error("método não implementado");
  }

  /** @param {string} _id @returns {Promise<Veiculo | null>} */
  async getById(_id) {
    throw new Error("método não implementado");
  }
}

/**
 * Implementação mock do repositório de veículos.
 * Usada por padrão quando não há backend configurado.
 */
export class VehicleRepositoryMock extends VehicleRepository {
  constructor() {
    super();
    this._cache = [...vehiclesSeed];
  }

  async list() {
    // simula latência de rede para desenvolvimento realista
    await new Promise((r) => setTimeout(r, 200));
    return [...this._cache];
  }

  async getById(id) {
    await new Promise((r) => setTimeout(r, 150));
    return this._cache.find((v) => v.id === id) || null;
  }
}

/**
 * Instância do repositório. Seleciona mock ou real conforme configuração.
 */
export const vehicleRepository = isMockMode()
  ? new VehicleRepositoryMock()
  : null; // TODO: instanciar repositório real (ex: VehicleRepositoryApi)
