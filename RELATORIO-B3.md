# UniVia — Fase B.3: catálogo público

## 1. Resumo funcional

A Home agora consulta anúncios reais por API. Visitantes podem pesquisar, filtrar, ordenar, paginar e abrir detalhes com galeria, ficha do veículo e valores decimais formatados. As duas páginas foram integradas às rotas existentes do HashRouter: `/#/` e `/#/veiculo/:id` (o ID desta última é o do anúncio). O retorno ao catálogo preserva os filtros na URL.

Há estados de carregamento, erro com nova tentativa, lista vazia, anúncio indisponível e fotografia indisponível. Reservas estão explicitamente indisponíveis, com botão desabilitado e sem chamada de reserva ou checkout nessas telas. O painel demonstrativo anterior permanece separado.

O repositório já tinha alterações das fases anteriores, inclusive arquivos não versionados. Elas foram preservadas. Nenhum commit, push ou deploy foi realizado.

## 2. Arquivos desta fase

### Criados

- `backend/src/catalogo/catalogo-query.dto.ts`: validação e limites dos filtros.
- `backend/src/catalogo/public-eligibility.ts`: predicado SQL parametrizado de leitura pública.
- `backend/src/catalogo/catalogo.service.ts`: consultas, paginação, projeção pública e fotografias.
- `backend/src/catalogo/catalogo.controller.ts`: endpoints públicos.
- `backend/src/catalogo/catalogo.module.ts`: integração NestJS.
- `backend/src/anuncios/publication-rules.ts`: regras auxiliares compartilhadas com B.2.
- `backend/test/catalogo.test.mjs`: oito testes de serviço, HTTP, privacidade, Storage e rota legada.
- `backend/test/catalogo.postgres.test.mjs`: integração optativa com PostgreSQL local e rollback obrigatório.
- `frontend/src/api/catalogo.js`: cliente da API pública.
- `frontend/src/services/useCatalogoResource.js`: carregamento, atualização e descarte de respostas obsoletas.
- `frontend/src/components/CatalogoUi.jsx`: apresentação de fotografias e erros.
- `frontend/test/catalogo.test.jsx`: oito testes da interface/API.
- `backend/catalogo-test-results.txt` e `frontend/catalogo-test-results.txt`: saídas das suítes completas finais.
- `RELATORIO-B3.md`: este relatório.

### Modificados

- `backend/src/app.module.ts`: registro do catálogo.
- `backend/src/setup-app.ts`: `no-store` também para respostas do catálogo, incluindo erros.
- `backend/src/anuncios/publication-policy.service.ts`: reutilização dos auxiliares de data UTC e foto validada, preservando as verificações de publicação.
- `backend/src/veiculos/fotos/storage.service.ts`: assinatura pública condicionada pelo serviço de catálogo, em bucket privado e com TTL fixo de 60 segundos.
- `backend/src/veiculos/veiculos.service.ts`: rota pública legada passa a usar a mesma elegibilidade da B.3, preservando seu contrato de ID de veículo.
- `backend/src/veiculos/veiculos.controller.ts`: `no-store` na resposta pública legada.
- `frontend/src/pages/Home.jsx` e `frontend/src/pages/VehicleDetail.jsx`: substituição das telas demonstrativas pelas consultas reais.
- `frontend/src/App.jsx`: atualização do aviso sobre módulos reais e demonstrativos.
- `frontend/src/components/ui.jsx`: rodapé informa o catálogo real e a indisponibilidade de contratação.
- `frontend/src/api/config.js`: comentário distingue catálogo real de serviços legados demonstrativos.
- `frontend/src/index.css`: estilos do catálogo, galeria e adaptação a telas menores, usando os tokens existentes.
- `backend/tsconfig.tsbuildinfo`: atualizado pelo build incremental; já estava modificado antes desta execução.

Não foram modificados schema, migrations, dependências ou arquivos `.env` nesta fase.

## 3. Endpoints e contratos

Sem autenticação obrigatória:

