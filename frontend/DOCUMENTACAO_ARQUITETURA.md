# Documentação de Arquitetura — p2p-aluguel

Este documento descreve a estrutura em camadas do front-end, criada para
remover a dependência direta de dados mockados nas páginas e preparar o
projeto para futura inserção de uma API backend real.

---

## 1. Visão geral

Antes da reestruturação, as páginas importavam dados mock diretamente de
`src/data/mock.js` via `AppContext`. Isso acoplava a UI aos dados locais.

Depois da reestruturação, as páginas continuam consumindo `useApp()` (mesma
interface), mas o `AppContext` agora depende de **serviços**, que por sua vez
dependem de **repositórios**. Os repositórios mock consomem os seeds de
`src/data/mock.js`. Quando houver backend, basta trocar os repositórios mock
por implementações que chamem a API — serviços e páginas não precisam mudar.

```
Páginas (Home, Checkout, Dashboard...)
        │
        ▼
  src/store/AppContext.jsx  ← useApp()  (estado global, loading, createReserva...)
        │
        ▼
  src/services/             ← vehicleService, reservaService (regras de negócio)
        │
        ▼
  src/repositories/         ← vehicleRepository, reservaRepository (mock por padrão)
        │
        ▼
  src/data/mock.js          ← seeds (apenas enquanto mock mode)
  src/api/client.js         ← fetch (apenas quando API real)
```

---

## 2. Camada por camada

### 2.1 `src/api/config.js`

Configuração centralizada da camada de API.

```js
export const API_CONFIG = {
  baseURL: import.meta.env.VITE_API_URL || "",
  timeout: 10000,
  headers: { "Content-Type": "application/json" },
};

export function isMockMode() {
  return !API_CONFIG.baseURL;
}
```

- `VITE_API_URL` vem do arquivo `.env`. Se estiver vazia, `isMockMode()` retorna
  `true` e os repositórios mock são usados.
- Timeout padrão de 10 segundos.

### 2.2 `src/api/client.js`

Cliente HTTP genérico baseado em `fetch`. Centraliza base URL, timeout,
headers, tratamento de erros e serialização JSON.

Métodos: `get`, `post`, `put`, `patch`, `delete`.

```js
export const apiClient = new ApiClient(API_CONFIG.baseURL);
```

Quando a API real estiver pronta, é aqui que se adiciona:
- token de autenticação nos headers
- interceptors de request/response
- retry automático
- tratamento padronizado de erros 401/403/429/500

### 2.3 `src/repositories/`

Cada repositório expõe uma **classe abstrata** (contrato) e uma
**implementação mock**. O contrato garante que qualquer implementação futura
tenha os mesmos métodos.

#### `vehicleRepository.js`

```ts
class VehicleRepository {
  async list(): Promise<Veiculo[]>
  async getById(id: string): Promise<Veiculo | null>
}

class VehicleRepositoryMock extends VehicleRepository { ... }
export const vehicleRepository = isMockMode()
  ? new VehicleRepositoryMock()
  : null; // TODO: new VehicleRepositoryApi()
```

#### `reservaRepository.js`

```ts
class ReservaRepository {
  async list(): Promise<Reserva[]>
  async create(data): Promise<Reserva>
  async update(id, patch): Promise<Reserva | null>
}

class ReservaRepositoryMock extends ReservaRepository { ... }
export const reservaRepository = isMockMode()
  ? new ReservaRepositoryMock()
  : null; // TODO: new ReservaRepositoryApi()
```

Os mocks incluem `setTimeout` para simular latência de rede durante o
desenvolvimento.

### 2.4 `src/services/`

Orquestram os repositórios e aplicam regras de negócio. Não sabem se os dados
vêm de mock ou de API.

#### `reservaService.js`

Métodos principais:

| Método | Descrição |
|--------|-----------|
| `listar()` | Lista todas as reservas |
| `hasConflict(veiculoId, inicio, fim, ignoreId)` | Checa sobreposição de datas (RN03 / RF21) |
| `solicitar({ veiculoId, inicio, fim, total, caucao, locatario })` | Cria reserva bloqueando conflitos |
| `atualizar(id, patch)` | Atualiza parcialmente uma reserva |
| `calcularTotal(precoDiaria, seguroDia, inicio, fim)` | Calcula total com base em dias |

#### `vehicleService.js`

Métodos principais:

| Método | Descrição |
|--------|-----------|
| `listar()` | Lista todos os veículos |
| `obterPorId(id)` | Busca veículo por ID |

### 2.5 `src/store/AppContext.jsx`

Estado global da aplicação. Carrega dados ao montar via `useEffect` e expõe
tudo pelas mesmas props que as páginas já usavam:

