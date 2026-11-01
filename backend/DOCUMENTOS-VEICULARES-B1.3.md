# UniVia — Fase B.1.3: documentos veiculares

> Atualização na B.2: as mutações documentais passaram a ReadCommitted com o mesmo
> bloqueio pessimista de veículo, para ler estado atualizado após esperar pelo lock.
> A descrição histórica de Serializable abaixo corresponde à entrega original B.1.3.
> Consulte `ANUNCIOS-B2.md` para o protocolo atual de concorrência.

## Implementação e compatibilidade

O proprietário envia um CRLV real via API autenticada; o backend valida o conteúdo,
armazena no Supabase privado e insere `documento_veiculo` como `PENDENTE`.
A página `OwnerVehicle` mostra o último CRLV, data de envio, validade, estado,
motivo da rejeição e ações autorizadas. Consulta e envio usam o cliente HTTP,
token em memória e renovação por cookie existentes. Não há mocks na aplicação.

O painel B.1 já consulta a mesma tabela e abre o documento pelo mesmo StorageService.
Foram preservados `VehicleReviewService`, histórico e todos os requisitos de aprovação
do veículo. Apenas a mensagem administrativa de documento ausente foi atualizada.
Anúncios, reservas e status do veículo não são alterados pelo upload.

## Arquivos desta fase

Criados:

- `src/veiculos/documentos/document.config.ts`: limite configurável.
- `src/veiculos/documentos/validate-document.ts`: validação de PDF e imagens.
- `src/veiculos/documentos/documentos.service.ts`: autorização, regras, persistência e compensação.
- `src/veiculos/documentos/documentos.controller.ts`: endpoints autenticados e multipart limitado.
- `test/documentos.test.mjs`: testes de validação, serviço, HTTP e integração com os serviços B.1.
- `test/documentos.postgres.test.mjs`: teste optativo em banco dedicado, com rollback.
- `../frontend/src/api/documentosVeiculos.js`: cliente documental.
- `../frontend/src/components/VehicleDocuments.jsx`: interface do proprietário.
- `../frontend/test/documentosVeiculos.test.jsx`: testes de interface e erros.
- Este relatório.

Modificados:

- `package.json` e `package-lock.json`: dependência `pdf-lib`.
- `src/auth/auth.module.ts`: exportação do guard/módulo de throttling existentes.
- `src/veiculos/veiculos.module.ts`: registro do serviço, configuração e controller.
- `src/veiculos/fotos/storage.service.ts`: upload e remoção no bucket documental.
- `../frontend/src/pages/OwnerVehicle.jsx`: seção documental.
- `../frontend/src/pages/AdminVehicleReview.jsx`: mensagem de documento ausente.
- `../frontend/src/index.css`: estilos responsivos usando variáveis dos temas existentes.

O workspace já continha alterações B.0/B.1 antes desta fase; elas foram preservadas.
O build também atualiza `tsconfig.tsbuildinfo`.

## Endpoints e contratos

Todos os endpoints exigem `Authorization: Bearer <access token>` e retornam
`Cache-Control: no-store`. IDs devem ser UUIDs. ADMIN mantém os endpoints administrativos.

| Método | Endpoint | Resultado |
|---|---|---|
| GET | `/api/veiculos/:id/documentos` | 200: último CRLV e permissão de envio |
| POST | `/api/veiculos/:id/documentos/crlv` | 201: estado documental após persistência |
| GET | `/api/veiculos/:id/documentos/:documentoId/arquivo` | 200: URL assinada temporária |

O POST aceita `multipart/form-data` com exatamente um arquivo no campo `arquivo`.
Não aceita campos adicionais, UUID, proprietário, status, caminho ou validade enviados pelo cliente.

GET documental e POST retornam:

```json
{
  "documento": {
    "id": "UUID",
    "tipo": "CRLV",
    "status_validacao": "PENDENTE",
    "criado_em": "data ISO",
    "validade_ate": null,
    "motivo_rejeicao": null
  },
  "pode_enviar": false,
  "bloqueio": "Aguarde a análise do CRLV atual. Reenvio disponível após rejeição ou expiração.",
  "limite_bytes": 10485760
}
```

Sem CRLV, `documento` é `null`. Se o envio é permitido, `bloqueio` é `null`.
CRLV aprovado com validade vencida é apresentado como `EXPIRADO`, sem mudar
silenciosamente seu registro ou histórico no banco.

