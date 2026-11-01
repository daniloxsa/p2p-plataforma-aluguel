# UniVia — Fase B.2: ciclo de vida dos anúncios

## 1. Entrega

Publicação, pausa, reativação e encerramento implementados no controller/serviço de anúncios
e nas páginas existentes do proprietário, sem mocks no fluxo funcional desta fase.
As operações persistem o novo estado e sua auditoria na mesma transação PostgreSQL.
Publicação e reativação usam a mesma política para revalidar aprovação, dados, CRLV e Storage.
Não foram implementados catálogo público, criação de reservas, pagamentos ou chat.
As páginas públicas demonstrativas anteriores não foram convertidas em catálogo real.

**Pré-requisito para usar as transições no banco local:** aplicar manualmente a migration B.2.
Ela foi somente preparada. Não foi executada, assim como nenhum deploy, commit ou push.
Nenhum `.env`, segredo, credencial ou serviço de produção foi alterado.

## 2. Inspeção real e decisões

Foram examinados schema, SQL anteriores, CRUD/DTOs/testes de anúncios, cadastro/desativação,
revisão administrativa, documentos, autenticação, transações, Storage e frontend existente.
O script `scripts/inspect-announcement-db.mjs` realizou uma transação **somente leitura**
em `univia_db` local, recusando hosts remotos e sem imprimir credenciais ou dados pessoais.

Resultado da inspeção em 01/11/2026:

- Nenhum veículo com mais de um anúncio corrente.
- Índice anterior `uq_anuncio_ativo_veiculo` garantia unicidade somente de `ATIVO`.
- Estados reais de reserva: `PENDENTE`, `CONFIRMADA`, `EM_ANDAMENTO`, `CONCLUIDA`, `CANCELADA`, `REJEITADA`.
- Não havia tabela de auditoria adequada para transições de anúncios. A auditoria B.1 refere-se
  a veículos/documentos; reutilizá-la misturaria entidades incompatíveis.
- `anuncio` já tinha os quatro estados, preços e datas necessários. Não foi inventado
  `atualizado_em`; a resposta mantém `criado_em` e o histórico registra cada transição.
- `bloqueio_disponibilidade` possui períodos vinculados ao anúncio. Seus registros são preservados;
  não foi adicionada lógica de calendário ou disponibilidade nesta fase.

Adotada a regra solicitada de **um anúncio corrente por veículo**, considerando
`RASCUNHO`, `ATIVO` e `PAUSADO`. Anúncios encerrados permanecem no histórico.
Isso substitui a permissão anterior de múltiplos rascunhos do mesmo veículo.

## 3. Arquivos criados

- `src/anuncios/publication-policy.service.ts`: política compartilhada de publicação/reativação.
- `src/anuncios/dto/history-query.dto.ts`: paginação limitada do histórico.
- `prisma/sql/20261101_anuncio_ciclo_vida.sql`: índice corrente, auditoria e proteção de reservas.
- `scripts/inspect-announcement-db.mjs`: inspeção local somente leitura, reutilizável antes da migration.
- `test/anuncio-lifecycle.test.mjs`: transições, regras, concorrência simulada, autorização e HTTP.
- `test/helpers/lifecycle-fixture.mjs`: persistência transacional simulada exclusiva dos testes.
- `../frontend/src/components/AnnouncementHistory.jsx`: consulta privada e paginada do histórico.
- `../frontend/test/anuncioLifecycle.test.jsx`: estados, ações, confirmações, erros, sessão e histórico.
- Este relatório.

## 4. Arquivos modificados

- `prisma/schema.prisma`: índice parcial corrente e modelo/relações de `historico_anuncio`.
- `src/anuncios/anuncios.service.ts`: transições, locks, validação, auditoria, unicidade e edição pausada.
- `src/anuncios/anuncios.controller.ts`: endpoints de transição e histórico.
- `src/anuncios/anuncios.module.ts`: política e reutilização de `StorageModule`.
- `src/veiculos/veiculos.service.ts`: edição e desativação usam o mesmo lock de veículo da B.1/B.2.
- `src/admin/vehicle-review.service.ts` e `src/veiculos/documentos/documentos.service.ts`: isolamento
  das mutações alinhado ao protocolo de locks, sem alterar requisitos de aprovação/reenvio.