```http
GET /api/catalogo/anuncios?q=Toyota&categoria=Hatch&cambio=Manual&combustivel=Flex&preco_min=100.00&preco_max=250.99&ordem=menor_preco&page=1&limit=12
GET /api/catalogo/anuncios/:id
```

Exemplo ilustrativo do contrato de listagem, com identificador substituível:

```json
{
  "items": [{
    "id": "UUID_DO_ANUNCIO",
    "titulo": "Título cadastrado",
    "preco_diaria": "150.99",
    "valor_caucao": "1000.00",
    "preco_seguro_dia": "20.10",
    "criado_em": "2026-11-01T12:00:00.000Z",
    "veiculo": {
      "marca": "Toyota",
      "modelo": "Yaris",
      "ano_fabricacao": 2022,
      "ano_modelo": 2023,
      "categoria": "Hatch",
      "cambio": "Manual",
      "combustivel": "Flex",
      "quantidade_lugares": 5
    },
    "fotos": []
  }],
  "total": 1,
  "page": 1,
  "limit": 12,
  "pages": 1
}
```

O detalhe retorna o objeto do anúncio, acrescentando `descricao`, com até dez fotos. Cada foto disponível contém apenas `id`, `descricao`, `url` assinada e `expira_em` ISO. Na listagem há no máximo uma capa por anúncio. `fotos: []` é uma resposta válida quando a apresentação das imagens está indisponível.

Valores monetários são strings decimais com duas casas, sem conversão para ponto flutuante. A interface formata esses valores diretamente como reais.

Lista vazia: `items: []`, `total: 0`, `pages: 0`; a interface apresenta pelo menos uma página visual. Página além do resultado: itens vazios, mantendo o total real. Filtros inválidos retornam 400. Detalhes inexistentes, inelegíveis ou com ID inválido retornam 404 com mensagem genérica.

A rota anterior `GET /api/veiculos/:id` continua recebendo ID de veículo e mantendo sua projeção anterior, agora condicionada ao mesmo predicado de elegibilidade pública.

## 4. Filtros efetivamente disponíveis

| Parâmetro | Comportamento e limite |
| --- | --- |
| `q` | Substring em marca, modelo ou título; até 100 caracteres; ignora caixa, sem prometer equivalência de acentos. `%`, `_` e barra invertida são tratados literalmente. |
| `categoria` | Igualdade sem diferenciar caixa; até 50 caracteres. |
| `cambio` | Igualdade sem diferenciar caixa; até 30 caracteres. |
| `combustivel` | Igualdade sem diferenciar caixa; até 30 caracteres. |
| `preco_min`, `preco_max` | Valores inclusivos, não negativos, até dez dígitos inteiros e duas casas decimais, usando ponto; mínimo não pode superar máximo. |
| `ordem` | Somente `recentes` (padrão), `menor_preco`, `maior_preco`; desempate determinístico por ID. |
| `page` | Inteiro de 1 a 10000; padrão 1. |
| `limit` | Inteiro de 1 a 24; padrão 12. |

Campos desconhecidos, arrays/repetições incompatíveis, textos em branco, preços exponenciais e entradas acima dos limites são rejeitados. Não há enum de categoria, câmbio ou combustível no schema: os filtros são textos limitados com igualdade no banco; a interface explica que se deve usar o valor cadastrado.

Cidade e UF não existem no modelo de veículo. Esses filtros não foram inventados. Uma futura ampliação precisará definir localização pública aproximada e privacidade antes de adicionar campos, índices e migration.

Pesquisa, filtros, contagem, ordenação e paginação acontecem no backend. Os valores são parâmetros de `Prisma.sql`; a ordenação vem de lista fechada. O navegador recebe somente a página solicitada.

## 5. Política de elegibilidade pública

Todas as leituras exigem simultaneamente:

1. Anúncio `ATIVO`.
2. Veículo `APROVADO` e `desativado_em IS NULL`.
3. CRLV mais recente por `criado_em DESC, id DESC`, aprovado e com validade não nula até pelo menos a data UTC atual, inclusive. Um CRLV novo pendente invalida a leitura mesmo se existir um anterior aprovado.
4. Pelo menos uma referência fotográfica validada, com hash SHA-256 e caminho de imagem compatível dentro do veículo correto.