O endpoint de arquivo retorna `{ "url": "URL assinada", "expira_em": "data ISO" }`.
Não há URL pública, caminho interno ou credencial nas respostas documentais.
Documentos anteriores continuam consultáveis por seus IDs, sempre com autorização.
A lista do proprietário apresenta somente o último CRLV; o histórico completo continua no ADMIN.

Erros: 400 para entrada/conteúdo inválido; 401 para sessão ausente/inválida;
404 para veículo/documento inexistente ou de outro proprietário, sem revelar existência;
409 para estado incompatível ou concorrência; 413 para tamanho excedido;
429 para throttling; 503 para armazenamento indisponível, bucket ausente/público
ou referência incompatível. O frontend também distingue 403 quando retornado pela API.

## Regras de envio e reenvio

- Envio inicial permitido para veículo ativo em `PENDENTE`, `EM_ANALISE` ou `REJEITADO`.
- Reenvio somente após rejeição ou expiração do último CRLV.
- `PENDENTE`/`EM_ANALISE` bloqueiam substituições que contornariam a revisão.
- `APROVADO` dentro da validade bloqueia substituição nesta fase.
- Veículo aprovado ou desativado não aceita envio, inclusive se seu CRLV vencer.
- Renovação de veículo aprovado permanece uma pendência de negócio: exige fluxo formal
  de revisão/auditoria compatível com anúncios e reservas.
- Cada envio gera novo UUID no backend e inicia `PENDENTE`. Registros e decisões
  anteriores permanecem preservados; a aprovação antiga não aprova o novo documento.
- A ordenação é a mesma da B.1: `criado_em DESC, id DESC`. O novo envio recebe
  data maior que a do anterior, inclusive se o relógio local estiver atrasado.
- Após envio a tela usa a resposta persistida; foco na janela e botão de atualização
  consultam novamente o status. Não há aprovação nem publicação automática.

## Segurança e limites

PDF, JPEG/JPG, PNG e WebP; um arquivo, padrão de 10 MiB, configurável entre 1 e 10 MiB.
O parser multipart impõe teto absoluto de 10 MiB, um arquivo e nenhum campo extra.
O serviço aplica também o limite configurado. Arquivos vazios são rejeitados.
Extensão e MIME devem concordar, e o conteúdo real é verificado.

Imagens reutilizam `validateImage`/Sharp: até 20 megapixels, uma página, decodificação
completa e normalização sem metadados originais. SVG, HTML e executáveis não são aceitos.
PDF exige assinatura 1.0–1.7, marcador final, estrutura parseável, 1–100 páginas e ausência
de criptografia. `pdf-lib` não executa conteúdo incorporado. O parsing ocorre em worker
com heap de 128 MiB, geração jovem de 16 MiB e prazo de 10 segundos, evitando bloquear
o event loop da API. PDF 2.0 não está habilitado nesta fase.

O orçamento de uploads existente limita a duas requisições multipart simultâneas por
instância, compartilhado com fotos. O guard existente limita o endpoint de envio a cinco
tentativas por minuto por IP/instância, antes de processar o multipart. Em múltiplas réplicas,
o rate limit requer armazenamento distribuído ou limite adicional no gateway; a consistência
documental é protegida pelo PostgreSQL entre réplicas.

O nome original só serve para verificar a extensão e para apresentação local; nunca vira
caminho. A referência persistida é `<veiculo_uuid>/<documento_uuid>.<pdf|jpg|png|webp>`.
Uploads usam `upsert: false`. Não se registram conteúdo, URL assinada ou segredos nos logs.

Validação estrutural não é antivírus e não garante ausência de malware, ações JavaScript,
anexos ou conteúdo ativo em PDFs. Arquivos não são embutidos automaticamente na tela;
o usuário solicita o acesso privado. Antivírus/CDR e quarentena exigem infraestrutura
adicional antes de operar com uma política que obrigue esse nível de proteção.

## Storage, PostgreSQL e compensação

Reutiliza `StorageModule`/`StorageService`, sem cliente Supabase no React.
Antes do upload verifica que o bucket configurado existe e tem `public=false`.
Não cria buckets e não recorre ao bucket fotográfico. Acesso usa a validação privada
e assinatura existentes da B.1, incluindo MIME/tamanho do objeto.

