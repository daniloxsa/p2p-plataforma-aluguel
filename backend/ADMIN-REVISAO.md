# UniVia — B.1: análise administrativa de veículos e CRLV

## Situação e escopo

Backend e frontend implementados sobre a arquitetura existente. O antigo `/admin`
demonstrativo foi substituído por dados reais da API: indicadores, fila paginada,
detalhes, galeria, consulta privada de CRLV, revisão documental, decisão de veículo
e histórico. Não há decisões ou contagens simuladas na aplicação.

**A migration B.1 não foi aplicada.** As telas/rotas que consultam validade e
histórico dependem dela. Não foi validada uma aprovação real no PostgreSQL/Storage.
O código pode ser revisado e compilado antes da aplicação manual do SQL.

Inspeção inicial:

- Veículos começam PENDENTE, possuem desativação lógica, e a edição de identidade
  com documentos/anúncios ou após validação já exigia revisão. Essa restrição foi
  preservada. Aprovação não altera anúncios nem desbloqueia edição irrestrita.
- Documento existente permite apenas tipo CRLV. Estados confirmados no banco:
  PENDENTE, EM_ANALISE, APROVADO, REJEITADO e EXPIRADO. Não havia data de validade
  explícita, módulo de revisão ou fluxo de upload documental neste checkout.
- O PostgreSQL local não continha documentos de veículo na inspeção somente de
  leitura. Nada foi criado para simular essa documentação.
- Fotos já usam bucket privado, paths por veículo, hash de conteúdo, validação de
  imagens e URLs assinadas. StorageService foi reutilizado e extraído para um
  StorageModule compartilhado, sem inicializar outro FotosService/job.
- A identidade administrativa vem do JwtAuthGuard/AdminGuard da B.0, consultando
  papel atual do banco a cada requisição. O fluxo de login não foi alterado.

## Estrutura e contratos

Todos os endpoints abaixo exigem `JwtAuthGuard, AdminGuard`. Sem sessão: 401;
sessão válida sem ADMIN: 403. GETs usam Cache-Control: no-store.

| Método | Endpoint | Contrato |
|---|---|---|
| GET | `/api/admin/resumo` | `{ total, pendentes, em_analise, aprovados, rejeitados }` |
| GET | `/api/admin/veiculos` | `{ items, total, page, limit }` |
| GET | `/api/admin/veiculos/:id` | Dados pertinentes, `usuario: {id,nome}`, contagens, CRLV mais recente e fotos assinadas |
| GET | `/api/admin/veiculos/:id/documentos` | Documentos paginados, sem arquivo_url; `expirado` derivado da validade |
| GET | `/api/admin/veiculos/:id/historico` | Decisões paginadas com responsável mínimo e justificativa |
| GET | `/api/admin/documentos/:id/arquivo` | `{url, expira_em}`, acesso temporário privado |
| PATCH | `/api/admin/veiculos/:id/aprovar` | `{id,status_cadastro}` |
| PATCH | `/api/admin/veiculos/:id/rejeitar` | `{id,status_cadastro}` |
| PATCH | `/api/admin/veiculos/:id/reabrir` | `{id,status_cadastro}` |
| PATCH | `/api/admin/documentos/:id/aprovar` | `{id,veiculo_id,status_validacao}` |
| PATCH | `/api/admin/documentos/:id/rejeitar` | `{id,veiculo_id,status_validacao}` |

Listagem aceita page (1–100000), limit (1–100, padrão 20), status opcional
(PENDENTE/EM_ANALISE/APROVADO/REJEITADO), busca (até 100 caracteres, UUID exato ou
placa/marca/modelo parcial), orderBy (criado_em/marca/status_cadastro) e order
(asc/desc). Padrão criado_em desc; id desempata. Busca/filtros/paginação são feitos
no PostgreSQL. Contagem e itens usam snapshot RepeatableRead. Relações resumidas e
contagens são consultadas junto à listagem, sem loops de consultas por veículo.
Indicadores incluem veículos desativados e correspondem aos filtros de status.

Documentos e histórico usam page/limit com os mesmos limites. A galeria é limitada
a 100 registros; o fluxo existente de upload já limita a dez fotos por veículo.
Listagem mostra o estado cadastral do CRLV mais recente; a análise calcula a
validade efetiva e o servidor sempre a verifica novamente na decisão.

## Decisões

