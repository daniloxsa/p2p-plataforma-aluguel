/**
 * Serviço de Regras de Negócio — Veículos.
 *
 * Orquestra o repositório de veículos. Independente de mock ou API real.
 */

import { vehicleRepository } from "../repositories";

/** @typedef {import("../repositories/vehicleRepository").Veiculo} Veiculo */

/**
 * Contrato do serviço de veículos.
 */
export class VehicleService {
  constructor(repository = vehicleRepository) {
    this.repository = repository;
  }

  /** @returns {Promise<Veiculo[]>} */
  async listar() {
    return this.repository.list();
  }

  /** @param {string} id @returns {Promise<Veiculo | null>} */
  async obterPorId(id) {
    return this.repository.getById(id);
  }
}

export const vehicleService = new VehicleService();