Listagem e detalhe usam o mesmo predicado; o detalhe o executa novamente a cada requisição. Consulta de IDs, contagem e projeção usam transação `RepeatableRead`, evitando inconsistência entre as leituras do mesmo snapshot. A relação Prisma de anúncio corrente é parcialmente única; por isso o SQL consulta `anuncio` diretamente em vez de depender de uma relação singular com histórico encerrado.

As regras auxiliares de foto validada e data UTC são compartilhadas com B.2. A publicação mantém sua validação completa de DTOs, documentos, disponibilidade física no Storage e rechecagem do estado. A leitura depende do estado já validado no banco e não faz verificações remotas de CRLV a cada busca. Falhas de Storage fotográfico produzem apresentação alternativa; não equivalem a aprovação documental nem mudam status.

Mudanças posteriores na aprovação, desativação, CRLV, remoção de todas as fotos validadas ou status do anúncio retiram-no das leituras seguintes. Documentos vencidos não são publicados automaticamente nem recebem alteração automática de status. Dados de identidade de veículos aprovados já são protegidos contra edição pelo fluxo anterior.

Projeções explícitas excluem placa, proprietário, CPF, contatos, credenciais, auditorias, revisões, documentos e referências privadas brutas. A resposta é montada campo a campo, mesmo depois da projeção Prisma.

## 6. Fotografias privadas, custo e cache

- Os buckets permanecem privados; não houve alterações de políticas ou configuração do Supabase.
- O backend verifica que o bucket de fotos é privado antes de emitir URLs públicas temporárias.
- Assinatura em lote com TTL fixo de 60 segundos, independente do TTL privado usado pelo proprietário.
- No máximo 24 capas assinadas por página ou dez fotos por detalhe. Não há consulta de anúncio/foto individual para cada card nem verificação remota de cada documento durante a pesquisa.
- A consulta seleciona até dez metadados de fotos por veículo e faz a assinatura somente da capa na lista.
- Erros individuais de assinatura preservam as fotos boas; indisponibilidade geral retorna fotos vazias sem expor mensagens do provedor. Uma imagem que falhe no navegador é substituída por texto alternativo.
- URLs assinadas contêm a referência técnica necessária ao acesso à própria imagem; o campo bruto `arquivo_url`, hashes e IDs do proprietário/veículo não são retornados no contrato do catálogo. Nenhum documento é assinado pelo catálogo.
- A chave secreta continua exclusivamente no backend. Imagens são carregadas via HTTPS do Storage, sem dependência de disco local no Render/Vercel.
- Respostas do catálogo usam `Cache-Control: no-store`; o cliente também solicita `cache: no-store`.
- A tela reconsulta a cada 45 segundos e ao recuperar foco/visibilidade. Oculta dados antigos enquanto revalida e ignora respostas de consultas anteriores.
- Uma URL já emitida pode ser reutilizada até o vencimento, inclusive após pausa/encerramento. Não há revogação imediata de URLs nem remoção de imagens já baixadas. A política limita esse acesso a 60 segundos após a assinatura; a próxima consulta de detalhe revalida o anúncio.

## 7. Testes executados e resultados reais

| Execução | Resultado |
| --- | --- |
| Backend `npm test`, antes da B.3 | 114 aprovados, 6 ignorados, 0 falhas. |
| Frontend `npm test`, antes dos novos testes | 123 aprovados, 0 falhas. |
| Backend `npm test`, final | **122 aprovados, 7 ignorados, 0 falhas**; 129 testes no total. Saída em `backend/catalogo-test-results.txt`. |
| Frontend `npm test`, final | **131 aprovados, 12 arquivos, 0 falhas**. Saída em `frontend/catalogo-test-results.txt`. |
| Backend `npm run build`, final | Aprovado. |
| Frontend `npm run build`, final | Aprovado, 73 módulos transformados. |
| Frontend `npm run lint` | Exit code 0, com avisos nos módulos anteriores; sem avisos nos arquivos novos do catálogo após correção. |
| `git diff --check` nos arquivos modificados da fase | Sem erros de whitespace; somente avisos de normalização LF/CRLF do Git. |
| `RUN_CATALOGO_SQL_TEST=1`, integração SQL | **Não aprovada: interrompida pela proteção de identidade local antes de criar fixtures.** |

