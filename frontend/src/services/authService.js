import { apiClient, ApiError } from "../api/client";

export class AuthService {
  constructor(client = apiClient) {
    this.client = client;
    this.state = { user: null, accessToken: null, isAuthenticated: false, isAuthLoading: true };
    this.listeners = new Set();
    this.generation = 0;
    this.refreshPromise = null;
    this.restorePromise = null;
    this.loginPromise = null;
    this.logoutPromise = null;
    client.configureAuth({
      getToken: () => this.state.accessToken,
      refresh: () => this.refresh(),
      invalidate: () => this.clear(),
    });
  }

  subscribe = (listener) => { this.listeners.add(listener); return () => this.listeners.delete(listener); };
  getSnapshot = () => this.state;
  update(patch) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach(listener => listener());
  }
  clear() {
    this.generation++;
    this.update({ user: null, accessToken: null, isAuthenticated: false, isAuthLoading: false });
  }

  async confirm(session, generation) {
    if (!session?.accessToken || session.tokenType !== "Bearer" || !session.user?.id) throw new ApiError(500);
    const user = await this.client.get("/auth/me", { expectedStatus: 200, headers: { Authorization: `Bearer ${session.accessToken}` } });
    if (!user?.id || user.id !== session.user.id) throw new ApiError(401);
    if (generation !== this.generation) throw new ApiError(401);
    this.update({ user, accessToken: session.accessToken, isAuthenticated: true });
    return user;
  }

  restore() {
    // Também deduplica o efeito duplo do React StrictMode.
    if (!this.restorePromise) {
      this.restorePromise = this.refresh().catch(error => {
        if (error.status !== 401) throw error;
      }).finally(() => this.update({ isAuthLoading: false }));
    }
    return this.restorePromise;
  }

  refresh() {
    if (this.logoutPromise) return Promise.reject(new ApiError(401));
    if (!this.refreshPromise) {
      const generation = this.generation;
      this.refreshPromise = (async () => {
        try {
          const session = await this.client.post("/auth/refresh", {}, { expectedStatus: 200 });
          return await this.confirm(session, generation);
        } catch (error) {
          if (generation === this.generation) this.clear();
          throw error;
        } finally { this.refreshPromise = null; }
      })();
    }
    return this.refreshPromise;
  }

  login(credentials) {
    if (this.logoutPromise) return Promise.reject(new ApiError(401));
    if (this.loginPromise) return this.loginPromise;
    this.loginPromise = (async () => {
      await this.restorePromise?.catch(() => {});
      await this.refreshPromise?.catch(() => {});
      const generation = ++this.generation;
      this.update({ user: null, accessToken: null, isAuthenticated: false, isAuthLoading: true });
      try {
        const session = await this.client.post("/auth/login", {
          email: credentials.email.trim().toLowerCase(), senha: credentials.senha,
        }, { expectedStatus: 200 });
        return await this.confirm(session, generation);
      } catch (error) {
        if (generation === this.generation) this.clear();
        throw error;
      } finally {
        this.update({ isAuthLoading: false });
        this.loginPromise = null;
      }
    })();
    return this.loginPromise;
  }

  async register(payload) {
    const user = await this.client.post("/auth/register", payload, { expectedStatus: 201 });
    if (!user?.id || user.status !== "PENDENTE_VERIFICACAO") throw new ApiError(500);
    return user;
  }

  logout() {
    if (this.logoutPromise) return this.logoutPromise;
    this.generation++;
    this.update({ isAuthLoading: true });
    this.logoutPromise = (async () => {
      try {
        await Promise.allSettled([this.refreshPromise, this.loginPromise]);
        await this.client.post("/auth/logout", {}, { expectedStatus: 204 });
      } finally {
        this.clear();
        this.logoutPromise = null;
      }
    })();
    return this.logoutPromise;
  }
}

export const authService = new AuthService();
