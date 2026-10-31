import MyVehicles from "../components/MyVehicles";
import { useSearchParams } from "react-router-dom";
import { useState } from "react";
import { BRL } from "../data/mock";
import { useApp } from "../store/AppContext";

export default function Dashboard() {
  const { reservas, vehicles, updateReserva, flash, user } = useApp();
  const [params] = useSearchParams();
  const [tab, setTab] = useState(params.get("aba") === "veiculos" ? "veiculos" : "reservas");
  const [chatMsg, setChatMsg] = useState({});
  const [nota, setNota] = useState(5);

  function sendChat(id) {
    const txt = (chatMsg[id] || "").trim();
    if (!txt) return;
    const r = reservas.find((x) => x.id === id);
    updateReserva(id, { chat: [...(r.chat || []), { from: "me", text: txt }] });
    setChatMsg({ ...chatMsg, [id]: "" });
    setTimeout(() => {
      const r2 = reservas.find((x) => x.id === id);
      updateReserva(id, { chat: [...(r2.chat || []), { from: "them", text: "Combinado. Confirmo na entrega." }] });
    }, 800);
  }

  const totalRepasse = reservas.filter((r) => r.status === "CONCLUIDA").reduce((s, r) => s + r.total * 0.88, 0);

  return (
    <div className="container page">
      <h2 style={{ margin: "4px 0" }}>Painel {user ? `· ${user.nome}` : ""}</h2>
      <div className="muted">Reservas · veículos · vistoria · chat · financeiro · avaliações · disputas</div>
      <div className="tabs">
        {[["reservas", "Minhas reservas"], ["veiculos", "Meus veículos"], ["financeiro", "Financeiro / Extrato"], ["ajuda", "Disputas / Ajuda"]].map(([k, l]) => (
          <button key={k} className={`chip ${tab === k ? "active" : ""}`} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>

      {tab === "reservas" && (
        <div className="cards" style={{ gridTemplateColumns: "1fr" }}>
          {reservas.map((r) => {
            const v = vehicles.find((x) => x.id === r.veiculoId);
            return (
              <div className="panel" key={r.id}>
                <div className="row">
                  <strong>{r.id}</strong>
                  <span className={`status st-${r.status}`}>{r.status}</span>
                  <span className="spacer" />
                  <span className="muted">{r.inicio} → {r.fim} · {BRL(r.total)} · caução {BRL(r.caucao)}</span>
                </div>
                <div className="muted" style={{ margin: "6px 0" }}>{v ? `${v.marca} ${v.modelo}` : r.veiculoId}</div>
                <div className="row" style={{ gap: 8 }}>
                  {r.status === "SOLICITADA" && (<>
                    <button className="btn green small" onClick={() => { updateReserva(r.id, { status: "APROVADA" }); flash("Reserva aprovada (RF06)."); }}>Aprovar (dono)</button>
                    <button className="btn ghost small" onClick={() => { updateReserva(r.id, { status: "RECUSADA" }); }}>Recusar</button>
                  </>)}
                  {r.status === "APROVADA" && <button className="btn primary small" onClick={() => { updateReserva(r.id, { status: "EM_ANDAMENTO" }); flash("Retirada + vistoria com fotos (RF08)."); }}>Iniciar + vistoria retirada</button>}
                  {r.status === "EM_ANDAMENTO" && <button className="btn primary small" onClick={() => { updateReserva(r.id, { status: "CONCLUIDA" }); flash("Devolução OK · caução estornada em 24h (RN06) · repasse liberado (RN09)."); }}>Devolver + vistoria</button>}
                  {(r.status === "APROVADA" || r.status === "SOLICITADA" || r.status === "EM_ANDAMENTO") && (
                    <>
                      <button className="btn ghost small" onClick={() => { updateReserva(r.id, { status: "CANCELADA" }); flash("Cancelada · estorno progressivo aplicado (RN11)."); }}>Cancelar</button>
                      <button className="btn danger small" onClick={() => { updateReserva(r.id, { status: "EM_DISPUTA" }); flash("Disputa aberta · repasse e caução congelados (RN10)."); }}>Abrir disputa</button>
                    </>
                  )}
                  {r.status === "EM_DISPUTA" && <button className="btn ghost small" onClick={() => { updateReserva(r.id, { status: "CONCLUIDA" }); flash("Disputa resolvida pelo admin (UC09)."); }}>Resolver (admin demo)</button>}
                  {r.status === "CONCLUIDA" && !r.avaliado && (
                    <span className="row">
                      <select value={nota} onChange={(e) => setNota(+e.target.value)}>
                        {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n}</option>)}
                      </select>
                      <button className="btn green small" onClick={() => { updateReserva(r.id, { avaliado: true, nota }); flash(`Avaliação ${nota}★ registrada (RN07/RN08 · RF11). Score recalculado (RF12).`); }}>Avaliar</button>
                    </span>
                  )}
                  {r.avaliado && <span className="tag">{r.nota} avaliada (RN08: única por reserva)</span>}
                </div>
                <div style={{ height: 10 }} />
                <strong style={{ fontSize: 14 }}>Chat da reserva (RF16)</strong>
                <div className="chat" style={{ marginTop: 6 }}>
                  {(r.chat || []).length === 0 && <span className="muted">Sem mensagens ainda.</span>}
                  {(r.chat || []).map((m, i) => <div key={i} className={`bubble ${m.from === "me" ? "me" : "them"}`}>{m.text}</div>)}
                </div>
                <div className="row" style={{ marginTop: 8 }}>
                  <input style={{ flex: 1, border: "1px solid var(--line)", borderRadius: 10, padding: "9px 12px" }} placeholder="Escrever mensagem..." value={chatMsg[r.id] || ""} onChange={(e) => setChatMsg({ ...chatMsg, [r.id]: e.target.value })} onKeyDown={(e) => e.key === "Enter" && sendChat(r.id)} />
                  <button className="btn small" onClick={() => sendChat(r.id)}>Enviar</button>
                </div>
              </div>
            );
          })}
          {reservas.length === 0 && <div className="alert info">Sem reservas ainda. Busque um veículo na home.</div>}
        </div>
      )}

      {tab === "veiculos" && <MyVehicles key={user?.id} />}

      {tab === "financeiro" && (
        <div className="split">
          <div className="panel">
            <h3 style={{ marginTop: 0 }}>Extrato (RF18 · RNF06)</h3>
            <table className="table">
              <thead><tr><th>ID</th><th>Tipo</th><th>Valor</th><th>Status</th></tr></thead>
              <tbody>
                {reservas.map((r) => (
                  <tr key={r.id}><td>{r.id}</td><td>Aluguel + seguro</td><td>{BRL(r.total)}</td><td>{r.status}</td></tr>
                ))}
                {reservas.map((r) => (
                  <tr key={r.id + "c"}><td>{r.id}</td><td>Caução retida (isolada)</td><td>{BRL(r.caucao)}</td><td>{r.status === "CONCLUIDA" ? "Estornada 24h" : r.status === "EM_DISPUTA" ? "Congelada" : "Retida"}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="panel">
            <h3 style={{ marginTop: 0 }}>Repasse ao proprietário (RF10 · RN09)</h3>
            <div className="kv"><span>Bruto concluído</span><strong>{BRL(reservas.filter((r) => r.status === "CONCLUIDA").reduce((s, r) => s + r.total, 0))}</strong></div>
            <div className="kv"><span>Comissão 12%</span><strong>- {BRL(reservas.filter((r) => r.status === "CONCLUIDA").reduce((s, r) => s + r.total * 0.12, 0))}</strong></div>
            <div className="kv"><span>Líquido a receber</span><strong style={{ fontSize: 20 }}>{BRL(totalRepasse)}</strong></div>
            <div className="alert ok">Repasse liberado só após devolução sem pendência. Sob disputa, fica congelado (RN10).</div>
          </div>
        </div>
      )}

      {tab === "ajuda" && (
        <div className="panel">
          <h3 style={{ marginTop: 0 }}>Disputas (UC09 · RF14)</h3>
          <div className="muted">Danos, atrasos, multas, avarias na vistoria. Mediação do admin com laudo auditado.</div>
          <div style={{ height: 10 }} />
          {reservas.filter((r) => r.status === "EM_DISPUTA").map((r) => (
            <div key={r.id} className="alert warn">{r.id} em disputa — caução {BRL(r.caucao)} + repasse congelados até decisão.</div>
          ))}
          {reservas.filter((r) => r.status === "EM_DISPUTA").length === 0 && <div className="alert ok">Nenhuma disputa ativa. Para simular, abra uma disputa numa reserva.</div>}
        </div>
      )}
    </div>
  );
}