- `test/anuncios.test.mjs`: testes existentes ajustados às novas regras deliberadas da B.2.
- `test/anuncios.postgres.test.mjs`: fluxo integrado B.1/B.2 optativo em PostgreSQL local dedicado.
- `test/veiculos.test.mjs`: fixture suporta o protocolo de lock.
- `../frontend/src/api/client.js`: tratamento opcional de códigos finitos de erro, sem exibir texto arbitrário do servidor.
- `../frontend/src/api/anuncios.js`: operações e mensagens seguras de bloqueio.
- `../frontend/src/pages/OwnerAnnouncement.jsx`: ações, confirmações, loading, erros e histórico.
- `../frontend/src/pages/MyAnnouncements.jsx`: nomes dos estados e acesso à edição de pausados.
- `../frontend/src/components/AnuncioForm.jsx`: controle de alterações não salvas e texto atualizado.
- `../frontend/src/services/anuncioValidation.js`: apresentação compartilhada dos quatro estados.
- `../frontend/src/components/MyVehicles.jsx` e `../frontend/src/pages/OwnerVehicle.jsx`: nomes consistentes
  e criação oferecida quando não existe anúncio corrente; o backend continua sendo a autoridade.
- `../frontend/src/index.css`: estilos usando os temas existentes e ações que quebram linha em telas menores.
- `../frontend/test/anuncios.test.jsx` e `../frontend/test/veiculos.test.jsx`: expectativas das regras e textos novos.

O Prisma Client foi regenerado localmente, sem alterar o banco. O build atualiza
`tsconfig.tsbuildinfo`. Alterações de fases anteriores já existentes no workspace foram preservadas.

## 5. Endpoints e contratos

Todos exigem JWT válido e propriedade derivada da sessão. ADMIN não ganha propriedade implícita.
Anúncio inexistente e anúncio alheio retornam 404, sem revelar existência.

| Método | Endpoint | Corpo |
|---|---|---|
| PATCH | `/api/anuncios/:id/publicar` | `{}` |
| PATCH | `/api/anuncios/:id/pausar` | `{}` |
| PATCH | `/api/anuncios/:id/reativar` | `{}` |
| PATCH | `/api/anuncios/:id/encerrar` | `{}` |
| GET | `/api/anuncios/meus/:id/historico?page=1&limit=20` | — |

Campos adicionais são rejeitados: não é permitido enviar `status`, `proprietario_id`,
veículo substituto ou status esperado arbitrário nos endpoints de transição.
O PATCH genérico continua limitado aos campos editáveis do anúncio.

Sucesso das transições: 200, `Cache-Control: no-store`, anúncio atualizado no contrato existente:

```json
{
  "id": "UUID",
  "veiculo_id": "UUID",
  "titulo": "Meu veículo",
  "descricao": null,
  "preco_diaria": "100.00",
  "valor_caucao": "0.00",
  "preco_seguro_dia": "0.00",
  "aceite_automatico": false,
  "status": "ATIVO",
  "criado_em": "data ISO",
  "veiculo": {
    "id": "UUID",
    "marca": "Marca",
    "modelo": "Modelo",
    "ano_modelo": 2023,
    "categoria": "Hatch",
    "status_cadastro": "APROVADO",
    "desativado_em": null
  }
}
```

Valores monetários permanecem strings com duas casas decimais. Nenhuma referência de Storage,
URL assinada ou dado de outro usuário é incluído nessa resposta.

Histórico: `{ items, total, page, limit }`. Cada item contém `id`, `status_anterior`,
`status_novo`, `operacao` e `criado_em`, ordenados por data/UUID decrescentes.
O usuário responsável é armazenado na auditoria; a projeção do proprietário não expõe dados internos adicionais.
Paginação usa os limites existentes do projeto (página até 100000, tamanho até 100).

Erros seguem a convenção existente: 400 para entrada inválida; 401 para sessão;
403 quando aplicável; 404 para inexistência/isolamento; 409 para estado, requisitos ou concorrência;
503 para Storage obrigatório ou tabela de auditoria ainda não configurada. Não foi introduzido 422.

