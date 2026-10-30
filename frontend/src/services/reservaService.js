/**
 * Serviço de Regras de Negócio — Reservas.
 *
 * Orquestra o repositório e aplica regras (RN03/RF21 etc.).
 * Não depende diretamente de mocks nem de API: depende apenas do
 * repositório injetado. Facilita testes unitários e futura troca de backend.
 */

import { reservaRepository } from "../repositories";
import { overlap, diffDays } from "../data/mock";

/** @typedef {import("../repositories/reservaRepository").Reserva} Reserva */

/**
 * Contrato do serviço de reservas.
 */
export class ReservaService {
  constructor(repository = reservaRepository) {
    this.repository = repository;
  }

  /** @returns {Promise<Reserva[]>} */
  async listar() {
    return this.repository.list();
  }

  /**
   * Verifica se há conflito de datas para um veículo (RN03 / RF21).
   * @param {string} veiculoId
   * @param {string} inicio
   * @param {string} fim
   * @param {string|null} ignoreId
   * @returns {Promise<boolean>}
   */
  async hasConflict(veiculoId, inicio, fim, ignoreId = null) {
    const reservas = await this.repository.list();
    return reservas.some((r) =>
      r.veiculoId === veiculoId &&
      r.id !== ignoreId &&
      !["CANCELADA", "RECUSADA"].includes(r.status) &&
      overlap(r.inicio, r.fim, inicio, fim)
    );
  }

  /**
   * Cria uma nova reserva bloqueando conflitos de datas.
   * @param {Object} data
   * @param {string} data.veiculoId
   * @param {string} data.inicio
   * @param {string} data.fim
   * @param {number} data.total
   * @param {number} data.caucao
   * @param {string} [data.locatario]
   * @returns {Promise<{ok: boolean, id?: string, msg?: string}>}
   */
  async solicitar({ veiculoId, inicio, fim, total, caucao, locatario }) {
    const conflito = await this.hasConflict(veiculoId, inicio, fim);
    if (conflito) {
      return {
        ok: false,
        msg: "Conflito de datas (RN03/RF21): veículo já reservado neste período.",
      };
    }

    const reserva = await this.repository.create({
      veiculoId,
      locatario: locatario || "Você",
      inicio,
      fim,
      total,
      caucao,
    });

    return { ok: true, id: reserva.id };
  }

  /**
   * Atualiza parcialmente uma reserva.
   * @param {string} id
   * @param {Object} patch
   * @returns {Promise<Reserva | null>}
   */
  async atualizar(id, patch) {
    return this.repository.update(id, patch);
  }

  /**
   * Calcula o total da reserva com base no preço diária + seguro.
   * @param {number} precoDiaria
   * @param {number} seguroDia
   * @param {string} inicio
   * @param {string} fim
   * @returns {number}
   */
  calcularTotal(precoDiaria, seguroDia, inicio, fim) {
    const dias = diffDays(inicio, fim);
    return (precoDiaria + seguroDia) * dias;
  }
}

export const reservaService = new ReservaService();
