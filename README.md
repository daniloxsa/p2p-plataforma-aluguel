# DriveShare P2P — Protótipo Front-end (React + Vite)

Protótipo navegável da Plataforma P2P de Aluguel de Veículos (especificação v2.0).
Somente front-end, dados mockados em memória (+ localStorage p/ usuário).

## Rodar

```bash
cd p2p-aluguel
npm install
npm run dev
# abre http://localhost:5173/
```

Build produção: `npm run build` ✅ testado · Dev `200 OK` ✅ testado.

## Telas (cobrem RF/RN/UC)

| Rota | Tela | Requisitos |
|---|---|---|
| `#/` | Home: hero + stats (R$61,7Bi / 1,71Mi / 79,7Mi), busca por data/local/preço/categoria (RF04), mapa aproximado (RF20), grid responsivo | RF04, RF20, RF21 |
| `#/veiculo/:id` | Detalhe + cálculo diárias+seguro+taxa+caução, checagem de conflito RN03, aceite auto/manual RF06 | UC03, RN01/RN03/RN04/RN05 |
| `#/checkout/:id` | Contrato digital c/ aceite eletrônico (RF07), pagamento + caução isolada (RN05) | UC08, RF07, RF09 |
| `#/painel` | Minhas reservas (aprovar/recusar/iniciar/devolver/cancelar/disputa), chat (RF16), vistoria (RF08), avaliação 1–5 (RF11/RN07/RN08), extrato (RF18), repasse líquido -12% (RF10/RN09) | UC06/UC07/UC09/UC10 |
| `#/cadastro` | KYC 3 etapas: dados → CNH+biometria → verificado (RF01/RF22/RN01/RN04) | UC01 |
| `#/anunciar` | Cadastro de veículo + CRLV/OCR simulado (RF02/RF03/RN02) | UC02 |
| `#/admin` | Moderação: suspender, arbitrar disputas, laudo (RF17/RN10/RN12) | UC09 |

## Status simulados

Reserva: `SOLICITADA → APROVADA → EM_ANDAMENTO → CONCLUIDA` (+ `RECUSADA/CANCELADA/EM_DISPUTA`).
Veículo: `DISPONIVEL / RESERVADO / EM_ANALISE`.

## Responsivo

- Desktop: header completo, grid 3 colunas.
- Mobile (≤640px): menu hamburger + bottom nav de 5 itens, grid 1 coluna, hero empilhado.