Bloqueios funcionais retornam códigos estáveis, como `VEICULO_NAO_APROVADO`, `CRLV_INVALIDO`,
`FOTO_AUSENTE`, `ANUNCIO_CORRENTE`, `RESERVAS_PENDENTES` e `ESTADO_ALTERADO`.
O cliente traduz somente uma lista finita conhecida; mensagens arbitrárias do servidor
continuam ocultas. O fluxo existente de refresh/401 e token em memória permanece compartilhado.

## 6. Máquina de estados

| Origem | Ação | Destino |
|---|---|---|
| RASCUNHO | publicar | ATIVO |
| ATIVO | pausar | PAUSADO |
| PAUSADO | reativar | ATIVO |
| RASCUNHO | encerrar | ENCERRADO |
| ATIVO | encerrar | ENCERRADO |
| PAUSADO | encerrar | ENCERRADO |

Qualquer outra transição retorna 409. Repetir uma operação retorna 409 sem gerar outro evento.
ENCERRADO é terminal; uma nova publicação exige criar outro anúncio.
Na UI: Rascunho, Publicado, Pausado e Encerrado, sempre apresentados também em texto.

## 7. Publicação e reativação

Ambas usam `PublicationPolicyService` e exigem:

1. Propriedade autenticada e estado de origem correto.
2. Veículo aprovado e não desativado.
3. Dados mínimos do veículo válidos conforme `CreateVeiculoDto` existente: placa, marca,
   modelo, anos coerentes, categoria, câmbio, combustível e lugares. Não há requisito comercial novo.
4. Título de 1–150 caracteres, diária positiva e valores de caução/seguro não negativos,
   com precisão e limites já definidos pelo DTO/NUMERIC(12,2). Descrição continua opcional.
   Diária de 0,01 continua permitida; não foi criado preço mínimo comercial arbitrário.
5. CRLV **mais recente do tipo CRLV**, ordenado como B.1/B.1.3, aprovado, com validade informada
   e atual/futura. A expiração é temporal e não muda o status documental no banco.
6. CRLV presente e compatível no bucket privado, confirmado pelo `StorageService` existente.
7. Pelo menos uma fotografia com caminho compatível, hash de validação e objeto privado acessível,
   seguindo a B.1. Se uma foto estiver indisponível, outra válida pode atender ao requisito.
8. Ausência de outro anúncio corrente do mesmo veículo.

Na UI, alterações não salvas impedem publicar/reativar. Sucesso só aparece após resposta real.
Mensagens de bloqueio vêm de códigos da API; aprovação exibida no navegador não autoriza a operação.

## 8. Edição, pausa e encerramento

- RASCUNHO e PAUSADO permitem edição pelos DTOs existentes.
- ATIVO fica somente para consulta; é necessário pausar antes de editar.
- ENCERRADO é somente leitura.
- Nenhum formulário permite mudar status ou veículo do anúncio.
- Pausa preserva reservas, veículo, documentação, fotos, bloqueios de disponibilidade e dados financeiros.
- Encerramento é lógico e exige confirmação explícita na UI. Não apaga relações nem cancela reservas.
- Encerramento bloqueia reservas `PENDENTE`, `CONFIRMADA` e `EM_ANDAMENTO`.
  Apenas `CONCLUIDA`, `CANCELADA` e `REJEITADA` não bloqueiam. Estados desconhecidos são tratados
  conservadoramente como bloqueantes. Isso inclui obrigações antigas ainda não resolvidas.
- Valores e estado das reservas existentes não são reescritos ao editar um anúncio pausado.

Confirmações têm nome/descrição acessíveis, foco inicial, botão Cancelar e Escape para cancelar
antes de iniciar a operação. São diálogos inline, sem se apresentarem como modal com foco preso.
Controles de envio são desabilitados durante a operação e um ref impede duplo clique.
As páginas mantêm os estilos claro/escuro existentes.

## 9. Concorrência e consistência

