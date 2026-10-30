import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { BRL } from "../data/mock";
import { useApp } from "../store/AppContext";

export default function AddVehicle() {
  const { addVehicle, flash, user } = useApp();
  const nav = useNavigate();
  const [f, setF] = useState({ marca: "Toyota", modelo: "Yaris", ano: 2022, categoria: "Hatch", cidade: "São Paulo · Centro", precoDiaria: 149, caucao: 1800, seguroDia: 25, cambio: "Automático", combustivel: "Flex", lugares: 5, emoji: "🚗", proprietario: "Você", aceiteAuto: true, docsOk: false, desc: "Carro revisado, econômico." });
  const set = (k, v) => setF({ ...f, [k]: v });

  function submit() {
    addVehicle({ ...f, proprietario: user.nome });
    flash("Demonstração: veículo adicionado somente nesta página, sem envio ao servidor.");
    nav("/");
  }

  return (
    <div className="container page" style={{ maxWidth: 720 }}>
      <div className="panel">
        <h2 style={{ marginTop: 0 }}>Anunciar veículo (RF02 · RF03 · RN02)</h2>
        <div className="grid2">
          <div className="field"><label>Marca</label><input value={f.marca} onChange={(e) => set("marca", e.target.value)} /></div>
          <div className="field"><label>Modelo</label><input value={f.modelo} onChange={(e) => set("modelo", e.target.value)} /></div>
        </div>
        <div className="grid2">
          <div className="field"><label>Ano</label><input type="number" value={f.ano} onChange={(e) => set("ano", +e.target.value)} /></div>
          <div className="field"><label>Categoria</label>
            <select value={f.categoria} onChange={(e) => set("categoria", e.target.value)}>
              <option>Sedan</option><option>SUV</option><option>Hatch</option><option>Picape</option><option>Moto</option><option>Elétrico</option>
            </select>
          </div>
        </div>
        <div className="field"><label>Localização (aproximada — RF20)</label><input value={f.cidade} onChange={(e) => set("cidade", e.target.value)} /></div>
        <div className="grid2">
          <div className="field"><label>Diária (R$)</label><input type="number" value={f.precoDiaria} onChange={(e) => set("precoDiaria", +e.target.value)} /></div>
          <div className="field"><label>Caução (R$)</label><input type="number" value={f.caucao} onChange={(e) => set("caucao", +e.target.value)} /></div>
        </div>
        <div className="field"><label>Descrição</label><textarea rows={3} value={f.desc} onChange={(e) => set("desc", e.target.value)} /></div>
        <div className="map-ph">📄 Upload CRLV + fotos (demo) — OCR + consulta de multas/restrições (RF03).<br />Preview diária: <strong>{BRL(f.precoDiaria)}</strong> · caução {BRL(f.caucao)}</div>
        <label className="row" style={{ marginTop: 10, fontSize: 14 }}>
          <input type="checkbox" checked={f.aceiteAuto} onChange={(e) => set("aceiteAuto", e.target.checked)} /> Aceite automático de reservas (RF06)
        </label>
        <button className="btn primary" style={{ width: "100%", marginTop: 12 }} onClick={submit}>Enviar para validação (RN02)</button>
      </div>
    </div>
  );
}
