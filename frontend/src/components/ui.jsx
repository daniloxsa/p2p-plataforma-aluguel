import { NavLink, useNavigate } from "react-router-dom";
import { useState } from "react";
import { useApp } from "../store/AppContext";
import { useAdminAccess } from './AdminAccess';

export function Header() {
  const admin = useAdminAccess();
  const { user, logout, theme, toggleTheme, isAuthLoading, flash } = useApp();
  const [open, setOpen] = useState(false);
  const nav = useNavigate();
  const [leaving, setLeaving] = useState(false);
  async function signOut() {
    if (leaving) return;
    setLeaving(true);
    try { await logout(); flash("Sessão encerrada."); }
    catch { flash("Você saiu deste dispositivo, mas não foi possível confirmar a revogação da sessão no servidor."); }
    finally { setLeaving(false); nav("/login", { replace: true }); }
  }
  return (
    <>
      <header className="header">
        <div className="container header-inner">
          <a className="logo" href="#/" onClick={(e) => { e.preventDefault(); nav("/"); }}>
            DRIVESHARE <span className="mark">P2P</span>
          </a>
          <nav className="nav-desktop">
            <NavLink to="/" className={({ isActive }) => isActive ? "active" : ""}>Buscar</NavLink>
            <NavLink to="/anunciar" className={({ isActive }) => isActive ? "active" : ""}>Anunciar</NavLink>
            <NavLink to="/painel" className={({ isActive }) => isActive ? "active" : ""}>Painel</NavLink>
            {user && <NavLink to="/perfil" className={({ isActive }) => isActive ? "active" : ""}>Perfil</NavLink>}
            {admin?.allowed && <NavLink to="/admin" className={({ isActive }) => isActive ? "active" : ""}>Administração</NavLink>}
          </nav>
          <button
            type="button"
            className="theme-toggle"
            onClick={toggleTheme}
            aria-label={theme === "dark" ? "Ativar modo claro" : "Ativar modo escuro"}
            aria-pressed={theme === "dark"}
            title={theme === "dark" ? "Ativar modo claro" : "Ativar modo escuro"}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              {theme === "dark" ? <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" /></> : <path d="M20.9 13A9 9 0 0 1 11 3.1 9 9 0 1 0 20.9 13Z" />}
            </svg>
            <span>Modo escuro</span>
          </button>
          {user ? (
            <div className="row" style={{ marginLeft: "auto" }}>
              <span className="tag">{user.nome} · {user.status}</span>
              <button className="btn ghost small" disabled={leaving || isAuthLoading} onClick={signOut}>{leaving ? "Saindo..." : "Sair"}</button>
            </div>
          ) : (
            <button className="btn primary small" disabled={isAuthLoading} style={{ marginLeft: "auto" }} onClick={() => nav("/login")}>{isAuthLoading ? "Verificando sessão..." : "Entrar"}</button>
          )}
          <button className="hamburger" onClick={() => setOpen(!open)} aria-label="menu">—</button>
        </div>
      </header>
      {open && (
        <div className="mobile-menu">
          <a href="#/" onClick={() => setOpen(false)}>Buscar veículos</a>
          <a href="#/anunciar" onClick={() => setOpen(false)}>Anunciar veículo</a>
          <a href="#/painel" onClick={() => setOpen(false)}>Painel / Reservas</a>
          <a href="#/perfil" onClick={() => setOpen(false)}>Meu perfil</a>
          <a href="#/cadastro" onClick={() => setOpen(false)}>Criar conta</a>
          {admin?.allowed && <a href="#/admin" onClick={() => setOpen(false)}>Administração</a>}
        </div>
      )}
    </>
  );
}

export function Footer() {
  return (
    <footer className="footer">
      <div className="container">
        <strong style={{ color: "var(--ink)" }}>UniVia — catálogo de veículos</strong>
        <p>Anúncios reais publicados pelos proprietários. Reservas e contratações ainda não estão disponíveis.</p>
      </div>
    </footer>
  );
}

export function BottomNav() {
  const admin = useAdminAccess();
  const { user } = useApp();
  return (
    <nav className="bottomnav">
      <div className="bottomnav-inner">
        <NavLink to="/" className={({ isActive }) => isActive ? "active" : ""}><span>Buscar</span></NavLink>
        <NavLink to="/anunciar" className={({ isActive }) => isActive ? "active" : ""}><span>Anunciar</span></NavLink>
        <NavLink to="/painel" className={({ isActive }) => isActive ? "active" : ""}><span>Painel</span></NavLink>
        {user && <NavLink to="/perfil" className={({ isActive }) => isActive ? "active" : ""}><span>Perfil</span></NavLink>}
        <NavLink to="/cadastro" className={({ isActive }) => isActive ? "active" : ""}><span>Cadastro</span></NavLink>
        {admin?.allowed && <NavLink to="/admin" className={({ isActive }) => isActive ? "active" : ""}><span>Administração</span></NavLink>}
      </div>
    </nav>
  );
}

export function VehicleCard({ v, onOpen }) {
  const initials = (v.marca + " " + v.modelo).split(" ").map((w) => w[0]).slice(0, 2).join("");
  return (
    <article className="card">
      <div className="card-img">
        <span className="car-mark">{initials} · {v.ano}</span>
        <span className="price">{v.precoDiaria.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })}/dia</span>
        <span className="score">{v.score.toFixed(1)} ({v.avaliacoes})</span>
      </div>
      <div className="card-body">
        <h3>{v.marca} {v.modelo} · {v.ano}</h3>
        <div className="muted">{v.cidade} · {v.proprietario}</div>
        <div className="row">
          <span className="tag">{v.categoria}</span>
          <span className="tag">{v.cambio}</span>
          <span className={`status st-${v.status}`}>{v.status}</span>
        </div>
        <div className="row">
          <span className="spacer" />
          <button className="btn primary small" onClick={() => onOpen(v)}>Ver detalhes</button>
        </div>
      </div>
    </article>
  );
}