Ordem de bloqueios: **veículo → anúncio**. Transições e edição usam ReadCommitted,
`FOR UPDATE`, comparação do estado lido e atualização condicional. A criação de rascunho
bloqueia o veículo e verifica anúncios correntes; o índice único parcial garante a regra no banco.
Edição/desativação do veículo passam a adquirir o mesmo lock usado por B.1/B.1.3.
As decisões administrativas já usam esse lock; suas regras de negócio não foram ampliadas.

O protocolo usa locks pessimistas para serializar escritores relacionados. ReadCommitted é
deliberado: cada leitura **depois de adquirir o lock** enxerga o que a operação anterior
confirmou enquanto a requisição aguardava. Um snapshot Serializable/RepeatableRead obtido
antes de esperar pelo lock poderia continuar mostrando uma foto/documento antigo quando
o escritor concorrente apenas alterasse a tabela filha, sem atualizar a linha do veículo.
As mutações B.1/B.1.3 foram alinhadas ao mesmo protocolo; consultas paginadas continuam com
seus snapshots RepeatableRead. A proteção não depende de todos os escritores usarem SSI.

Operações remotas de Storage acontecem **fora** da transação de mutação:

1. Autorização e leitura consistente dos requisitos.
2. Verificação dos objetos privados.
3. Transação curta com locks, revalidação dos dados/status/validade e comparação das
   referências documentais e hashes/caminhos de fotos com os que foram verificados.
4. Mudança de estado e auditoria atômicas.

Mudança de documento/foto durante a verificação provoca 409. A transação de mutação tem
timeout de 15 segundos e espera de aquisição de 5 segundos. Conflitos de serialização,
deadlocks, unicidade e expiração transacional são traduzidos para 409, sem retry cego
que pudesse duplicar uma ação. Chamadas Storage usam os timeouts existentes; publicação
e reativação têm prazo maior no cliente para essa verificação. Pausar/encerrar não consultam Storage.

A migration adiciona um trigger de reservas que compartilha a ordem veículo → anúncio.
Novas obrigações não terminais exigem anúncio ATIVO. Se uma reserva entra primeiro, o
encerramento a encontra e bloqueia; se o encerramento vence, a nova obrigação é recusada.
O trigger também cobre mudança de anúncio e reabertura de reserva terminal. Ele não impede
o processamento de uma reserva já existente apenas porque o anúncio foi pausado.
Isso prepara a integridade do banco; **não cria endpoints de reserva**.

O teste unitário de corridas usa persistência transacional simulada. Corridas reais entre
conexões PostgreSQL e o trigger devem ser validadas após aplicação manual da migration.

Limite inevitável: PostgreSQL e Storage não têm uma transação comum. Um objeto pode ser removido
externamente depois de verificado, mesmo após o commit. A B.2 verifica na publicação/reativação,
mas não implementa monitoramento contínuo, retirada automática de anúncios por expiração ou
bloqueio de futuras operações de Storage. A fase de catálogo/contratação deverá revalidar
elegibilidade e disponibilidade ao apresentar/contratar um anúncio.

## 10. Auditoria e migration

`historico_anuncio` registra anúncio, usuário responsável, estado anterior/novo, operação,
UUID e data/hora. A inserção ocorre na mesma transação da transição. Falha na auditoria
desfaz o status. Encerramento preserva histórico. Eventos anteriores à B.2 não são inventados
nem retroativamente preenchidos. Criação inicial do rascunho não é uma transição entre estados.

Arquivo SQL: `prisma/sql/20261101_anuncio_ciclo_vida.sql`.

- Bloqueia escrita na tabela durante a verificação de duplicatas/índice.
- Aborta a transação se detectar mais de um anúncio corrente por veículo.
- Cria `uq_anuncio_corrente_veiculo`, depois remove o índice antigo apenas de ATIVO.
- Cria histórico com FKs sem cascata e CHECK da máquina de estados/operações.
- Protege histórico contra UPDATE/DELETE/TRUNCATE e habilita RLS sem liberar anon/authenticated.
- Cria o trigger de integridade de reservas descrito acima.

Aplicação **manual e local**, pelo operador:

1. Fazer backup local adequado e confirmar explicitamente banco `univia_db` e host local.
2. No diretório backend, executar `node scripts/inspect-announcement-db.mjs` e revisar o resultado.
3. Havendo duplicatas, parar. Decidir manualmente quais anúncios devem continuar correntes;
   não executar correção ou exclusão automática. A inspeção deve ser repetida antes da aplicação.
4. Revisar o SQL e aplicar uma vez usando conexão explicitamente local. Exemplo sem senha na linha:

   ```powershell
   psql -h localhost -U <usuario_local> -d univia_db -W -v ON_ERROR_STOP=1 -f prisma/sql/20261101_anuncio_ciclo_vida.sql
   ```

5. O script é intencionalmente de aplicação única: divergências de schema geram falha/rollback.
   Não substituir isso por `db push`, reset ou aplicação em produção.
6. Executar `npm run prisma:generate` e `npm run build`, reiniciar o backend e validar.
7. Confirmar índice, tabela e triggers. Se a tabela de auditoria estiver ausente, uma transição
   falha sem confirmar a mudança de estado; não contornar o registro de auditoria.

Não há variável de ambiente obrigatória nova para a aplicação B.2. Banco, Storage e autenticação
reutilizam configurações existentes. Nenhuma configuração produtiva foi inspecionada ou modificada.

## 11. Testes e evidências

Resultados automatizados desta entrega:

- Backend `npm test`: 120 testes, 114 aprovados, 6 integrações optativas ignoradas, zero falhas.
- Frontend `npm test`: 123 testes aprovados em 11 arquivos, zero falhas.
- Backend e frontend `npm run build`: aprovados.
- Frontend `npm run lint`: concluído sem erros, com avisos já existentes nas páginas/estrutura anterior.
- Teste HTTP do CRUD contra `dist` com `ANUNCIOS_TEST_COMPILED=1`: 9 testes aprovados.
- `npm run prisma:generate`: aprovado; somente geração local do cliente.
- `git diff --check`: sem erros de whitespace.
- Inspeção local somente leitura: executada, sem duplicatas correntes.

Os testes novos cobrem matriz completa de transições inválidas, ciclo válido, requisitos para
publicar/reativar, CRLV ausente/pendente/vencido/mais recente, fotos e Storage, campos inválidos,
propriedade/ADMIN, corpos protegidos, repetição, reservas bloqueantes/terminais, edição pausada,
unicidade, corridas simuladas, rechecagem após Storage, rollback de auditoria e conflitos PostgreSQL.
As suítes anteriores B.0/B.1/B.1.3 continuam executadas. Expectativas deliberadamente alteradas:
múltiplos rascunhos deixam de ser permitidos; repetição de encerramento vira 409; pausados tornam-se editáveis.

Frontend cobre os quatro estados e ações corretas, confirmação/cancelamento/Escape, duplo clique,
loading, sucesso real, rejeição por requisitos, autorização/sessão, falha de Storage, histórico,
atualização após transição e proteção de alterações não salvas. As demais suítes continuam passando.

Integração PostgreSQL preparada em `test/anuncios.postgres.test.mjs`: exige
`RUN_ANNOUNCEMENT_INTEGRATION=1` e `TEST_DATABASE_URL` para um banco **local dedicado**,
diferente de `DATABASE_URL`, com migrations aplicadas manualmente pelo operador.
Executar `node --import tsx --test test/anuncios.postgres.test.mjs`.
O teste usa transação com rollback de todas as fixtures, aprova documento/veículo pelos serviços
B.1, executa o ciclo B.2 e valida auditoria e obrigações. Apenas o Storage é simulado.
Não executa migrations. Não foi habilitado nesta entrega.

Não foi validado o fluxo completo com Storage real, nem inspecionada visualmente a interface
em dispositivos/navegadores. Esses passos permanecem no roteiro abaixo. Não houve teste destrutivo
em dados reais nem uso de documentos pessoais.

## 12. Pendências de negócio

- Renovação de CRLV de veículo aprovado continua bloqueada conforme B.1.3; documento vencido
  impede publicação/reativação até existir um fluxo formal de renovação. A B.2 não altera a aprovação.
- A B.1 atual também não permite reabrir veículo APROVADO. A B.2 revalida a aprovação caso
  ela mude por um fluxo futuro autorizado, sem introduzir poderes administrativos novos.
