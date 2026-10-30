import { createContext, useContext, useLayoutEffect, useCallback, useState, useEffect, useSyncExternalStore } from "react";
import { authService } from "../services/authService";
import { applyTheme } from "./theme";
import { reservaService, vehicleService, usuariosService } from "../services";

const AppCtx = createContext(null);
export const useApp = () => useContext(AppCtx);

export function AppProvider({ children }) {
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme || "light");
  useLayoutEffect(() => applyTheme(theme), [theme]);

  function toggleTheme() {
    setTheme((current) => (current === "dark" ? "light" : "dark"));
  }

  const auth = useSyncExternalStore(authService.subscribe, authService.getSnapshot);
  const { user } = auth;
  useEffect(() => {
    let active = true;
    try { localStorage.removeItem("ds_user"); } catch { /* Armazenamento pode estar desabilitado. */ }
    authService.restore().catch(error => { if (active) flash(error.message); });
    return () => { active = false; };
  }, []);
  const [vehicles, setVehicles] = useState([]);
  const [reservas, setReservas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState("");

  // Carrega dados dos serviços (mock por padrão, API real no futuro)
  useEffect(() => {
    let cancelado = false;
    async function carregar() {
      setLoading(true);
      try {
        const [veiculos, reservasList] = await Promise.all([
          vehicleService.listar(),
          reservaService.listar(),
        ]);
        if (!cancelado) {
          setVehicles(veiculos);
          setReservas(reservasList);
        }
      } catch {
        flash("Não foi possível carregar os dados de demonstração.");
      } finally {
        if (!cancelado) setLoading(false);
      }
    }
    carregar();
    return () => { cancelado = true; };
  }, []);

  // Carrega dados do perfil do usuário autenticado
  useEffect(() => {
    let active = true;
    if (user?.id) {
      usuariosService.getProfile()
        .then(profile => {
          const current = authService.getSnapshot().user;
          if (active && current?.id === user.id && profile.id === user.id) {
            authService.update({ user: { ...current, ...profile } });
          }
        })
        .catch(() => {
          if (active) flash("Não foi possível carregar os dados do perfil.");
        });
    }
    return () => { active = false; };
  }, [user?.id]);

  function flash(msg) {
    setToast(msg);
    setTimeout(() => setToast(""), 3200);
  }

  const login = credentials => authService.login(credentials);
  const logout = () => authService.logout();

  async function updateProfile(data) {
    const updatedUser = await usuariosService.updateProfile(data);
    // Atualiza o usuário no authService para manter a consistência
    const current = authService.getSnapshot().user;
    if (current?.id === user?.id && updatedUser.id === current?.id) {
      authService.update({ user: { ...current, ...updatedUser } });
    }
    return updatedUser;
  }

  // RN03 / RF21 — bloqueia conflito temporal
  const hasConflict = useCallback(async (veiculoId, inicio, fim, ignoreId = null) => {
    return reservaService.hasConflict(veiculoId, inicio, fim, ignoreId);
  }, []);

  async function createReserva(veiculoId, inicio, fim, total, caucao) {
    const resultado = await reservaService.solicitar({
      veiculoId,
      inicio,
      fim,
      total,
      caucao,
      locatario: user?.nome || "Você",
    });
    if (!resultado.ok) {
      return { ok: false, msg: resultado.msg };
    }
    // Atualiza lista local após criação
    const reservasAtualizadas = await reservaService.listar();
    setReservas(reservasAtualizadas);
    return { ok: true, id: resultado.id };
  }

  async function updateReserva(id, patch) {
    const atualizada = await reservaService.atualizar(id, patch);
    if (!atualizada) return;
    setReservas((prev) => prev.map((r) => (r.id === id ? atualizada : r)));
  }

  function addVehicle(v) {
    // Mantido localmente (anúncio de veículo). Futuro: chamar vehicleService.criar(v)
    const id = "v" + (vehicles.length + 1) + "-" + Date.now().toString(36);
    const novo = { ...v, id, score: 5.0, avaliacoes: 0, status: "DISPONIVEL" };
    setVehicles((prev) => [novo, ...prev]);
  }

  const value = {
    theme,
    toggleTheme,
    ...auth,
    login,
    logout,
    updateProfile,
    vehicles,
    setVehicles,
    addVehicle,
    reservas,
    loading,
    createReserva,
    updateReserva,
    hasConflict,
    toast,
    flash,
  };

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}
