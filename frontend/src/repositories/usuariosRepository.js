import { apiClient } from "../api/client";

class UsuariosRepository {
  async getProfile() {
    return await this.list();
  }

  async updateProfile(data) {
    return await this.update(data);
  }
}

class UsuariosRepositoryApi extends UsuariosRepository {
  async list() {
    return await apiClient.get("/usuarios/me", { auth: true, expectedStatus: 200 });
  }

  async update(data) {
    return await apiClient.patch("/usuarios/me", data, { auth: true, expectedStatus: 200 });
  }
}

export const usuariosRepository = new UsuariosRepositoryApi();