Todo PATCH exige **status_esperado**, o estado mostrado na tela. Campo protegido,
extra/desconhecido ou payload inválido gera 400. Um conflito de estado/requisito
gera 409 e a UI consulta novamente a API.

Aprovar veículo:

```json
{ "status_esperado": "PENDENTE" }
```

Exige veículo não desativado, estado PENDENTE/EM_ANALISE/REJEITADO, CRLV **mais
recente** APROVADO com validade explícita ainda vigente e arquivo privado acessível.
Um CRLV novo pendente bloqueia o uso de uma aprovação documental antiga. Também
exige foto com hash do pipeline de validação existente, caminho do veículo e
objeto privado presente com MIME/size de imagem válidos. Foto legada sem hash deve
ser reenviada pelo fluxo validado. Falha de arquivo/Storage impede aprovar.

Rejeitar veículo/documento:

```json
{
  "status_esperado": "PENDENTE",
  "justificativa": "O documento apresentado está ilegível."
}
```

Justificativa aparada, de 10 a 1000 caracteres, sem marcação HTML/controles.
Nenhum registro é excluído. Veículos já aprovados não são rejeitados por este
workflow; isso poderia afetar anúncios/reservas e exige um fluxo posterior.
Rejeitar novamente um estado já REJEITADO é conflito, sem duplicar histórico.

Aprovar documento é uma decisão **independente e explícita**:

```json
{ "status_esperado": "PENDENTE", "validade_ate": "2027-12-31" }
```

A data é um exemplo de formato, não uma validade sugerida para CRLV real. O
administrador precisa abrir/conferir o arquivo e informar sua validade real;
o backend não infere vencimento legal pelo ano_exercicio. Data deve ser ISO
YYYY-MM-DD, válida e atual/futura. A comparação usa dias UTC, incluindo o último
dia informado. Ausência de validade é bloqueio, mesmo para APROVADO legado.

Estados documentais PENDENTE/EM_ANALISE/REJEITADO/EXPIRADO podem receber revisão;
mesmo estado ou estado APROVADO não recebem nova decisão direta. Validação
documental não aprova automaticamente o veículo. Aprovação veicular nunca muda
status documental. Em veículo APROVADO/desativado, decisões documentais são
bloqueadas nesta fase. Documento aprovado que vencer torna-se inelegível para
uma aprovação futura; não há job alterando status nem anúncios automaticamente.

### Reanálise e correções

REJEITADO pode ser reanalisado diretamente com documentação válida ou reaberto
explicitamente para PENDENTE via `/reabrir` com status_esperado REJEITADO. Reabertura
também gera histórico e não apaga motivos anteriores. Documentos rejeitados ou
EXPIRADO podem receber aprovação explícita após conferência; o motivo anterior
permanece no histórico.

O proprietário vê, nos detalhes privados do veículo REJEITADO, apenas a última
justificativa e sua data em `revisao`, sem dados do administrador. O OwnerVehicle
exibe essa mensagem. Essa é uma extensão aditiva do contrato privado; os demais
campos e as regras de propriedade foram preservados.

Não existe neste checkout um fluxo de upload/substituição de CRLV pelo proprietário.
Ele **não foi simulado**. Correções de identidade validadas, novo documento ou
renovação de veículo já APROVADO ainda exigem um workflow de ingestão/revisão
posterior ou provisionamento operacional autorizado. Reabrir rejeitados permite
nova decisão, mas não libera a edição irrestrita da identidade pelo proprietário.
O painel mantém o bloqueio seguro quando não há evidências suficientes.

## Arquivos privados

Fotos preservam o bucket e as URLs assinadas existentes. CRLV usa o mesmo cliente
Supabase e um bucket privado **explicitamente configurado** por
`SUPABASE_VEHICLE_DOCUMENT_BUCKET`. Nenhum bucket ou .env foi criado/alterado.
Se não houver esse destino configurado, a consulta retorna 503 e a aprovação fica
bloqueada; não há fallback para URL pública ou fetch de URL arbitrária.

Referência documental canônica em arquivo_url:

```text
<veiculo_uuid>/<documento_uuid>.pdf
```

Também aceita jpg/png/webp ou URL permanente do **mesmo projeto configurado**,
no path Storage object do bucket definido, com esse mesmo caminho canônico.
URLs externas, paths de outro veículo, traversal, query tokens e URLs já assinadas
são recusados. Referências legadas incompatíveis exigem revisão operacional.

