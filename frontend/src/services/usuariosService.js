import { usuariosRepository } from "../repositories";

export class UsuariosService {
  async getProfile() {
    if (!usuariosRepository) {
      throw new Error("Repository not available");
    }
    return await usuariosRepository.getProfile();
  }

  async updateProfile(data) {
    if (!usuariosRepository) {
      throw new Error("Repository not available");
    }
    return await usuariosRepository.updateProfile(data);
  }
}

export const usuariosService = new UsuariosService();