- Fiscalização contínua de anúncios já ativos, expiração documental e impacto sobre reservas
  precisam de política nas próximas fases; não há retirada/cancelamento automático nesta entrega.
- Futuro serviço de reservas deverá adotar o mesmo protocolo de locks e tratar conflitos do trigger,
  além de validar elegibilidade e condições comerciais no momento da contratação.

## 13. Roteiro manual local

1. Aplicar manualmente a migration local após revisar a inspeção acima. Confirmar configurações
   exclusivamente de desenvolvimento. Não usar Supabase PostgreSQL/Storage de produção nos testes.
2. Iniciar backend e frontend locais. Entrar com proprietário sintético e outra conta comum de teste.
3. Cadastrar veículo e enviar CRLV sintético pela B.1.3. Adicionar uma foto válida pelo fluxo existente.
4. Criar rascunho antes da aprovação. Tentar publicar: esperar bloqueio, sem evento de publicação.
5. No ADMIN local, abrir o CRLV privado, aprovar com validade conferida e aprovar o veículo pela B.1.
6. Voltar ao anúncio, atualizar dados e conferir título/preços. Testar edição, salvamento e bloqueio
   de publicação enquanto houver alterações não salvas.
7. Confirmar “Publicar anúncio”. Aguardar resposta. Conferir “Publicado”, persistência ATIVO e
   evento PUBLICAR no banco/histórico, sem nova reserva ou outro anúncio criado automaticamente.
8. Repetir a publicação pela API: esperar 409 e o mesmo número de eventos.
9. Tentar editar o ativo pelo PATCH genérico e alterar `status` diretamente: esperar 409 e 400, respectivamente.
10. Confirmar pausa. Conferir PAUSADO, evento PAUSAR, veículo ainda aprovado e dados preservados.
11. Editar o pausado e salvar. Confirmar reativação; conferir ATIVO e evento REATIVAR.
12. Em fixtures locais autorizadas, testar reativação com CRLV vencido, foto indisponível e veículo
    desativado. Esperar bloqueio seguro; não alterar status/documentos produtivos para esses cenários.
13. Abrir confirmação de encerramento, cancelar com botão e Escape; conferir ausência de alteração.
14. Confirmar encerramento. Conferir ENCERRADO e evento ENCERRAR, preservando relações.
15. Tentar reativar/editar/encerrar novamente o encerrado: esperar 409. Criar um novo rascunho para
    o mesmo veículo; conferir preservação do anúncio antigo e rejeição de um segundo corrente.
16. Com a outra conta (inclusive ADMIN sem propriedade), tentar todas as transições e histórico:
    esperar 404. Sem JWT, esperar 401. Não enviar credenciais/URLs privadas a logs.
17. Em banco de testes dedicado e pré-migrado, executar o teste PostgreSQL optativo para obrigações
    de reserva, preservação e auditoria. Não criar reservas reais para esse teste.
18. Validar corridas em duas conexões no banco dedicado: publicar/publicar, pausar/encerrar,
    publicar/desativar e encerrar/aquisição de reserva. Confirmar estado final consistente e eventos únicos.
19. Conferir desktop/mobile, temas claro/escuro, teclado, foco/cancelamento, textos de status,
    mensagens de erro, paginação e histórico. Ações devem quebrar linha e manter labels legíveis.

Consultas somente leitura para conferência, substituindo os IDs por fixtures autorizadas:

```sql
SELECT id, veiculo_id, status FROM public.anuncio WHERE id = '<anuncio_uuid>';
SELECT anuncio_id, status_anterior, status_novo, usuario_id, operacao, criado_em
FROM public.historico_anuncio WHERE anuncio_id = '<anuncio_uuid>' ORDER BY criado_em, id;
SELECT id, status_cadastro, desativado_em FROM public.veiculo WHERE id = '<veiculo_uuid>';
SELECT veiculo_id, count(*) FROM public.anuncio
WHERE status IN ('RASCUNHO','ATIVO','PAUSADO') GROUP BY veiculo_id HAVING count(*) > 1;
```

A última consulta deve retornar zero linhas. A próxima fase não foi iniciada.