Antes de assinar/aprovar, StorageService confere bucket não público, existência do
objeto, tipo PDF/imagem e tamanho positivo. Nunca persiste uma URL assinada; ela
é emitida somente após autorização administrativa, com TTL existente (300s padrão,
900s máximo). Não são retornados paths permanentes, CPF, hashes ou credenciais.
O painel descarta links expirados, oferece atualização e usa no-referrer/noopener.
Uma assinatura já entregue continua válida até seu TTL; revogação ADMIN bloqueia
os próximos requests, sem revogar retroativamente links previamente emitidos.

## Consistência e auditoria

Nova tabela `historico_revisao_veiculo`: UUID, veículo, documento opcional,
administrador, alvo VEICULO/DOCUMENTO, estado anterior/novo, justificativa,
validade conferida e TIMESTAMPTZ. Possui FKs sem cascata, índices por veículo/data
e documento, checks, RLS sem acesso público e trigger append-only.

Status e histórico são gravados na mesma transação Serializable. Falha na auditoria
reverte o status. Decisões usam lock do veículo, compartilhando a disciplina das
fotos, e update condicional ao status_esperado. Operações concorrentes conflitantes
resultam em 409; não há repetição automática de decisões. Verificação de arquivo
privado ocorre durante a transação, com limite total de 60 segundos; isso pode
reter o lock enquanto o Storage responde. A UI permite espera compatível e trava
envio duplicado. Uma falha de rede pode exigir atualizar a tela para confirmar o
resultado de um commit cuja resposta se perdeu.

Anúncios, reservas e pagamentos não são atualizados por nenhuma decisão.
Remoção futura de arquivos depois da aprovação e alterações externas ao banco
continuam exigindo revalidação nas fases futuras de publicação/reservas.

## Frontend

HashRouter preservado:

- `/#/admin`: indicadores reais e atalhos filtrados.
- `/#/admin/veiculos`: fila com busca, filtros, ordem e paginação de servidor.
- `/#/admin/veiculos/:id`: identificação, fotos, CRLVs, histórico e confirmações.

AdminAccessProvider consulta `/admin/me` por identidade autenticada; não há JWT em
localStorage nem novo login. AdminRoute verifica acesso nas navegações e depende
do ProtectedRoute existente para encaminhar deslogados ao login. Resposta 403 de
qualquer chamada administrativa invalida o acesso visual e oculta Administração
no header/menu/bottomnav. 401 continua pelo refresh/invalidação existentes.
Não existe loop de autorização ligado a cada render do cabeçalho.

O antigo Admin demonstrativo com ações de reservas foi substituído. Não há ações
administrativas novas de usuários, anúncios, reservas ou pagamentos. O layout
utiliza as variáveis, painéis, tabelas e breakpoints existentes, com tema claro/
escuro preservado, indicadores em duas colunas no mobile e tabela rolável.

## Arquivos desta fase

Backend criados:

- `prisma/sql/20261101_admin_revisao.sql`
- `scripts/inspect-review-db.mjs`
- `src/admin/dto/review.dto.ts`
- `src/admin/vehicle-review.controller.ts`
- `src/admin/vehicle-review.service.ts`
- `src/veiculos/fotos/storage.module.ts`
- `test/vehicle-review.test.mjs`
- `test/vehicle-review.postgres.test.mjs`
- `ADMIN-REVISAO.md`

Backend modificados: `prisma/schema.prisma`, `src/admin/admin.module.ts`,
`src/veiculos/veiculos.module.ts`, `src/veiculos/veiculos.service.ts`,
`src/veiculos/fotos/storage.service.ts`. Prisma Client gerado localmente.

Frontend criados: `src/api/admin.js`, `src/components/AdminAccess.jsx`,
`src/components/AdminUi.jsx`, `src/pages/AdminVehicles.jsx`,
`src/pages/AdminVehicleReview.jsx`, `test/admin.test.jsx`.

Frontend modificados: `src/pages/Admin.jsx`, `src/App.jsx`, `src/components/ui.jsx`,
`src/index.css`, `src/pages/OwnerVehicle.jsx`. Nenhuma dependência nova.

## Aplicação e validação local

O operador deve revisar e aplicar manualmente a migration B.1 ao destino local
correto. Nada desta seção é executado automaticamente pelo painel/testes:

