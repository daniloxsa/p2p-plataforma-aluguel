import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../store/AppContext";

export default function Register() {
  const { loginAs, flash } = useApp();
  const nav = useNavigate();
  const [form, setForm] = useState({ nome: "Ana Souza", cpf: "123.456.789-00", cnh: "B", validade: "2031-05-20", bio: false });
  const [step, setStep] = useState(1);

  function next() {
    if (step === 1 && (!form.nome || !form.cpf)) { flash("Preencha nome e CPF."); return; }
    if (step === 2 && !form.bio) { flash("Faça a biometria facial simulada para avançar (RNF09)."); return; }
    if (step < 3) setStep(step + 1);
    else {
      loginAs(form.nome);
      flash("KYC aprovado: OCR + biometria + CNH válida (RF01/RF22 · RN01/RN04).");
      nav("/");
    }
  }

  return (
    <div className="container page" style={{ maxWidth: 640 }}>
      <div className="panel">
        <h2 style={{ marginTop: 0 }}>Verificação de identidade — KYC (UC01 · RF01)</h2>
        <div className="row">
          {[1, 2, 3].map((s) => <span key={s} className={`tag ${step >= s ? "active" : ""}`} style={step >= s ? { background: "var(--ink)", color: "#fff" } : {}}>Etapa {s}</span>)}
        </div>
        {step === 1 && (<>
          <div className="field"><label>Nome completo</label><input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} /></div>
          <div className="grid2">
            <div className="field"><label>CPF</label><input value={form.cpf} onChange={(e) => setForm({ ...form, cpf: e.target.value })} /></div>
            <div className="field"><label>Telefone</label><input defaultValue="(11) 99999-0000" /></div>
          </div>
          <div className="alert info">LGPD: dados sensíveis criptografados (RNF02). OCR valida CNH legível; fraude suspende p/ admin (RN12).</div>
        </>)}
        {step === 2 && (<>
          <div className="field"><label>Categoria CNH (RN04 · RF22)</label>
            <select value={form.cnh} onChange={(e) => setForm({ ...form, cnh: e.target.value })}>
              <option value="A">A — Moto</option><option value="B">B — Carro</option><option value="AB">AB — Moto + Carro</option><option value="D">D — Van/ônibus</option>
            </select>
          </div>
          <div className="field"><label>Validade CNH</label><input type="date" value={form.validade} onChange={(e) => setForm({ ...form, validade: e.target.value })} /></div>
          <div className="map-ph">🤳 Biometria facial (demo): <br /><br />
            <button className="btn small" onClick={() => setForm({ ...form, bio: true })}>{form.bio ? "✅ Rosto capturado" : "Capturar rosto"}</button>
          </div>
        </>)}
        {step === 3 && (<>
          <div className="alert ok">✅ OCR: CNH legível · Categoria {form.cnh} · válida até {form.validade} · sem restrições.</div>
          <div className="alert ok">✅ Biometria: match 98,4% · liveness aprovado.</div>
          <div className="alert info">Status será atualizado para <strong>Verificado</strong> (RN01) — libera reservar e anunciar.</div>
        </>)}
        <div className="row" style={{ marginTop: 12 }}>
          {step > 1 && <button className="btn ghost" onClick={() => setStep(step - 1)}>Voltar</button>}
          <span className="spacer" />
          <button className="btn primary" onClick={next}>{step === 3 ? "Concluir verificação" : "Avançar"}</button>
        </div>
      </div>
    </div>
  );
}
