import { useApp } from "../store/AppContext";

export default function Admin() {
  const { reservas, vehicles, updateReserva, flash } = useApp();
  return (
    <div className="container page">
      <h2 style={{ margin: "4px 0" }}>Admin — moderação (RF17 · UC09)</h2>
      <div className="muted">Suspender contas/anúncios · arbitrar disputas com laudo auditado (RNF06) · trilha imutável.</div>
      <div style={{ height: 12 }} />
      <div className="split">
        <div className="panel">
          <h3 style={{ marginTop: 0 }}>Disputas e reservas</h3>
          <table className="table">
            <thead><tr><th>ID</th><th>Status</th><th>Ação</th></tr></thead>
            <tbody>
              {reservas.map((r) => (
                <tr key={r.id}>
                  <td>{r.id}<br /><span className="muted">{r.inicio}→{r.fim}</span></td>
                  <td><span className={`status st-${r.status}`}>{r.status}</span></td>
                  <td>
                    <div className="row">
                      {r.status === "EM_DISPUTA" && <button className="btn green small" onClick={() => { updateReserva(r.id, { status: "CONCLUIDA" }); flash("Laudo: sem avaria · valores liberados."); }}>Liberar</button>}
                      <button className="btn ghost small" onClick={() => { updateReserva(r.id, { status: "CANCELADA" }); flash("Transação suspensa preventivamente (RF17)."); }}>Suspender</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="panel">
          <h3 style={{ marginTop: 0 }}>Veículos / anúncios</h3>
          {vehicles.map((v) => (
            <div key={v.id} className="kv"><span>{v.marca} {v.modelo} — <span className={`status st-${v.status}`}>{v.status}</span></span><span className="muted">{v.docsOk ? "CRLV ok" : "CRLV pendente"}</span></div>
          ))}
          <div className="alert info">RNF01: 95% das buscas &lt; 2s · RNF06: auditoria versionada de pagamentos e disputas.</div>
        </div>
      </div>
    </div>
  );
}