```powershell
cd backend
npx prisma db execute --file prisma/sql/20261101_admin_revisao.sql
npm run prisma:generate
npm run build
npm run start:dev
```

Essa migration pressupõe a B.0 já aplicada. Falha em nomes já existentes exige
revisão, não reset nem db push. Só inicie o código B.1 após o schema compatível.
Produção deve ter revisão/janela própria; nenhuma alteração de deploy foi feita.
O bucket privado e arquivos reais devem ser provisionados por operador autorizado
conforme o ambiente; não exponha a chave Supabase no React.

Em outro terminal:

```powershell
cd frontend
$env:VITE_API_URL = 'http://localhost:3000/api'
npm run dev
```

Mantenha a origem `http://localhost:5173` nas configurações locais já existentes de
CORS. Entre pela interface com a conta ADMIN existente, sem copiar JWT.

Roteiro manual, somente com dados de teste em ambiente dedicado:

1. USUARIO deve receber acesso negado ao abrir `/#/admin`; deslogado vai ao login.
2. ADMIN vê indicadores do banco, abre Pendentes, busca por placa e pagina a fila.
3. Abra um veículo de teste, amplie fotos e confira a ausência de documentos.
   Aprovação deve estar bloqueada sem CRLV válido; não crie registros fictícios.
4. Com um CRLV real já cadastrado no ambiente dedicado e bucket privado correto,
   consulte seu arquivo, confira validade e aprove o documento explicitamente.
5. Confira histórico DOCUMENTO e veículo ainda PENDENTE. Aprove o veículo apenas
   após os requisitos; confira novo status/histórico e anúncio ainda RASCUNHO.
6. Em outro veículo de teste, rejeite com motivo, confira histórico e mensagem
   privada do proprietário, reabra e analise novamente.
7. Duas abas com status antigo: a segunda decisão contraditória deve receber 409
   e atualizar a tela. Simule rede/arquivo indisponível sem aprovar dados reais.
8. Revogação ADMIN pelo procedimento B.0 deve bloquear o próximo request e ocultar
   o link de navegação. Não use a conta única administradora para teste de revogação.

Verificações de código:

```powershell
cd backend
npm test
node node_modules/typescript/bin/tsc -p tsconfig.json --incremental false
cd ../frontend
npm test
npm run build
```

Teste PostgreSQL preparado, **não executado nesta entrega**. Exige base isolada,
distinta de DATABASE_URL, schema B.0/B.1 compatível e opt-in explícito:

```powershell
$env:TEST_DATABASE_URL = 'postgresql://usuario:senha@localhost:5432/univia_test'
$env:RUN_REVIEW_INTEGRATION = '1'
node --import tsx --test test/vehicle-review.postgres.test.mjs
Remove-Item Env:TEST_DATABASE_URL
Remove-Item Env:RUN_REVIEW_INTEGRATION
```

Esse teste faz persistência PostgreSQL real dentro de rollback integral, com
Storage simulado. Não aplica SQL nem testa Storage real, HTTP autenticado completo
ou disputa de conexões independentes. Os testes HTTP novos usam AuthService e
persistência simulados com guards reais; a B.0 continua cobrindo JWT real.

Não houve teste de escrita em veículos locais reais, migration, upload, alteração
de bucket, conta, papel, segredo, .env, commit, push ou deploy. Verificação manual
autenticada no navegador, visual em dispositivos reais e fluxo completo com
CRLV/Storage reais permanecem pendentes até preparar o ambiente e aplicar o SQL.
Não houve avanço para B.2.

## Resultados desta entrega

- Prisma Client gerado; compilação TypeScript aprovada sem alterar o cache
  incremental já modificado no checkout.
- Backend: **93 aprovados, zero falhas, 5 integrações ignoradas**, total 98.
- Frontend: **89 aprovados em 9 arquivos**; build Vite aprovado.
- `git diff --check` aprovado.
- `admin-test.mjs --verificar-local`: PostgreSQL/listener locais confirmados e
  `/api/admin/me` real sem token retornando 401. Não foram digitadas credenciais.
- A inspeção real inicial leu somente metadados e contagens documentais em uma
  transação READ ONLY. Não houve escrita no banco local/produção.
- Os resultados B.1 de aprovação/rejeição, concorrência e rollback são de testes
  unitários/HTTP com persistência simulada, não de PostgreSQL/Storage reais.
  O teste PostgreSQL B.1 exige opt-in/base isolada e permaneceu ignorado.