```
theme, toggleTheme, user, setUser, loginAs, logout,
vehicles, setVehicles, addVehicle, reservas, loading,
createReserva, updateReserva, hasConflict, toast, flash
```

- `loading`: indica se os dados ainda estão sendo carregados dos serviços.
- `createReserva` agora é async (chama o serviço e atualiza a lista local).

### 2.6 `src/data/mock.js`

Apenas seeds estáticos (`vehiclesSeed`, `reservasSeed`, `categorias`) e
utilitários puros (`diffDays`, `overlap`, `BRL`). Usado **exclusivamente**
pelos repositórios mock.

---

## 3. Fluxo de dados (exemplo: criar reserva)

```
1. Usuário clica em "Reservar" na página VehicleDetail
2. Página chama createReserva(veiculoId, inicio, fim, total, caucao) via useApp()
3. AppContext chama reservaService.solicitar(...)
4. Serviço chama reservaRepository.hasConflict(...) → lista reservas do repo
5. Se não houver conflito, serviço chama reservaRepository.create(...)
6. Repositório mock adiciona à lista local (ou API real envia POST)
7. AppContext recarrega reservas via reservaService.listar()
8. UI re-renderiza com a nova reserva
```

---

## 4. Como conectar a API backend (passo a passo)

### Passo 1 — Variável de ambiente

```bash
cp .env.example .env
```

Edite `.env`:

```
VITE_API_URL=https://api.seudominio.com
```

### Passo 2 — Criar repositórios reais

Exemplo (`src/repositories/vehicleRepositoryApi.js`):

```js
import { VehicleRepository } from "./vehicleRepository";
import { apiClient } from "../api/client";

export class VehicleRepositoryApi extends VehicleRepository {
  async list() {
    return apiClient.get("/veiculos");
  }

  async getById(id) {
    return apiClient.get(`/veiculos/${id}`);
  }
}
```

Exemplo (`src/repositories/reservaRepositoryApi.js`):

```js
import { ReservaRepository } from "./reservaRepository";
import { apiClient } from "../api/client";

export class ReservaRepositoryApi extends ReservaRepository {
  async list() {
    return apiClient.get("/reservas");
  }

  async create(data) {
    return apiClient.post("/reservas", data);
  }

  async update(id, patch) {
    return apiClient.patch(`/reservas/${id}`, patch);
  }
}
```

### Passo 3 — Ajustar a instância exportada

Em `vehicleRepository.js`:

```js
export const vehicleRepository = isMockMode()
  ? new VehicleRepositoryMock()
  : new VehicleRepositoryApi();
```

Em `reservaRepository.js`:

```js
export const reservaRepository = isMockMode()
  ? new ReservaRepositoryMock()
  : new ReservaRepositoryApi();
```

### Passo 4 — (Opcional) Autenticação

Se o backend exigir token, edite `src/api/client.js` para incluir o header
`Authorization` dinamicamente (ex: lendo de `localStorage`).

---

## 5. Scripts disponíveis

| Script | Descrição |
|--------|-----------|
| `npm run dev` | Servidor de desenvolvimento (Vite) |
| `npm run build` | Build de produção |
| `npm run lint` | Lint com oxlint |
| `npm run preview` | Preview do build de produção |

---

## 6. Regras de negócio implementadas

| Código | Descrição | Onde está |
|--------|-----------|-----------|
| RN01 | Usuário verificado (login simulado) | `AppContext.loginAs()` |
| RN02 | Cadastro de veículo (anunciar) | `AppContext.addVehicle()` |
| RN03 / RF21 | Bloqueio de conflito de datas | `reservaService.hasConflict()` |
| RF04 | Busca por data/local/preço/categoria | `Home.jsx` |
| RF06 | Aceite auto/manual | Veículo `aceiteAuto` |
| RF07 | Contrato digital / checkout | `Checkout.jsx` |
| RN05 | Caução isolada | Veículo `caucao` |

---

## 7. Estrutura final de pastas

```
src/
├── api/
│   ├── config.js
│   └── client.js
├── data/
│   └── mock.js
├── repositories/
│   ├── index.js
│   ├── vehicleRepository.js
│   └── reservaRepository.js
├── services/
│   ├── index.js
│   ├── vehicleService.js
│   └── reservaService.js
├── store/
│   └── AppContext.jsx
├── components/
│   └── ui/
├── pages/
│   ├── Home.jsx
│   ├── VehicleDetail.jsx
│   ├── Checkout.jsx
│   ├── Dashboard.jsx
│   ├── AddVehicle.jsx
│   └── ...
├── App.jsx
├── index.css
└── main.jsx
```

Arquivos raiz adicionados:
- `.env.example` — modelo de variáveis de ambiente
- `DOCUMENTACAO_ARQUITETURA.md` — este arquivo