Os oito testes novos de backend verificam contratos HTTP sem autenticação, filtros/limites inválidos, parametrização, ordenação/paginação, whitelist, precisão decimal, exclusão de referências fotográficas impróprias, falhas de Storage, TTL, bucket privado e alinhamento da rota legada. Usam persistência isolada e Storage simulado; não comprovam a execução do predicado no PostgreSQL real.

Os oito testes novos de frontend verificam uso do cliente HTTP real com `fetch` substituído no teste, ausência de Bearer, cards, busca/filtros, paginação, navegação de volta, galeria, preços, erro/vazio/carregamento, 404, imagens quebradas/vencidas, revalidação por foco, descarte de resposta antiga e reserva desabilitada. Os componentes de produção não usam essas fixtures.

O teste SQL optativo foi criado para verificar estados ATIVO/RASCUNHO/PAUSADO/ENCERRADO, aprovação/desativação, CRLV vencido/nulo/pendente/mais recente, validade no dia UTC, fotos inválidas, filtros, ordem e paginação com Prisma/PostgreSQL real. Ele usa somente fixtures novas e exige rollback integral.

A execução optativa detectou URL de loopback, nome/porta compatíveis e instância primária, mas `inet_server_addr()` e `inet_client_addr()` não eram loopback. A proteção existente em `backend/scripts/admin-test-safety.mjs` impediu prosseguir. Somente a consulta de identidade ocorreu; nenhuma fixture ou alteração de registro foi executada. Não se afrouxou essa proteção. Essa execução teve uma falha de segurança ambiental reportada, separada das suítes padrão aprovadas; não há evidência de aprovação da integração SQL.

## 8. Banco de dados e migrations

Nenhuma migration é necessária para B.3: foram reutilizados schema e índices existentes, incluindo `idx_anuncio_status_preco` e os índices de documentos/fotos. Nenhum SQL de migration foi aplicado, e não se executou `db push`, reset ou comando de alteração de registros existentes.

As migrations manuais das fases anteriores continuam sendo pré-requisitos operacionais. Antes de qualquer deploy, deve-se conferir que já foram aplicadas pelo procedimento próprio, sem executá-las automaticamente por causa do catálogo.

## 9. Limitações e riscos

- Integração com PostgreSQL real segue pendente por bloqueio de identidade local. Não considerar a fase validada de ponta a ponta antes de executar esse teste em ambiente local comprovado.
- Supabase real não foi acessado para assinar fotos nesta validação; o comportamento de integração e as permissões da chave devem ser conferidos no ambiente autorizado.
- O layout tem CSS responsivo e usa os temas existentes. Não houve inspeção visual em navegador desktop/mobile nesta execução; testes de componentes em jsdom não comprovam layout visual.
- Busca `ILIKE` em substrings e contagem com elegibilidade documental podem custar mais em grandes volumes. Medir planos e latência antes de propor índices adicionais; nenhuma migration especulativa foi criada.
- Fotos removidas diretamente no Storage, mantendo metadados no banco, podem deixar o anúncio listado com apresentação alternativa. Documentos físicos não são reinspecionados pelo catálogo; problemas externos precisam de revisão pelo fluxo administrativo existente.
- URLs assinadas já emitidas têm a janela residual de até 60 segundos descrita acima. A tela pode estar carregada enquanto o estado muda; nova consulta sempre usa o estado atual disponível ao snapshot.
- O painel e checkout demonstrativos existentes continuam acessíveis em suas rotas anteriores. O catálogo não os chama nem oferece contratação funcional.

## 10. Validação local