Persistência reutiliza os campos existentes de `documento_veiculo`; nenhuma coluna
ou migration B.1.3 é necessária. As migrations anteriores continuam sendo pré-requisitos.
Nenhuma migration foi executada nesta implementação.

Upload usa transação Serializable, bloqueio `FOR UPDATE` no veículo compatível com B.1,
revalidação do estado, envio ao Storage e inserção documental. A transação tem prazo de
60 segundos e espera de aquisição de 5 segundos; erros de concorrência viram 409.
Manter o bloqueio durante I/O é uma escolha explícita para impedir decisão/upload conflitante;
um Storage lento pode retardar operações desse veículo. As chamadas Storage têm timeout de 20s.

Se houver falha após tentativa de upload, consulta o UUID em conexão independente antes
de compensar. Só remove o objeto recém-gerado quando não há registro confirmado.
Assim, uma confirmação de commit perdida não apaga um documento já persistido.
Se a consulta ou a remoção falhar, registra apenas o UUID operacional e preserva o objeto.
Em falha ambígua, o cliente deve atualizar a seção antes de reenviar.

Não existe transação ACID compartilhada, outbox documental ou coletor automático de órfãos
nesta fase. Queda abrupta do processo ou upload remoto concluído após timeout pode deixar
objeto órfão. Procedimento operacional de reconciliação:

1. Usar somente conta operacional autorizada, preferencialmente em manutenção.
2. Inventariar objetos do bucket privado sem baixar conteúdo ou imprimir URLs assinadas.
3. Considerar apenas objetos canônicos com idade superior a 24 horas, fora de qualquer envio ativo.
4. Comparar UUID e caminho com **todos** os registros documentais, incluindo antigos/rejeitados.
5. Revalidar ausência no banco sob bloqueio do veículo e gerar lista revisável.
6. Remover somente órfãos comprovados; repetir a comparação após falhas e registrar apenas IDs.

Não foi executada limpeza nem alteração de Storage remoto durante esta entrega.

## Configuração segura de desenvolvimento

Nenhum `.env`, segredo ou configuração produtiva foi alterado.

| Variável | Finalidade |
|---|---|
| `SUPABASE_URL` | URL HTTPS do projeto Supabase de desenvolvimento, já usada pelo backend |
| `SUPABASE_SECRET_KEY` | Credencial privilegiada existente, exclusivamente no backend |
| `SUPABASE_VEHICLE_DOCUMENT_BUCKET` | Nome obrigatório do bucket documental privado, sem fallback |
| `VEHICLE_DOCUMENT_MAX_SIZE_MB` | Nova variável opcional: 1–10, padrão 10 |
| `VEHICLE_PHOTO_SIGNED_URL_TTL_SECONDS` | TTL existente reutilizado pela B.1/documentos; padrão 300s, máximo 900s |

1. Selecionar explicitamente um projeto **de desenvolvimento**, separado de produção.
2. Criar manualmente no dashboard Storage um bucket, por exemplo `veiculos-documentos-dev`.
3. Deixar **Public bucket desativado**. Configurar limite de 10 MiB e MIME permitidos
   `application/pdf`, `image/jpeg`, `image/png`, `image/webp`.
4. Não criar políticas de leitura/escrita anônima ou geral para usuários autenticados.
   O acesso desta funcionalidade passa pelo backend; a credencial privilegiada nunca vai ao React.
5. Configurar `SUPABASE_VEHICLE_DOCUMENT_BUCKET` com esse nome no ambiente seguro do backend.
   Manter URL e chave existentes apontando para desenvolvimento. Não colar chaves em comandos/logs.
6. Opcionalmente reduzir `VEHICLE_DOCUMENT_MAX_SIZE_MB`; usar TTL de 300s no ambiente existente.
7. Reiniciar a API e confirmar upload e consulta autorizada. Bucket ausente/público deve gerar 503.

## Testes e validação

Testes automatizados cobrem conteúdo real de PDF/imagens, arquivo ausente/vazio, MIME/extensão
falsos, arquivo malformado, tamanho, autenticação HTTP, propriedade, documento inexistente,
veículo aprovado/desativado, novo PENDENTE, reenvio, preservação, concorrência simulada,
falhas e compensação, confirmação de commit perdida, Storage privado sem overwrite,
integração entre serviços B.1 e documentos, throttling HTTP e acesso privado.

