import { createContext, useContext, useLayoutEffect, useMemo, useState, useEffect } from "react";
import { applyTheme } from "./theme";
import { reservaService, vehicleService } from "../services";

const AppCtx = createContext(null);
export const useApp = () => useContext(AppCtx);

export function AppProvider({ children }) {
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme || "light");
  useLayoutEffect(() => applyTheme(theme), [theme]);

  function toggleTheme() {
    setTheme((current) => (current === "dark" ? "light" : "dark"));
  }

  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem("ds_user")) || null; } catch { return null; }
  });
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
      } catch (err) {
        console.warn("Falha ao carregar dados:", err);
      } finally {
        if (!cancelado) setLoading(false);
      }
    }
    carregar();
    return () => { cancelado = true; };
  }, []);

  function flash(msg) {
    setToast(msg);
    setTimeout(() => setToast(""), 3200);
  }

  function loginAs(name = "Visitante Verificado") {
    const u = { nome: name, status: "Verificado", score: 4.8, cnh: "B · válida até 2031" };
    setUser(u);
    localStorage.setItem("ds_user", JSON.stringify(u));
    flash("Login simulado: usuário Verificado (RN01).");
  }
  function logout() {
    setUser(null);
    localStorage.removeItem("ds_user");
  }

  // RN03 / RF21 — bloqueia conflito temporal
  async function hasConflict(veiculoId, inicio, fim, ignoreId = null) {
    return reservaService.hasConflict(veiculoId, inicio, fim, ignoreId);
  }

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

  const value = useMemo(() => ({
    theme,
    toggleTheme,
    user,
    setUser,
    loginAs,
    logout,
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
  }), [theme, user, vehicles, reservas, loading]);

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}
