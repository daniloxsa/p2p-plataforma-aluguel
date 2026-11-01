# DriveShare P2P — Protótipo Front-end (React + Vite)

O gerenciamento privado de anúncios já usa a API real. Consulte
[Anúncios — Fase A](ANUNCIOS.md) para rotas, configuração da API local,
autenticação, testes e instruções de uso. As instruções históricas de substituição
de mocks abaixo se referem às áreas demonstrativas, não ao CRUD privado.

Protótipo navegável da Plataforma P2P de Aluguel de Veículos (especificação v2.0).

---

## Arquitetura de dados (camadas)

O front-end está organizado em camadas para permitir a troca dos dados mockados por uma API backend real **sem alterar as páginas**:

```
src/
  api/           # cliente HTTP (fetch) + configuração (VITE_API_URL)
  repositories/  # contrato + implementação mock de veículos e reservas
  services/      # regras de negócio (RN03/RF21 etc.) independentes de mock/API
  store/         # AppContext (estado global) consome os serviços
  data/mock.js   # seeds mockados (usados apenas pelos repositórios mock)
```

| Camada | Responsabilidade | Depende de |
|--------|------------------|------------|
| `api/client.js` | Requisições HTTP (fetch) genéricas | Nenhuma (pode apontar para backend real) |
| `repositories/` | Acesso a dados (contrato + implementação mock) | `api/`, `data/mock.js` |
| `services/` | Regras de negócio (RN03, RF21, cálculo de total) | `repositories/` |
| `store/AppContext.jsx` | Estado global consumido pelas páginas | `services/` |
| `pages/` | Telas da aplicação | `store/` (via `useApp()`) |

Por padrão, o app roda com **mocks locais** (`src/data/mock.js`) por meio dos repositórios mock. Nenhuma alteração é necessária para desenvolver sem backend.

---

## Rodar

```bash
cd p2p-aluguel
npm install
npm run dev
# abre http://localhost:5173/
```

Build produção: `npm run build` ✅ testado · Dev `200 OK` ✅ testado.

---

## Conectar a API backend (futuro)

Quando o backend estiver disponível, siga estes passos:

### 1. Defina a URL da API

Copie `.env.example` para `.env` e preencha:

```bash
cp .env.example .env
```

Edite `.env`:

```
VITE_API_URL=https://api.seudominio.com
```

### 2. Substitua os repositórios mock

Crie implementações reais em `src/repositories/` que usem `src/api/client` (fetch):

- `VehicleRepositoryApi` → estenda `VehicleRepository` e implemente `list()` / `getById()` chamando endpoints de veículos.
- `ReservaRepositoryApi` → estenda `ReservaRepository` e implemente `list()` / `create()` / `update()` chamando endpoints de reservas.

Ajuste a instância exportada em cada arquivo para usar a classe real quando `VITE_API_URL` estiver definida:

```js
export const vehicleRepository = isMockMode()
  ? new VehicleRepositoryMock()
  : new VehicleRepositoryApi();
```

### 3. Serviços e AppContext permanecem inalterados

Os serviços (`src/services`) e o `AppContext` dependem apenas dos contratos dos repositórios, então **não precisam de alterações** ao trocar mock por API real.

---

## Telas (cobrem RF/RN/UC)

| Rota | Tela | Requisitos |
|------|------|------------|
| `#/` | Home: hero + stats, busca por data/local/preço/categoria (RF04), mapa aproximado (RF20), grid responsivo | RF04, RF20, RF21 |
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

---

## Licença

Privado — Protótipo interno.
