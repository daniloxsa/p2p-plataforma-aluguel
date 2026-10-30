import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { BRL, diffDays } from "../data/mock";
import { useApp } from "../store/AppContext";

export default function VehicleDetail() {
  const { id } = useParams();
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const { vehicles, user, createReserva, hasConflict, flash, isAuthLoading } = useApp();
  const v = vehicles.find((x) => x.id === id);

  const [inicio, setInicio] = useState(sp.get("inicio") || "2026-10-10");
  const [fim, setFim] = useState(sp.get("fim") || "2026-10-13");
  const [conflito, setConflito] = useState(false);
  const [checking, setChecking] = useState(true);
  const [reserving, setReserving] = useState(false);
  useEffect(() => {
    let active = true;
    setChecking(true);
    hasConflict(id, inicio, fim).then(value => { if (active) setConflito(value); })
      .catch(() => { if (active) setConflito(true); })
      .finally(() => { if (active) setChecking(false); });
    return () => { active = false; };
  }, [id, inicio, fim, hasConflict]);

  const calc = useMemo(() => {
    if (!v) return null;
    const dias = diffDays(inicio, fim);
    const diarias = dias * v.precoDiaria;
    const seguro = dias * v.seguroDia;
    const taxa = Math.round(diarias * 0.12);
    const total = diarias + seguro + taxa;
    return { dias, diarias, seguro, taxa, total };
  }, [v, inicio, fim]);

  if (!v) return <div className="container page"><div className="alert err">Veículo não encontrado.</div></div>;

  async function reservar() {
    if (!user) { nav("/login", { state: { from: `/veiculo/${id}?inicio=${inicio}&fim=${fim}` } }); return; }
    if (reserving) return;
    setReserving(true);
    try {
      const r = await createReserva(v.id, inicio, fim, calc.total, v.caucao);
      if (!r.ok) { flash(r.msg); return; }
      nav(`/checkout/${r.id}`);
    } catch { flash("Não foi possível criar a reserva de demonstração."); }
    finally { setReserving(false); }
  }

  return (
    <div className="container page">
      <button className="btn ghost small" onClick={() => nav(-1)}>← Voltar</button>
      <div style={{ height: 12 }} />
      <div className="split">
        <div className="panel">
          <div className="car-mark" style={{ fontSize: 13, fontWeight: 800, letterSpacing: ".18em", color: "var(--faint)", background: "var(--field)", border: "1px solid var(--line)", borderRadius: 4, padding: 32, textAlign: "center" }}>{v.marca} {v.modelo} · {v.ano}</div>
          <h2 style={{ margin: "12px 0 6px" }}>{v.marca} {v.modelo} · {v.ano}</h2>
          <div className="muted">{v.cidade} · {v.proprietario} · {v.score.toFixed(1)} ({v.avaliacoes} avaliações)</div>
          <div className="row" style={{ marginTop: 10 }}>
            <span className="tag">{v.categoria}</span><span className="tag">{v.cambio}</span>
            <span className="tag">{v.combustivel}</span><span className="tag">{v.lugares} lugares</span>
            <span className={`status st-${v.status}`}>{v.status}</span>
            {!v.docsOk && <span className="tag">CRLV em análise (RN02)</span>}
          </div>
          <p>{v.desc}</p>
          <div className="map-ph">Vistoria digital obrigatória (RF08) · {v.fotos} fotos de referência · retirada x devolução comparadas</div>
          <div style={{ height: 12 }} />
          <h3>Contrato e regras (UC05)</h3>
          <div className="muted" style={{ fontSize: 14 }}>
            • Aceite eletrônico das 2 partes · CNH compatível (RN04) · caução apenas retida, não cobrada (RN05/RN06)<br />
            • Repasse ao dono só após devolução sem pendência (RN09) · disputa congela valores (RN10)
          </div>
        </div>
        <div className="panel">
          <h3 style={{ marginTop: 0 }}>Sua reserva (UC03)</h3>
          <div className="grid2">
            <div className="field"><label>Início</label><input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} /></div>
            <div className="field"><label>Fim</label><input type="date" value={fim} onChange={(e) => setFim(e.target.value)} /></div>
          </div>
          <div className="kv"><span>{calc.dias} diárias × {BRL(v.precoDiaria)}</span><strong>{BRL(calc.diarias)}</strong></div>
          <div className="kv"><span>Seguro P2P × {calc.dias} dias (RF13)</span><strong>{BRL(calc.seguro)}</strong></div>
          <div className="kv"><span>Taxa plataforma 12% (RF10)</span><strong>{BRL(calc.taxa)}</strong></div>
          <div className="kv"><span>Caução (retenção temporária)</span><strong>{BRL(v.caucao)}</strong></div>
          <div className="kv"><span>Total a pagar agora</span><strong style={{ fontSize: 20 }}>{BRL(calc.total)}</strong></div>
          {checking ? <div className="alert info">Consultando disponibilidade...</div> : conflito
            ? <div className="alert err">Conflito de datas (RN03/RF21): já existe reserva neste período. Altere as datas.</div>
            : <div className="alert ok">Disponível — sem sobreposição para este período.</div>}
          {!v.docsOk && <div className="alert warn">Veículo ainda EM_ANALISE (RN02) — protótipo permite simular mesmo assim.</div>}
          <button className="btn primary" style={{ width: "100%" }} disabled={conflito || checking || reserving || isAuthLoading} onClick={reservar}>
            {user ? "Solicitar reserva → contrato" : "Entrar e solicitar (RN01)"}
          </button>
          <div className="muted" style={{ fontSize: 13, marginTop: 8 }}>
            {v.aceiteAuto ? "Aceite automático ativado pelo proprietário (RF06)." : "Aprovação manual do proprietário em até 2h (RF06)."}
          </div>
        </div>
      </div>
    </div>
  );
}
