export const vehiclesSeed = [
  {
    id: "v1", marca: "Toyota", modelo: "Corolla XEi", ano: 2022, categoria: "Sedan",
    cidade: "São Paulo · Vila Mariana", precoDiaria: 189, score: 4.9, avaliacoes: 132,
    proprietario: "Marina S.", cambio: "Automático", combustivel: "Flex", lugares: 5,
    emoji: "🚗", status: "DISPONIVEL", aceiteAuto: true, caucao: 2000, seguroDia: 29,
    desc: "Revisado, seguro P2P por dia, entrega no metrô. Ideal para viagens e trabalho.",
    fotos: 12, docsOk: true,
  },
  {
    id: "v2", marca: "Jeep", modelo: "Renegade Longitude", ano: 2023, categoria: "SUV",
    cidade: "São Paulo · Moema", precoDiaria: 259, score: 4.8, avaliacoes: 89,
    proprietario: "Rafael T.", cambio: "Automático", combustivel: "Flex", lugares: 5,
    emoji: "🚙", status: "DISPONIVEL", aceiteAuto: false, caucao: 3000, seguroDia: 39,
    desc: "SUV alto, porta-malas grande, vistoria digital na retirada e devolução.",
    fotos: 18, docsOk: true,
  },
  {
    id: "v3", marca: "Honda", modelo: "CB 500F", ano: 2021, categoria: "Moto",
    cidade: "Osasco · Centro", precoDiaria: 99, score: 4.7, avaliacoes: 54,
    proprietario: "Diego L.", cambio: "Manual", combustivel: "Gasolina", lugares: 2,
    emoji: "🏍️", status: "RESERVADO", aceiteAuto: true, caucao: 1200, seguroDia: 19,
    desc: "Econômica, CNH categoria A obrigatória. Capacete incluso.",
    fotos: 8, docsOk: true,
  },
  {
    id: "v4", marca: "Tesla", modelo: "Model 3", ano: 2023, categoria: "Elétrico",
    cidade: "São Paulo · Itaim", precoDiaria: 449, score: 5.0, avaliacoes: 41,
    proprietario: "Camila R.", cambio: "Automático", combustivel: "Elétrico", lugares: 5,
    emoji: "⚡", status: "DISPONIVEL", aceiteAuto: false, caucao: 5000, seguroDia: 59,
    desc: "Autopilot, carregador incluso. Experiência premium com seguro total.",
    fotos: 22, docsOk: true,
  },
  {
    id: "v5", marca: "Fiat", modelo: "Strada Freedom", ano: 2020, categoria: "Picape",
    cidade: "Guarulhos · Centro", precoDiaria: 219, score: 4.6, avaliacoes: 77,
    proprietario: "João P.", cambio: "Manual", combustivel: "Diesel", lugares: 5,
    emoji: "🛻", status: "DISPONIVEL", aceiteAuto: true, caucao: 2500, seguroDia: 34,
    desc: "Caçamba grande para mudanças e trabalho. CNH B compatível.",
    fotos: 10, docsOk: true,
  },
  {
    id: "v6", marca: "VW", modelo: "Golf GTI", ano: 2019, categoria: "Hatch",
    cidade: "São Paulo · Pinheiros", precoDiaria: 299, score: 4.8, avaliacoes: 63,
    proprietario: "Lucas M.", cambio: "Automático", combustivel: "Gasolina", lugares: 5,
    emoji: "🚘", status: "DISPONIVEL", aceiteAuto: true, caucao: 2800, seguroDia: 42,
    desc: "Esportivo, revisões em dia. Apenas condutores verificados (KYC).",
    fotos: 14, docsOk: false,
  },
];

export const reservasSeed = [
  {
    id: "R-1024", veiculoId: "v2", locatario: "Você", inicio: "2026-10-02", fim: "2026-10-05",
    status: "APROVADA", total: 894, caucao: 3000, chat: [
      { from: "them", text: "Olá! Posso entregar às 9h no shopping." },
      { from: "me", text: "Perfeito! Vistoria de retirada com fotos, ok?" },
    ],
  },
  {
    id: "R-1019", veiculoId: "v1", locatario: "Você", inicio: "2026-08-10", fim: "2026-08-14",
    status: "CONCLUIDA", total: 872, caucao: 2000, avaliado: false, chat: [],
  },
];

export const categorias = ["Todas", "Sedan", "SUV", "Hatch", "Picape", "Moto", "Elétrico"];

export function diffDays(a, b) {
  const d1 = new Date(a); const d2 = new Date(b);
  const ms = d2 - d1;
  return Math.max(1, Math.round(ms / 86400000) + 1);
}

export function overlap(aStart, aEnd, bStart, bEnd) {
  return new Date(aStart) <= new Date(bEnd) && new Date(bStart) <= new Date(aEnd);
}

export const BRL = (v) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