Frontend cobre estados documentais, rejeição com justificativa, envio permitido/bloqueado,
seleção/validação/prévia, carregamento, sucesso, erro/sessão expirada, atualização após envio,
foco, assinatura sob demanda e retirada do link após expiração. As suítes existentes de
autenticação, fotos, veículos, anúncios e ADMIN também são executadas.

O teste PostgreSQL optativo requer `RUN_DOCUMENT_INTEGRATION=1` e `TEST_DATABASE_URL`
apontando para banco dedicado, diferente de `DATABASE_URL`, com schema já aplicado.
Executar no backend `node --import tsx --test test/documentos.postgres.test.mjs`.
Usa rollback das fixtures e simula somente o Storage; não valida Supabase real.
Não habilitar essas variáveis em ambiente produtivo. Não foi executado nesta entrega.

Resultados executados nesta entrega:

- Backend `npm test`: 109 testes, 103 aprovados, 6 integrações optativas ignoradas, zero falhas.
- Frontend `npm test`: 107 testes aprovados em 10 arquivos, zero falhas.
- Backend `npm run build` e frontend `npm run build`: aprovados.
- Frontend `npm run lint`: concluído sem erros; avisos preexistentes permanecem fora desta fase.
- `git diff --check`: sem erros de whitespace.

A validação completa
com PostgreSQL e Supabase reais e a inspeção visual em navegadores/dispositivos ainda precisam
ser realizadas em desenvolvimento com dados sintéticos autorizados.

## Roteiro manual de ponta a ponta

1. Preparar backend/frontend e banco de desenvolvimento com as migrations anteriores aplicadas
   pelo operador. Configurar o bucket privado conforme acima; não aplicar SQL automaticamente.
2. Criar/usar proprietário de teste, outra conta comum e ADMIN de teste pelo fluxo existente.
3. Gerar PDF sintético de uma página, sem dados pessoais, e imagens sintéticas válidas.
4. Entrar como proprietário, cadastrar veículo pendente e abrir seus detalhes.
5. Confirmar “Nenhum documento enviado”. Testar seleção inválida, arquivo vazio e tamanho excedido.
6. Selecionar PDF válido, conferir nome/tamanho e enviar. Durante envio, controles ficam bloqueados.
7. Confirmar “Aguardando análise”, sem aprovação do veículo ou publicação de anúncio.
8. Com acesso operacional autorizado, confirmar objeto privado no caminho canônico e registro CRLV
   PENDENTE no PostgreSQL. Não copiar o conteúdo ou URL assinada para logs.
9. Pela segunda conta, tentar listar, enviar e abrir arquivo usando IDs conhecidos da primeira:
   todas as operações devem falhar sem expor a existência do documento.
10. No ADMIN, abrir veículo, atualizar arquivos, consultar CRLV e abrir o link temporário.
    Conferir que a aprovação do veículo continua bloqueada enquanto o CRLV estiver pendente.
11. Rejeitar CRLV com justificativa. Confirmar entrada no histórico.
12. No proprietário, atualizar documentação ou voltar à janela. Conferir justificativa e reenvio.
13. Reenviar imagem/PDF sintético. Confirmar novo UUID PENDENTE, documento anterior e histórico preservados.
14. No ADMIN, atualizar, abrir o novo CRLV e aprovar com validade conferida e atual/futura.
    Confirmar status atualizado para o proprietário e histórico administrativo.
15. Adicionar foto válida pelo fluxo existente e aprovar veículo no ADMIN. Conferir que anúncios
    continuam em rascunho e nenhuma reserva/publicação foi criada.
16. No proprietário, confirmar bloqueio de substituição do CRLV após aprovação do veículo.
17. Em outro veículo de teste, confirmar bloqueio após desativação; testar documento expirado e reenvio.
18. Testar Storage ausente/indisponível apenas no ambiente dedicado e confirmar mensagem útil/503.
19. Testar dois envios simultâneos e repetidos; esperar um novo registro e conflito/429 nas tentativas extras.
20. Conferir a seção em desktop/mobile, temas claro/escuro, teclado e leitor de tela; confirmar
    prévia de imagens, mensagens, consulta privada, expiração do link e atualização após revisão.

Não usar documentos pessoais reais nesses testes. Não executar testes destrutivos em dados reais.
Não houve migration, `db push`, reset, criação de bucket, deploy, commit ou push; B.2 não foi iniciada.
