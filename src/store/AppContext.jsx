import { createContext, useContext, useMemo, useState } from "react";
import { reservasSeed, vehiclesSeed, overlap } from "../data/mock";

const AppCtx = createContext(null);
export const useApp = () => useContext(AppCtx);

export function AppProvider({ children }) {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem("ds_user")) || null; } catch { return null; }
  });
  const [vehicles, setVehicles] = useState(vehiclesSeed);
  const [reservas, setReservas] = useState(reservasSeed);
  const [toast, setToast] = useState("");

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
  function hasConflict(veiculoId, inicio, fim, ignoreId = null) {
    return reservas.some((r) =>
      r.veiculoId === veiculoId &&
      r.id !== ignoreId &&
      !["CANCELADA", "RECUSADA"].includes(r.status) &&
      overlap(r.inicio, r.fim, inicio, fim)
    );
  }

  function createReserva(veiculoId, inicio, fim, total, caucao) {
    if (hasConflict(veiculoId, inicio, fim)) {
      return { ok: false, msg: "Conflito de datas (RN03/RF21): veículo já reservado neste período." };
    }
    const id = "R-" + Math.floor(1000 + Math.random() * 9000);
    setReservas((prev) => [{ id, veiculoId, locatario: user?.nome || "Você", inicio, fim, status: "SOLICITADA", total, caucao, chat: [] }, ...prev]);
    return { ok: true, id };
  }

  function updateReserva(id, patch) {
    setReservas((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function addVehicle(v) {
    const id = "v" + (vehicles.length + 1) + "-" + Date.now().toString(36);
    setVehicles((prev) => [{ ...v, id, score: 5.0, avaliacoes: 0, status: "DISPONIVEL" }, ...prev]);
  }

  const value = useMemo(() => ({
    user, setUser, loginAs, logout, vehicles, setVehicles, addVehicle,
    reservas, createReserva, updateReserva, hasConflict, toast, flash,
  }), [user, vehicles, reservas, toast]);

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}
