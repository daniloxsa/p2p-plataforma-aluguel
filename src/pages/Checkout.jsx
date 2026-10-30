import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { BRL } from "../data/mock";
import { useApp } from "../store/AppContext";

export default function Checkout() {
  const { id } = useParams();
  const nav = useNavigate();
  const { reservas, vehicles, updateReserva, flash } = useApp();
  const r = reservas.find((x) => x.id === id);
  const [aceite, setAceite] = useState(false);
  const [pagando, setPagando] = useState(false);

  if (!r) return <div className="container page"><div className="alert err">Reserva não encontrada.</div></div>;
  const v = vehicles.find((x) => x.id === r.veiculoId);

  function pagar() {
    if (!aceite) return;
    setPagando(true);
    setTimeout(() => {
      updateReserva(r.id, { status: v.aceiteAuto ? "APROVADA" : "SOLICITADA" });
      flash("Pagamento capturado + caução retida (RN05). Contrato assinado (RF07).");
      nav("/painel");
    }, 900);
  }

  return (
    <div className="container page">
      <button className="btn ghost small" onClick={() => nav(-1)}>← Voltar</button>
      <div style={{ height: 12 }} />
      <div className="split">
        <div className="panel">
          <h2 style={{ marginTop: 0 }}>Contrato digital — {r.id} (RF07)</h2>
          <div className="muted">Locador: {v.proprietario} · Locatário: {r.locatario} · {v.marca} {v.modelo} · {r.inicio} → {r.fim}</div>
          <div className="panel" style={{ background: "#f8fafc", marginTop: 12, fontSize: 14 }}>
            <p><strong>Cláusula 1.</strong> Objeto: locação P2P do veículo {v.marca} {v.modelo} ({v.ano}), com seguro P2P diário (RF13) e vistoria digital obrigatória na retirada e devolução (RF08).</p>
            <p><strong>Cláusula 2.</strong> Caução de {BRL(r.caucao)} será apenas <u>retida/autorizada</u> no cartão, sem captura (RN05), estornada em 24h se sem avaria (RN06).</p>
            <p><strong>Cláusula 3.</strong> Repasse ao proprietário (líquido da comissão) somente após devolução e encerramento sem pendências (RN09). Disputa ativa congela repasse e caução (RN10).</p>
            <p><strong>Cláusula 4.</strong> Cancelamento com reembolso progressivo (RN11): &gt;72h 100% · 24–72h 70% · &lt;24h 40%.</p>
            <p><strong>Cláusula 5.</strong> Avaliação recíproca 1–5 somente após status CONCLUÍDA (RN07), uma por participante (RN08).</p>
          </div>
          <label className="row" style={{ marginTop: 12, fontSize: 14 }}>
            <input type="checkbox" checked={aceite} onChange={(e) => setAceite(e.target.checked)} />
            Li e aceito eletronicamente o contrato (aceite locatário · hash simulado)
          </label>
        </div>
        <div className="panel">
          <h3 style={{ marginTop: 0 }}>Pagamento (UC08 · RF09)</h3>
          <div className="kv"><span>Diárias + seguro + taxas</span><strong>{BRL(r.total)}</strong></div>
          <div className="kv"><span>Caução — só retenção</span><strong>{BRL(r.caucao)}</strong></div>
          <div className="alert info">Gateway demo: captura {BRL(r.total)} + pré-autoriza {BRL(r.caucao)}. Auditoria imutável (RNF06).</div>
          <div className="field"><label>Cartão</label><input defaultValue="4111 1111 1111 1111" /></div>
          <div className="grid2">
            <div className="field"><label>Validade</label><input defaultValue="12/30" /></div>
            <div className="field"><label>CVV</label><input defaultValue="123" /></div>
          </div>
          <button className="btn primary" style={{ width: "100%" }} disabled={!aceite || pagando} onClick={pagar}>
            {pagando ? "Processando..." : `Pagar ${BRL(r.total)} + reter caução`}
          </button>
        </div>
      </div>
    </div>
  );
}
