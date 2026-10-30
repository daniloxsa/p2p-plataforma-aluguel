import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BRL, categorias } from "../data/mock";
import { useApp } from "../store/AppContext";
import { VehicleCard } from "../components/ui";

export default function Home() {
  const { vehicles, reservas } = useApp();
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("Todas");
  const [max, setMax] = useState(500);
  const [inicio, setInicio] = useState("2026-10-10");
  const [fim, setFim] = useState("2026-10-13");

  const list = useMemo(() => {
    return vehicles.filter((v) => {
      if (cat !== "Todas" && v.categoria !== cat) return false;
      if (v.precoDiaria > max) return false;
      if (q && !(v.marca + " " + v.modelo + " " + v.cidade).toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    });
  }, [vehicles, q, cat, max]);

  return (
    <div className="container page">
      <section className="hero">
        <div>
          <h1>Aluguel de carros entre pessoas.</h1>
          <p>Sem frota própria. Com verificação de identidade, documentos validados, seguro por dia, caução separada e reputação mútua.</p>
          <div className="row">
            <button className="btn green" style={{ background: "#fff", color: "#000" }} onClick={() => document.getElementById("lista")?.scrollIntoView({ behavior: "smooth" })}>Explorar frota</button>
            <button className="btn ghost" style={{ background: "transparent", color: "#fff", borderColor: "#555" }} onClick={() => nav("/anunciar")}>Anunciar meu carro</button>
          </div>
          <div className="hero-stats">
            <div className="stat"><strong>R$ 61,7 Bi</strong><small>Faturamento locação 2025</small></div>
            <div className="stat"><strong>1,71 Mi</strong><small>Frota no Brasil</small></div>
            <div className="stat"><strong>79,7 Mi</strong><small>Usuários acumulados</small></div>
          </div>
        </div>
        <div className="search-card">
          <h3>Buscar veículo</h3>
          <div className="sub">RF04 · com checagem de disponibilidade RF21</div>
          <div className="grid2">
            <div className="field"><label>Retirada</label><input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} /></div>
            <div className="field"><label>Devolução</label><input type="date" value={fim} onChange={(e) => setFim(e.target.value)} /></div>
          </div>
          <div className="field"><label>Onde / qual carro?</label><input placeholder="Ex: SUV em São Paulo, Corolla..." value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <div className="field"><label>Preço máx/dia: {BRL(max)}</label><input type="range" min={80} max={500} step={10} value={max} onChange={(e) => setMax(+e.target.value)} /></div>
          <button className="btn primary" style={{ width: "100%" }} onClick={() => document.getElementById("lista")?.scrollIntoView({ behavior: "smooth" })}>Buscar · {list.length} veículos</button>
          <div className="muted" style={{ marginTop: 8, fontSize: 12 }}>Reservas com sobreposição de datas são bloqueadas (RN03).</div>
        </div>
      </section>

      <div className="toolbar" id="lista">
        {categorias.map((c) => (
          <button key={c} className={`chip ${cat === c ? "active" : ""}`} onClick={() => setCat(c)}>{c}</button>
        ))}
        <span className="spacer" />
        <span className="muted">{list.length} resultados · {reservas.length} reservas demo</span>
      </div>

      <div className="map-ph">Mapa com localização aproximada por privacidade (RF20) — raio de 1,5 km</div>
      <div style={{ height: 16 }} />

      <div className="cards">
        {list.map((v) => (
          <VehicleCard key={v.id} v={v} onOpen={(vv) => nav(`/veiculo/${vv.id}?inicio=${inicio}&fim=${fim}`)} />
        ))}
      </div>
      {list.length === 0 && <div className="alert warn">Nenhum veículo com esse filtro. Ajuste preço ou categoria.</div>}
    </div>
  );
}
