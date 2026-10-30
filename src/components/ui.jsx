import { NavLink, useNavigate } from "react-router-dom";
import { useState } from "react";
import { useApp } from "../store/AppContext";

export function Header() {
  const { user, logout } = useApp();
  const [open, setOpen] = useState(false);
  const nav = useNavigate();
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
            <NavLink to="/admin" className={({ isActive }) => isActive ? "active" : ""}>Admin</NavLink>
          </nav>
          {user ? (
            <div className="row" style={{ marginLeft: "auto" }}>
              <span className="tag">{user.nome} · {user.status}</span>
              <button className="btn ghost small" onClick={logout}>Sair</button>
            </div>
          ) : (
            <button className="btn primary small" style={{ marginLeft: "auto" }} onClick={() => nav("/login")}>Entrar</button>
          )}
          <button className="hamburger" onClick={() => setOpen(!open)} aria-label="menu">—</button>
        </div>
      </header>
      {open && (
        <div className="mobile-menu">
          <a href="#/" onClick={() => setOpen(false)}>Buscar veículos</a>
          <a href="#/anunciar" onClick={() => setOpen(false)}>Anunciar veículo</a>
          <a href="#/painel" onClick={() => setOpen(false)}>Painel / Reservas</a>
          <a href="#/cadastro" onClick={() => setOpen(false)}>Verificação KYC</a>
          <a href="#/admin" onClick={() => setOpen(false)}>Admin</a>
        </div>
      )}
    </>
  );
}

export function Footer() {
  return (
    <footer className="footer">
      <div className="container">
        <strong style={{ color: "#000" }}>DriveShare P2P — protótipo front-end</strong>
        <p>React + Vite · responsivo · dados de demonstração. RN01 verificação KYC · RN03 sem sobreposição · RN05 caução isolada · RN09 repasse pós-devolução · RN10 disputa congela valores.</p>
        <p>Fluxo: SOLICITADA → APROVADA → EM_ANDAMENTO → CONCLUÍDA · EM_DISPUTA / CANCELADA / RECUSADA</p>
      </div>
    </footer>
  );
}

export function BottomNav() {
  return (
    <nav className="bottomnav">
      <div className="bottomnav-inner">
        <NavLink to="/" className={({ isActive }) => isActive ? "active" : ""}><span>Buscar</span></NavLink>
        <NavLink to="/anunciar" className={({ isActive }) => isActive ? "active" : ""}><span>Anunciar</span></NavLink>
        <NavLink to="/painel" className={({ isActive }) => isActive ? "active" : ""}><span>Painel</span></NavLink>
        <NavLink to="/cadastro" className={({ isActive }) => isActive ? "active" : ""}><span>KYC</span></NavLink>
        <NavLink to="/admin" className={({ isActive }) => isActive ? "active" : ""}><span>Admin</span></NavLink>
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