1. Usar um PostgreSQL local comprovado, com o schema anterior já preparado pelo procedimento manual autorizado. Não apontar os testes optativos para túnel de produção.
2. Em `backend`, executar `npm run build` e `npm test`.
3. Para a integração SQL, em uma sessão PowerShell dedicada, com a configuração local existente e verificada:

   ```powershell
   $env:RUN_CATALOGO_SQL_TEST = '1'
   node --import tsx --test test/catalogo.postgres.test.mjs
   Remove-Item Env:RUN_CATALOGO_SQL_TEST
   ```

   O teste exige identidade local direta, não aplica migrations e reverte as fixtures. Se a proteção falhar, corrigir a configuração do ambiente de teste em vez de retirar a validação.

4. Em `frontend`, executar `npm test`, `npm run lint` e `npm run build`.
5. Iniciar o backend com `npm run start:dev` e o frontend com `npm run dev`, usando a configuração local autorizada existente. B.3 não exige novas variáveis.
6. Sem login, abrir a Home. Conferir carregamento, anúncios reais, imagens, busca por marca/modelo/título, categoria/câmbio/combustível, limites de preço e as três ordenações. Usar valores realmente cadastrados.
7. Conferir `GET /api/catalogo/anuncios?limit=25` (400), página além do total (lista vazia), ID inexistente/inválido (404) e `Cache-Control: no-store`.
8. Abrir detalhes: verificar ficha, descrição, valores, galeria e botão de reserva desabilitado. Voltar e conferir preservação dos filtros.
9. Com fixtures locais autorizadas, pausar/encerrar pelo fluxo B.2 e reabrir detalhes; esperar 404. Conferir exclusão por CRLV vencido e veículo inelegível. Nunca editar registros de produção para esse teste.
10. Conferir rede e JSON: sem CRLV, placa, CPF, contatos, tokens de autenticação ou referências privadas brutas. A assinatura da foto deve vencer em aproximadamente 60 segundos.
11. Simular falha de rede/Storage no ambiente de teste e verificar mensagens seguras, nova tentativa e apresentação alternativa de imagem. Conferir atualização após foco e 45 segundos.
12. Conferir manualmente larguras de 360, 768 e 1440 px, temas claro/escuro, navegação por teclado e galerias com dez imagens, títulos longos e fotos indisponíveis.

## 11. Preparação para Render e Vercel — sem deploy nesta execução

- [x] Builds locais aprovados.
- [x] Nenhuma migration nova ou dependência adicional para B.3.
- [x] HashRouter preservado; deep links usam `/#/veiculo/UUID_DO_ANUNCIO`.
- [x] Sem escrita de arquivo de imagem em disco efêmero.
- [x] Segredos exclusivos do backend e contratos públicos explícitos.
- [ ] Resolver a identificação do PostgreSQL de teste e aprovar a integração SQL real.
- [ ] Validar Supabase real e visualmente o frontend em ambiente autorizado.
- [ ] Render: conferir build/start existentes, client Prisma gerado e migrations anteriores aplicadas manualmente conforme seus relatórios.
- [ ] Render: conferir as variáveis já existentes para banco, autenticação, CORS e Supabase, sem expor valores em logs. O catálogo não demanda novos secrets.
- [ ] Supabase: confirmar manualmente que o bucket de fotos permanece privado e que a chave backend pode consultar sua privacidade e criar assinaturas. Não tornar público nem mudar políticas automaticamente.
- [ ] Vercel: conferir configuração existente de build `npm run build`, saída `dist` e `VITE_API_URL` apontando para a API HTTPS com `/api`. Não houve alteração de URL nesta execução.
- [ ] CORS: confirmar que a origem Vercel autorizada já está permitida no backend e que a configuração de sessão anterior continua válida.
- [ ] CSP, se configurada externamente: permitir imagens HTTPS do projeto Supabase em `img-src` e API em `connect-src`, preservando as demais restrições.
- [ ] CDN/proxies: respeitar `Cache-Control: no-store` em `/api/catalogo/*` e não forçar cache público dessas respostas.
- [ ] Após eventual deploy autorizado: validar visitante sem sessão, fotos após 60 segundos/foco, filtros, paginação, 404 após pausa e ausência de contratação no catálogo.

Deploy, alterações de secrets, políticas de Storage e URLs de produção permanecem não executados.
