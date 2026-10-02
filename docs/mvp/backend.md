# MVP: plano de backend

Status: proposta, para consolidar com `docs/mvp/frontend.md` e `docs/mvp/experiencia.md`
Data: 2026-10-01
Dono: especialista-backend

Decisão de partida (Felipe, 2026-10-01): a POC vira MVP, com Docker.

Este é um plano. Nada daqui foi implementado, nenhum arquivo de `poc/` foi tocado e nenhum ADR foi criado. O plano não decide o que é de outro dono: catálogo de operações, motor de render e mapeamento PSD são do especialista-grafico; prompt, ferramentas descritas ao modelo e avaliação são do treinador-do-otto; o que registrar é do analista-de-produto; tela e texto são do especialista-ui-ux e do guardião da marca. Onde dependo deles, está escrito como dependência (seção 14).

Marcação usada no texto: **[verificado]** quer dizer medido ou lido nesta rodada; **[suposição]** quer dizer que não conferi. A lista completa das suposições está na seção 16.

## 1. Em uma página

- **A POC pode virar MVP sem esperar os três spikes**, porque o que o backend constrói (conta, banco, isolamento, fila, armazenamento, contrato) não depende do resultado deles. Dois portões baratos continuam: abrir no Photoshop os PSDs que a POC já gera, e fechar a interface do render com o especialista-grafico antes da fatia que usa o worker.
- **O que migra:** o núcleo (`documento`, `render`, ciclo do agente, direção, esforço, prompt, mapeamento PSD, importador de SVG) migra quase como está. O que é reescrito é tudo que a POC resolve com memória de processo e disco local: `servidor.ts`, `armazenamento.ts`, os caches de `canvas-node.ts`, `pixabay.ts` e `googleFonts.ts`.
- **O que fica para depois:** leitura do site da marca (Chrome sem janela), recorte de sujeito (ONNX), chave própria de banco de imagens, aceitar em parte, o "pode" antes de tarefa grande, retomada de tarefa interrompida.
- **Docker:** um `compose` com borda, web, api, worker, banco e armazenamento compatível com S3, mais dois serviços de execução única (instalar dependências e migrar). Todo `node_modules` mora em volume nomeado, porque o disco do repositório é exFAT. **Testei: funciona** (seção 2).
- **Dados:** PostgreSQL com Prisma, `conta_id` em toda tabela de negócio, RLS com `FORCE`, três papéis de banco (ADR 023). Histórico só de acréscimo: desfazer grava um lote de reversão, nunca apaga linha.
- **Agente:** tarefa na fila (pg-boss), ciclo no worker, cada lote em transação curta, custo gravado a cada chamada ao modelo, progresso gravado em tabela e entregue ao editor por fluxo de eventos com retomada.
- **Ordem:** esqueleto, conta e documento, exportação pela fila, tarefa do agente, briefing e bancos, operação e produção. A ordem entre exportação e agente é ponto de consolidação com o frontend (seção 12).
- **Maior risco:** custo e duração da tarefa (14 a 30 minutos e R$ 1,58 a R$ 7,11 projetados por tarefa na POC) contra um limite diário de 45 milhões de tokens na conta da DigitalOcean. O MVP mede isso de verdade pela primeira vez; não resolve.

## 2. O que foi verificado nesta rodada

| # | Fato | Como |
|---|---|---|
| V1 | O disco do repositório é exFAT (`/dev/sda1`, montado com `uid=1000`). `pnpm install` com o código montado no contêiner **falha** com `EPERM: operation not permitted, symlink` | `findmnt`; teste em contêiner `node:24-slim` com um workspace de dois pacotes |
| V2 | O mesmo `pnpm install` **funciona** quando o `node_modules` da raiz e o de cada pacote do workspace são volumes nomeados. O pacote do workspace resolve (`workspace:*`), o lockfile é gravado no disco exFAT, e os executáveis em `.bin` são arquivos comuns, não links | Mesmo teste, com três volumes. Diretório e volumes de teste apagados depois |
| V3 | Docker 29.8.1, Compose v5.5.1, `overlay2`, 8 CPUs, 16 GB. `node:24-slim` e `postgres:17` (variantes `alpine` e `bookworm`) já estão na máquina. Portas 80, 3030, 3306, 5433 e 7070 do host estão ocupadas | `docker info`, `docker images`, `ss` |
| V4 | Tamanho real dos dados da POC: 51 documentos; árvore de 7 a 18 KB nos três maiores; até 37 lotes e 286 eventos por documento; operações sem o snapshot somam até 37 KB. 121 arquivos, 33 MB no total, o maior com 1,5 MB | Leitura de `poc/dados/` |
| V5 | `aplicarLote` precisa de medida de texto para `alinhar` e `distribuir` (`operacoes.ts`, linhas 443 a 461, via `Medidor`). Na POC esse medidor é o canvas do Node dentro do processo da API | Leitura do código |
| V6 | `documento/lint.ts` importa `../render/render` (renderiza para medir contraste e camada invisível). Quatro dos seis testes de `documento` importam `canvas-node` | `grep` de imports |
| V7 | A POC troca o nome do documento por fora do catálogo de operações (`servidor.ts`, linha 219) e o cache de imagens decodificadas é um `Map` global por hash, sem conta (`canvas-node.ts`) | Leitura do código |
| V8 | O repositório do MinIO foi arquivado em 2026-04-25 e a edição comunitária é distribuída só como código-fonte, sem imagem pronta | Página do repositório no GitHub |
| V9 | pg-boss: políticas de fila `standard`, `short`, `singleton`, `stately`, `exclusive`; `expireInSeconds` padrão de 15 minutos, máximo de 24 horas; `retryLimit` padrão 2; opção `group: { id }` no envio para limite de concorrência por grupo; opções `migrate: false` e `createSchema: false` para papel sem privilégio de alterar esquema | Documentação no ramo principal do repositório do pg-boss |
| V10 | A especificação de app da DigitalOcean App Platform aceita `workers` com Dockerfile, `jobs` do tipo `PRE_DEPLOY` e `ingress.rules` por prefixo de caminho. Não aceita arquivo `compose` | Referência da especificação de app |

O que isso muda no plano: V2 resolve o `node_modules` sem mover o repositório; V4 permite guardar um snapshot por lote no MVP; V5 obriga a API a ter medida de texto; V6 e V7 são limites a consertar na migração; V8 tira o MinIO da lista; V9 e V10 confirmam a fila e o caminho de produção.

## 3. Posição nas duas tensões

### 3.1 POC para MVP contra "três spikes antes de qualquer tela"

Os spikes existiam para responder três perguntas antes de gastar em produto. A POC respondeu parte delas.

| Spike | Pergunta | O que a POC respondeu | O que continua aberto |
|---|---|---|---|
| Agente | Adapta uma peça e confere, com custo medido? | O ciclo conferir e corrigir funciona. Claude Sonnet 5 pela DigitalOcean faz ferramenta, imagem e cache pelo `/v1/messages` (memória de 2026-09-29) | Custo real por tarefa aceita, gravado em banco. A POC só tem projeção |
| Saída | Um nó de cada tipo abre editável no Photoshop e no Illustrator? | PSD relido com o ag-psd mostra a árvore certa | Nunca foi aberto no Photoshop. SVG e PDF não existem |
| Render | Idêntico no navegador e no Node, 60 quadros com 200 camadas? | Não respondeu: usa Canvas 2D, não CanvasKit | Tudo |

Minha posição:

1. **Seguir com o MVP.** Nenhuma resposta dos spikes de saída e de render muda conta, banco, isolamento, fila, armazenamento ou contrato HTTP. Mudam `packages/render` e `packages/psd`, que o backend consome por interface.
2. **Dois portões baratos não podem ser pulados.** (a) Abrir no Photoshop os PSDs que a POC gera, antes de fechar a fatia de exportação: é teste manual de horas, e o ADR 028 trata PSD editável como requisito. (b) Fechar com o especialista-grafico a interface do render (seção 3.3) antes da fatia que estreia o worker.
3. **O que precisa ficar registrado.** O `CLAUDE.md` diz que a POC é descartável, que não há código de aplicação e que os spikes vêm antes de qualquer tela. A decisão de hoje contradiz as três frases. Isso pede um ADR novo (o próximo número é 035) e uma nota no `CLAUDE.md`. Não criei nenhum dos dois.

### 3.2 Arquivo por arquivo

Vereditos: **quase como está** (move, ajusta imports e limites), **reescrito** (o comportamento fica, o código não), **depois** (fora das primeiras fatias).

`poc/src/documento/` (dono no MVP: especialista-grafico; eu integro)

| Arquivo | Linhas | Destino | Veredito | O que muda |
|---|---|---|---|---|
| `esquema.ts` | 440 | `packages/documento` | Quase como está | `novoId` vira gerador injetado (UUID v7, e determinístico por lote: ver P1 na seção 12). O nome do documento sai da árvore ou ganha operação própria (V7) |
| `operacoes.ts` | 532 | `packages/documento` | Quase como está | Recebe medidor e gerador de id por parâmetro. Lote inverso é pedido do frontend e meu, para depois |
| `resumo.ts` | 49 | `packages/documento` | Quase como está | Nada |
| `lint.ts` | 402 | A decidir pelo grafico | Reescrito no limite | Hoje `documento` depende de `render` (V6). Ou o lint vai para junto do render, ou recebe o renderizador por interface. O backend só precisa que `verificarDocumento(doc, meios)` continue com essa assinatura |
| `__testes__/` | 6 arquivos | Junto do código | Reescrito em parte | Quatro importam `canvas-node`. Teste de `documento` usa medidor falso; teste de tinta vai para o render |

`poc/src/servidor/`

| Arquivo | Linhas | Destino | Veredito | O que muda |
|---|---|---|---|---|
| `servidor.ts` | 436 | `apps/api` (controllers e casos de uso) | Reescrito | Não sobra código. Sobra o inventário de rotas (seção 7) e as regras de estado da tarefa, que viram casos de uso com teste |
| `armazenamento.ts` | 120 | Portas e repositórios em `apps/api`; tipos em `packages/shared` | Reescrito | JSON em disco vira PostgreSQL com RLS; arquivo em disco vira `ArmazenamentoDeArquivo`. O snapshot `antes` de cada lote vira `versoes_de_documento` |
| `agente.ts` | 458 | `packages/agente` | Quase como está na lógica, reescrito nas bordas | O ciclo já roda contra `AmbienteDaTarefa`, mas importa direto `canvas-node`, `sujeito`, `googleFonts`, `texturas` e `pixabay`. Tudo isso entra pelo ambiente. `aplicar` passa a ser assíncrono (transação no banco) |
| `modelo.ts` | 239 | Porta em `packages/agente`; adaptador em `apps/api` | Porta reescrita, adaptador Claude quase como está | Os tipos da porta hoje têm o formato do Chat Completions (`image_url`, `tool_calls`). Passam a ser neutros, com um campo opaco para o adaptador guardar os blocos de raciocínio. O adaptador Claude guarda o que custou caro aprender: marca de cache explícita, espera longa no 429, limite diário, tipo da imagem pela assinatura. O adaptador Chat Completions (Kimi) não migra: o modelo caiu em 2026-09-29 |
| `direcao.ts` | 125 | `packages/agente` | Quase como está | Nada estrutural. O texto do prompt é do treinador |
| `esforco.ts` | 398 | `packages/agente` | Quase como está | Os rótulos que o designer lê ("Simples", "Resolve.") vão para arquivo de textos e passam pelo guardião |
| `prompt.ts` | 848 | `packages/agente` | Como está | Dono: treinador-do-otto. Importa a lista de fontes do render; isso vira parâmetro |
| `canvas-node.ts` | 84 | Adaptador do render no worker | Reescrito | É o único arquivo que amarra `@napi-rs/canvas`. O cache global de imagens por hash (V7) vira recurso por job, carregado depois de conferir a conta. Se o motor trocar, troca aqui e em `packages/render` |
| `psd.ts` | 636 | `packages/psd` (dono: grafico) | Quase como está, com a entrada e saída invertida | Hoje lê arquivo, fonte e canvas por import direto. Passa a receber os recursos prontos. O empacotamento em zip sai do mapeamento e vira caso de uso de exportação |
| `svg.ts` | 426 | `packages/documento` ou pacote próprio (grafico decide) | Quase como está | É puro. Ganha teste de entrada hostil (seção 10) |
| `texturas.ts` | 192 | Semeadura da biblioteca | Quase como está | Em vez de gerar na subida da API, gera uma vez e grava na biblioteca do Otto |
| `pixabay.ts` | 64 | Porta `BancoDeImagens` em `packages/agente`; adaptador em `apps/api` | Reescrito | Cache de 24 h sai da memória e vai para tabela. `trazer` só aceita id que veio de uma busca guardada. Ganha `capacidades` (ADR 032) |
| `googleFonts.ts` | 140 | Porta de biblioteca de fontes; adaptador em `apps/api` | Reescrito | Grava em disco local e registra fonte em estado global. API e worker são contêineres separados: o arquivo vai para o armazenamento e cada processo carrega o que precisa. A leitura do nome PostScript é pura e fica |
| `marca.ts` | 250 | `packages/agente` (ficha) e `apps/api` (filtro de endereço) | Depois, com `site.ts` | `urlPermitida` e `enderecoPublico` são reaproveitados em toda saída de rede com endereço vindo de fora |
| `site.ts` | 371 | Serviço próprio | **Depois** | Chrome sem janela pesa centenas de MB na imagem e abre a maior superfície de ataque do backend (seção 10). A própria POC chama o recurso de "extra" |
| `sujeito.ts` | 96 | Job no worker | **Depois** | Modelo de 171 MB e `onnxruntime-node`. Na rodada 4 o agente não usou a ferramenta. Volta como job com cache em tabela |
| `__testes__/` | 7 arquivos | Junto do código | Quase como estão | `modelo-claude.test.ts` vira a base do teste de contrato da porta |

O resto de `poc/`:

| Item | Destino |
|---|---|
| `src/render/` | Território do especialista-grafico. O backend consome pela interface da seção 3.3 |
| `src/web/` | Especialista-react (`docs/mvp/frontend.md`, seção 5) |
| `scripts/conferir-psd.ts` | Vira teste golden de `packages/psd` (grafico). Os outros scripts não migram |
| `fontes/` (18 arquivos) | Biblioteca do Otto, semeada no armazenamento |
| `modelos/isnet-general-use.onnx` | Depois, baixado no build com soma de verificação |
| `dados/` (51 documentos) | Importação opcional para a conta do Felipe, por script de uma execução. Só se ele quiser os exemplos |

### 3.3 Render: o que o backend precisa, sem decidir o motor

O MVP pode sair com o motor da POC (Canvas 2D sobre Skia nativo) ou esperar o CanvasKit do ADR 030. Essa decisão é do Felipe com o especialista-grafico. Para o backend, a troca de motor é dependência e fica contida se a interface abaixo valer.

O que o worker e a API precisam de `packages/render`:

| # | Requisito | Por quê |
|---|---|---|
| R1 | **Recursos entram por parâmetro.** O motor recebe os bytes de imagem e de fonte de quem chama; não lê disco, rede nem armazenamento | Quem confere a conta dona do arquivo é o backend (ADR 023). Com cache global por hash dentro do motor, o hash vira autorização |
| R2 | **Sem estado global entre chamadas.** Uma sessão de render por job, descartada no fim | Dois jobs de contas diferentes rodam no mesmo processo |
| R3 | **Medidor de texto separado do raster.** Uma peça leve que mede a tinta de um nó de texto, usável sem renderizar | A API precisa dele para aplicar `alinhar` e `distribuir` de um lote do designer (V5). Medir texto dentro da requisição é aceitável; renderizar não é (regra 8 do meu papel) |
| R4 | **Render de prancheta inteira e de região**, com lado máximo, em JPEG ou PNG | Ferramenta `renderizar` do agente e revisor |
| R5 | **Pixel de cada camada e a composta** | Exportação PSD |
| R6 | **Meios de verificação** para o lint (contraste medido, camada invisível) | Ferramenta `verificar` |
| R7 | **Limite de área declarado e erro legível acima dele** | O esquema aceita prancheta de 30.000 px de lado. Em RGBA isso passa de 3 GB por superfície. O worker precisa recusar antes de alocar |
| R8 | **Nome e versão do motor expostos** | Entram no registro da tarefa e na chave de qualquer cache de render |
| R9 | **Pode rodar fora da linha principal** (thread ou processo filho) | Render é CPU. Enquanto ele roda, o worker precisa continuar batendo o sinal de vida e ouvindo cancelamento |

Se o CanvasKit entrar, o que muda para mim: a imagem do worker troca uma dependência nativa por um arquivo WebAssembly, a memória do worker precisa ser medida de novo, e o medidor da API (R3) passa a carregar o mesmo WebAssembly. Nada no banco, na fila ou no contrato HTTP.

## 4. Monorepo e limites

```
apps/
  api/                 NestJS. Dois pontos de entrada: HTTP (main) e worker (contexto sem HTTP)
    src/
      conta/           sessão, usuários, limites
      documento/       documentos, lotes, versões, histórico, desfazer
      arquivo/         envio, leitura, biblioteca do Otto (fontes, texturas)
      agente/          execução da tarefa: fila, fluxo de eventos, custo, revisão
      exportacao/      pedido, job, relatório, link
      briefing/        briefings salvos
      plataforma/      config, escopo, persistência (Prisma), fila (pg-boss),
                       armazenamento, log, saúde, registro de uso
    prisma/            esquema e migrações
  web/                 Next.js (especialista-react)
packages/
  documento/           esquema, catálogo de operações, transação, resumo
  render/              motor, medidor, fontes base
  psd/                 mapeamento, relatório, porta FormatoDeArquivoEmCamadas e adaptador
  agente/              ciclo, ferramentas, prompts, direção, esforço;
                       portas ModeloDoAgente e BancoDeImagens
  shared/              contratos HTTP em zod, tipos de evento, códigos de erro, tipos marcados
avaliacao/             conjunto de avaliação (treinador-do-otto)
docker/                Dockerfile, configuração da borda, scripts de início do banco
compose.yaml
```

Cada módulo de `apps/api/src` tem as quatro camadas do ADR 008: `domain`, `application` (casos de uso e portas, sem Nest), `infrastructure` (adaptadores) e `presentation` (controllers, DTOs, guards).

Regras de limite, todas com teste no CI:

1. **O núcleo é puro.** `packages/documento`, `render`, `psd` e `agente` não importam `@nestjs/*`, Prisma, Next nem módulo `node:` de entrada e saída. `documento` e `agente` precisam rodar no navegador e no servidor.
2. **Fornecedor só no adaptador (ADR 020).** Nome de fornecedor e SDK de fornecedor só aparecem em `apps/api/src/**/infrastructure/adaptadores/`, em `packages/psd/adaptadores/`, na configuração do módulo, em variável de ambiente e em migração.
3. **A porta mora com quem consome.** `ModeloDoAgente` e `BancoDeImagens` ficam em `packages/agente`, porque o ciclo é quem chama. `ArmazenamentoDeArquivo`, `BarramentoDeEventos`, `RegistroDeUso` e os repositórios ficam em `application/` do módulo que usa.
4. **Tipo de fornecedor não cruza a porta.** Nada de tipo do SDK de modelo, do Prisma ou do ag-psd em caso de uso.
5. **Escopo como primeiro argumento.** Todo caso de uso e todo método de repositório recebe `EscopoDaConta` antes de qualquer outra coisa (ADR 023).
6. **Injeção sempre por token explícito** (classe abstrata como porta, `@Inject(Porta)` no construtor). Nenhum código depende de metadado de tipo emitido pelo compilador. Motivo: o núcleo é ESM, o desenvolvimento roda TypeScript direto e a POC usa TypeScript 7; com token explícito, a injeção funciona com qualquer compilador. **[suposição]** a provar na fatia 0.

**Como os pacotes do workspace são consumidos** (pergunta do frontend): um formato só, o código-fonte TypeScript. Cada pacote exporta `src/index.ts`. O `web` compila com o Next; a API roda direto do fonte em desenvolvimento e, para produção, empacota o servidor num arquivo com os pacotes do workspace dentro, deixando de fora só o que tem binário nativo e o cliente do banco. Não há `dist` por pacote nem duas saídas para manter. **[suposição]** a provar na fatia 0, junto com a regra 6.

**Testes.** Os 97 testes da POC são Vitest e o núcleo é ESM. O ADR 009 escolheu Jest para o backend e listou Vitest como alternativa. Recomendo Vitest no monorepo inteiro; é decisão registrada em ADR, então está na seção 13.

Suítes obrigatórias desde a primeira tabela, no vermelho antes do código (ADR 023, item 6): `toda-tabela-tem-conta-id`, `toda-tabela-tem-politica`, `papeis-do-banco`, `fronteira-do-escopo` e a suíte `duas-contas`. Teste de contrato por porta, rodando contra o adaptador real e o falso.

## 5. Docker

### 5.1 Serviços do `compose` de desenvolvimento

| Serviço | Imagem | Papel | Depende de |
|---|---|---|---|
| `borda` | Proxy reverso | Única porta publicada (`127.0.0.1:8080`; a 80 do host está ocupada). `/api/*` vai para `api`, o resto para `web`. Sem segurar resposta, para o fluxo de eventos | `api`, `web` |
| `web` | Alvo `dev` | Next em modo de desenvolvimento (especialista-react) | `instalar` |
| `api` | Alvo `dev` | NestJS, HTTP | `instalar`, `migracao`, `armazenamento` |
| `worker` | Alvo `dev` | Mesmo código da API, ponto de entrada do worker | `instalar`, `migracao`, `armazenamento` |
| `banco` | `postgres:17` | Um banco, três papéis criados no script de início | — |
| `armazenamento` | Servidor compatível com S3 | Imagens, fontes, exportações | — |
| `instalar` | Alvo `dev`, execução única | `pnpm install --frozen-lockfile` nos volumes. Os outros esperam ele terminar com sucesso | — |
| `migracao` | Alvo `dev`, execução única | Migrações com o papel migrador, esquema da fila, semeadura (conta interna, fontes base, texturas) | `banco` saudável |

`docker compose up` num clone limpo sobe tudo, na ordem, sem passo manual além de copiar `.env.example` para `.env`.

A **borda** existe para o desenvolvimento ter a mesma forma da produção: mesma origem para página e API, cookie de sessão sem CORS e fluxo de eventos sem intermediário que acumule. O plano do frontend propõe a reescrita do Next para isso e lista como suposição que ela não segura o fluxo. Com a borda, a pergunta não precisa de resposta.

**Armazenamento compatível com S3.** O MinIO saiu da lista (V8). O serviço entra na fatia que estreia envio de arquivo, escolhido pelo teste de contrato de `ArmazenamentoDeArquivo`: precisa de link assinado SigV4, CORS por bucket e endereço público diferente do interno. Candidatos: Garage, SeaweedFS, Versity Gateway **[suposição: não testei nenhum]**. O adaptador falso exigido pelo ADR 020 (disco local, com link assinado por HMAC servido pela própria API) existe de qualquer forma e serve de plano B para desenvolvimento.

### 5.2 `node_modules` num disco sem link simbólico

Provado em V1 e V2:

- O repositório entra no contêiner por montagem do diretório.
- **Cada `node_modules` é um volume nomeado:** o da raiz e o de cada pacote (`apps/api`, `apps/web`, `packages/documento`, `render`, `psd`, `agente`, `shared`). A lista é fixa no `compose`. Pacote novo sem volume falha no `pnpm install` com `EPERM`, que é uma falha barulhenta e fácil de entender.
- O armazém do pnpm fica dentro do volume da raiz (ou em volume próprio, com cópia; tanto faz, decide-se na fatia 0).
- `.next`, saída de build e cache de teste também em volume: exFAT é lento com muito arquivo pequeno.
- O contêiner roda com o usuário `node` (id 1000, o mesmo do Felipe).
- `.dockerignore` desde o primeiro dia: sem ele, `poc/dados` (193 MB), `poc/modelos` (171 MB) e `.env` entram no contexto de build.

Consequência: o host não tem `node_modules`. Teste, tipos e Biome rodam por `docker compose exec` ou `run`, inclusive quando quem roda é um agente. O editor de código só enxerga os tipos se abrir o projeto dentro do contêiner. Mover o repositório para um disco ext4 elimina isso; o plano funciona nos dois casos (decisão 12 na seção 13).

Outra consequência do exFAT: ele não distingue maiúscula de minúscula. Um import com a caixa errada funciona aqui e quebra na imagem de produção. `forceConsistentCasingInFileNames` ligado e build de produção rodando no CI.

### 5.3 Dockerfile

Um Dockerfile de vários estágios, com contexto na raiz e alvos nomeados:

| Alvo | Conteúdo |
|---|---|
| `base` | `node:24-slim` com versão fixada (Debian, glibc), pnpm fixado pelo campo `packageManager`, processo inicial que repassa sinais |
| `dev` | `base` mais ferramentas. O código vem por montagem; `node_modules` vem dos volumes |
| `deps` | Só manifestos e lockfile, depois `pnpm fetch` com cache de build e instalação congelada. O código entra depois (cache de camada, ADR 019) |
| `build` | Código, geração do cliente do banco, empacotamento da API e do worker. Roda os testes de fronteira; se falharem, a imagem não sai |
| `servidor` | Imagem final de API e worker: só o empacotado, as dependências nativas e as fontes base. Usuário sem privilégio, sem ferramenta de build, verificação de saúde. API e worker são a mesma imagem com comando diferente |
| `migracao` | Migrações, ferramenta de migração e semeadura. É o único lugar onde a URL do papel migrador existe |
| `web` | Next `standalone` (especialista-react) |

Por que Debian e não Alpine: `onnxruntime-node` não publica binário para musl **[suposição]**, e manter uma base só vale mais que 60 MB de economia.

### 5.4 Dependências nativas

| Dependência | Onde roda | Tratamento |
|---|---|---|
| `@napi-rs/canvas` (Skia nativo) | Worker (render) e API (só o medidor de texto, R3) | Binário pronto para Linux x64 com glibc; a POC já roda com ele neste Linux. **A imagem não tem fonte de sistema, de propósito:** texto com fonte ausente não cai em fonte do sistema em silêncio (ADR 027, item 7). Depende da decisão de motor |
| Modelo ONNX do recorte de sujeito (171 MB) | Worker | **Depois.** Quando entrar: baixado no build com soma de verificação conferida, nunca no repositório. `onnxruntime-node` em CPU. Memória a medir |
| Chrome sem janela (`site.ts`) | Serviço próprio | **Depois.** Quando entrar: contêiner separado, sem credencial de banco nem de armazenamento, com saída de rede filtrada (seção 10). Nunca dentro da imagem do worker |
| Cliente do banco gerado | API e worker | Gerado no estágio `build` para o alvo da imagem final |

Limite de memória por serviço declarado no `compose` desde o início, para o estouro aparecer no desenvolvimento e não na produção. O valor do worker é chute até medir: `custos.md` supõe 4 GiB e marca como não medido.

### 5.5 Variáveis de ambiente e segredos

Configuração validada por zod na subida: faltou ou veio malformada, o processo não inicia. `process.env` é lido em um lugar só (`plataforma/config`).

| Grupo | Variáveis | Quem recebe |
|---|---|---|
| Banco | `BANCO_URL_APP`, `BANCO_URL_MIGRADOR`, `BANCO_URL_OPERACAO` | `APP`: api e worker. `MIGRADOR`: só `migracao`. `OPERACAO`: nenhum contêiner do MVP |
| Armazenamento | `ARMAZENAMENTO_ENDERECO`, `_ENDERECO_PUBLICO`, `_REGIAO`, `_BUCKET`, `_CHAVE_DE_ACESSO`, `_CHAVE_SECRETA` | api e worker |
| Modelo | `MODELO_ADAPTADOR` (`digitalocean` ou `falso`), `MODELO_ENDERECO`, `MODELO_CHAVE`, `MODELO_DO_AGENTE`, `MODELO_DO_JULGAMENTO`, `ESFORCO_DO_AGENTE`, `ESFORCO_DO_JULGAMENTO` | só worker |
| Banco de imagens | `PIXABAY_CHAVE` | só worker (e api, quando houver painel de busca) |
| Sessão e assinatura | `ORIGEM_PUBLICA`, `SEGREDO_DE_ASSINATURA`, `CHAVE_DE_SEGREDOS_DA_CONTA` | api (a última entra com a chave própria de banco de imagens, ADR 032) |
| Limites | `TAREFAS_SIMULTANEAS_POR_CONTA`, `TETO_DIARIO_DE_TOKENS`, `BYTES_MAXIMOS_POR_ARQUIVO`, `LADO_MAXIMO_DE_IMAGEM` | api e worker |
| Operação | `AMBIENTE`, `NIVEL_DE_LOG`, `PORTA` | todos |

Regras: `.env` fora do git (já está no `.gitignore`), `.env.example` versionado e sem valor real; segredo nunca em argumento de build nem em camada de imagem; a API não recebe a chave do modelo, porque quem chama o modelo é o worker; nenhum segredo e nenhuma URL assinada aparece em log (seção 9). A chave de hoje se chama `LLM_API_KEY_DO`; passa a `MODELO_CHAVE`, e o nome do fornecedor fica só no valor de `MODELO_ADAPTADOR`.

### 5.6 Caminho para produção na DigitalOcean

Nada no código sabe onde roda: a porta de hospedagem é o Docker (ADR 020). Duas formas, as duas previstas no ADR 009:

| | A. App Platform | B. Um Droplet com `compose` |
|---|---|---|
| Como | `api` e `web` como serviços, `worker` como worker, `migracao` como job de pré-deploy, roteamento por prefixo (V10). Banco gerenciado e Spaces | O mesmo `compose`, com arquivo de produção por cima: imagens prontas em vez de montagem, a borda fazendo TLS. Banco gerenciado e Spaces |
| Custo fixo estimado | US$ 94 por mês (`custos.md`, seção 5) | Cerca de US$ 44 por mês: Droplet de 2 vCPU e 4 GiB (24), banco gerenciado (15), Spaces (5), com os preços de `custos.md` |
| A favor | Sem servidor para operar; deploy a cada push; TLS da plataforma | Mesma forma do desenvolvimento; metade do custo; sem surpresa de plataforma com conexão longa e job de 30 minutos |
| Contra | Limite de tempo de requisição não documentado **[suposição]**; mais caro | Um ponto único de falha; deploy e atualização do sistema por nossa conta |

Nas duas: banco gerenciado desde o primeiro dia (dado de cliente não mora em volume de Droplet, e o backup vem pronto), Spaces atrás de `ArmazenamentoDeArquivo`, imagens construídas no CI. Recomendo B para o MVP fechado e A quando houver pagante. É decisão do Felipe (seção 13).

**O que o worker precisa, medido em 2026-10-02 (detalhe em 17.10).** Cada exportação ao mesmo tempo é uma thread que ocupa **um núcleo inteiro** enquanto roda e tem a própria memória de render:

| | CPU | Memória |
|---|---|---|
| Processo do worker parado | perto de zero | 0,25 GB |
| Uma exportação comum (1080 px, 2 pranchetas) | 1 núcleo por 1 a 3 s | mais 0,2 a 0,3 GB |
| Uma exportação pesada (desfoque de movimento, PDF) | 1 núcleo por 30 a 50 s | mais 0,4 a 0,5 GB |
| Uma prancheta no teto de tamanho (36 megapixels) | 1 núcleo por 20 a 25 s | perto de 1,3 GB (limite de cima: a medida teve outras exportações ao lado) |

Um worker com duas exportações ao mesmo tempo pede **2 vCPU e 3 GB de teto** (uma máquina de 4 GiB); com uma só, 1 vCPU e 2 GB. A premissa de `docs/tecnico/custos.md` ("4 GiB, não medido") se confirma para duas ao mesmo tempo.

O que isso faz com o custo:

| Forma | O que roda | Custo fixo | Exportações ao mesmo tempo |
|---|---|---|---|
| B, um Droplet de 2 vCPU e 4 GiB com tudo dentro | `WORKERS=1`, `EXPORTACOES_POR_WORKER=1`, para a API e a página ficarem com um núcleo | US$ 44 por mês, como estava | **Uma.** Uma exportação de 40 s segura a fila por 40 s; a ordem entre contas continua justa |
| B com um segundo Droplet básico só para o worker (2 vCPU, 4 GiB) | `EXPORTACOES_POR_WORKER=2` | US$ 68 por mês (44 + 24) | Duas |
| B com o worker num Droplet CPU-Optimized de 2 vCPU | idem | US$ 86 por mês (44 + 42) | Duas, com núcleo dedicado |
| A, worker `apps-s-2vcpu-4gb` | `EXPORTACOES_POR_WORKER=2` | US$ 94 por mês, como estava (o plano já contava esse tamanho) | Duas. Cada réplica a mais do worker: US$ 50 |

Não medi render em vCPU compartilhada da DigitalOcean: os tempos acima são de uma máquina de 8 núcleos com outros processos rodando. A fatia 3 muda esta conta de novo: a tarefa do agente é espera de rede, cabe várias no mesmo núcleo, mas dura de 14 a 30 minutos e não pode morrer num deploy.

## 6. Dados

### 6.1 Forma

Um PostgreSQL, um esquema, `conta_id uuid NOT NULL` em toda tabela de negócio, RLS com `ENABLE` e `FORCE`, política com `USING` e `WITH CHECK` idênticos sobre `current_setting('app.conta_id')`. Ids UUID v7 gerados na aplicação. Chave estrangeira composta `(id, conta_id)` de filha para mãe. `conta_id` como primeira coluna de todo índice de consulta (ADR 023, item 1).

Modelo de política, igual em toda tabela de negócio, escrito na mesma migração que cria a tabela:

```sql
ALTER TABLE documentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE documentos FORCE ROW LEVEL SECURITY;
CREATE POLICY isolamento_por_conta ON documentos TO otto_app
  USING      (conta_id = current_setting('app.conta_id')::uuid)
  WITH CHECK (conta_id = current_setting('app.conta_id')::uuid);
```

Papéis: `otto_migrador` (dono das tabelas, só no serviço `migracao`), `otto_app` (API e worker, sem `BYPASSRLS`, sem `CREATE`), `otto_operacao` (leitura restrita para análise, fora dos contêineres do MVP).

Acesso: `PrismaComEscopo.executar(escopo, fn)` é a única forma de chegar ao banco. Abre transação, executa `set_config('app.conta_id', $1, true)` como primeira instrução e roda `fn`. O cliente cru não é exportado.

Duas funções `SECURITY DEFINER`, e só duas, para resolver a conta antes de existir escopo. As duas devolvem um uuid e mais nada: `resolver_conta_por_sessao(hash_do_token)` e `resolver_conta_por_email(email)`. A segunda substitui a "por endereço" do ADR 023, que era do canal de WhatsApp e caiu com o pivô.

### 6.2 Tabelas

Todas com `conta_id`, salvo as marcadas como exceção.

| Tabela | Guarda | Colunas que importam | Restrições e índices (motivo em uma linha) |
|---|---|---|---|
| `contas` | A conta (pessoa ou estúdio) | `id`, `nome`, `interna`, `tarefas_simultaneas`, `teto_diario_de_tokens`, `criada_em` | Participa do RLS pela própria `id`. Uma conta interna de id fixo, criada na migração (ADR 023) |
| `usuarios` | Quem entra | `id`, `conta_id`, `email`, `senha_hash`, `nome`, `papel`, `desativado_em` | `UNIQUE (email)`: entrar começa pelo e-mail. No MVP um usuário pertence a uma conta |
| `sessoes` | Sessão do editor | `id`, `conta_id`, `usuario_id`, `token_hash`, `expira_em`, `ultimo_uso_em`, `revogada_em` | `UNIQUE (token_hash)`: é a busca do resolvedor. O token nunca é guardado em claro |
| `documentos` | Metadado e ponteiro | `id`, `conta_id`, `nome`, `versao_atual`, `versao_do_formato`, `pranchetas`, `criado_por`, `alterado_em`, `arquivado_em` | `UNIQUE (id, conta_id)` para a chave composta. Índice `(conta_id, alterado_em DESC) WHERE arquivado_em IS NULL`: é a lista de documentos |
| `versoes_de_documento` | Árvore por versão | `conta_id`, `documento_id`, `versao`, `arvore jsonb`, `bytes` | Chave `(documento_id, versao)`. É a leitura de "abrir", de "ver o antes" e de desfazer |
| `lotes_de_operacoes` | O histórico único | `id`, `conta_id`, `documento_id`, `versao`, `autoria`, `usuario_id`, `tarefa_id`, `tipo` (`edicao`, `reversao`), `reverte_ate_versao`, `desfeito_por`, `descricao`, `operacoes jsonb`, `tocados`, `chave_do_cliente`, `criado_em` | `UNIQUE (documento_id, versao)`: dois lotes não ocupam a mesma versão, mesmo com defeito na aplicação. `UNIQUE (conta_id, documento_id, chave_do_cliente)`: reenvio não aplica duas vezes. `CHECK`: autoria `agente` exige `tarefa_id`. Índice `(conta_id, tarefa_id)`: os lotes de um conjunto de alterações |
| `arquivos` | Imagem, vetor e máscara da conta | `id`, `conta_id`, `sha256`, `tipo_mime`, `bytes`, `largura`, `altura`, `especie`, `origem_banco`, `origem_id_externo`, `origem_autor`, `origem_licenca`, `origem_url`, `chave_do_objeto`, `enviado_por` | `UNIQUE (conta_id, sha256)`: é a busca de toda leitura. A linha é a autorização; o hash não é |
| `fontes_da_biblioteca` | Fontes do Otto e do Google Fonts | `familia`, `peso`, `nome_postscript`, `categoria`, `licenca`, `sha256`, `chave_do_objeto` | **Exceção ao RLS** (catálogo global: fonte de licença aberta, igual para todas as contas). `UNIQUE (familia, peso)` |
| `texturas_da_biblioteca` | Texturas geradas pelo Otto | `nome`, `modo_de_mesclagem`, `opacidade`, `sha256`, `chave_do_objeto` | **Exceção ao RLS** (catálogo global) |
| `briefings` | Briefing salvo (ADR 033) | `id`, `conta_id`, `nome`, `dados jsonb`, `versao_do_esquema`, `usos`, `arquivado_em` | Índice `(conta_id, alterado_em DESC)`: lista do formulário |
| `tarefas_do_agente` | A tarefa e o custo total | `id`, `conta_id`, `documento_id`, `usuario_id`, `tipo`, `briefing_id`, `esforco`, `estado`, `fim`, `versao_inicial`, `versao_final`, `resumo`, `pendencias`, `erro_codigo`, `cancelamento_pedido_em`, `batimento_em`, e o custo: `modelo`, `motor_de_render`, `chamadas`, `tokens_de_entrada`, `tokens_de_saida`, `tokens_de_cache_lidos`, `tokens_de_cache_criados`, `imagens_enviadas`, `voltas_de_conferencia`, `duracao_ms`, `custo_estimado_micro_usd` | Índice único parcial `(documento_id) WHERE estado IN ('na_fila','rodando','em_revisao')`: uma tarefa ativa por documento, garantida pelo banco. Índice `(conta_id, estado)`: limite de concorrência por conta |
| `entradas_de_tarefa` | O pedido ou o briefing preenchido | `conta_id`, `tarefa_id`, `pedido`, `briefing jsonb` | Separada de propósito: é o único texto que a equipe pode ler (ADR 031, item 2). Ver 6.5 |
| `chamadas_ao_modelo` | Custo por chamada | `conta_id`, `tarefa_id`, `sequencia`, `papel` (`agente`, `diretor`, `revisor`), `modelo`, os quatro contadores de token, `imagens`, `duracao_ms`, `resultado` | `UNIQUE (tarefa_id, sequencia)`. Gravada a cada chamada: se o worker cair, o custo já gasto não se perde |
| `eventos_de_tarefa` | A linha do tempo que o designer vê | `conta_id`, `tarefa_id`, `sequencia`, `tipo`, `texto`, `dados jsonb`, `criado_em` | `UNIQUE (tarefa_id, sequencia)`: é o id do fluxo de eventos e o ponto de retomada |
| `exportacoes` | Pedido de exportação | `id`, `conta_id`, `documento_id`, `versao`, `formato`, `prancheta_id`, `estado`, `chave_do_objeto`, `bytes`, `relatorio jsonb`, `erro_codigo`, `duracao_ms`, `expira_em` | Índice `(conta_id, documento_id, criada_em DESC)`: última exportação do documento |
| `eventos_de_uso` | Dado de uso (ADR 031) | `id`, `conta_id`, `usuario_id`, `tipo`, `propriedades jsonb`, `ocorrido_em` | Propriedades validadas por lista de permissão por tipo. O catálogo de eventos é do analista-de-produto |
| `buscas_em_banco_de_imagens` | Texto das buscas | `conta_id`, `tarefa_id`, `usuario_id`, `banco`, `consulta`, `resultados`, `criado_em` | Mesmo tratamento de `entradas_de_tarefa` (ADR 031, item 2) |
| `cache_de_busca_de_imagens` | Resultado de busca por 24 h | `banco`, `chave` (hash da consulta e dos filtros), `resultados jsonb`, `expira_em` | **Exceção ao RLS** (catálogo global: o resultado do banco de imagens não é dado de conta; a chave é hash, não o texto) |

Exceções ao `conta_id`, escritas num arquivo com justificativa por linha: as três tabelas globais acima, a tabela de controle de migração e o esquema da fila.

Fica para depois, com a tabela já nomeada em `arquitetura.md`: `conexoes_de_banco` (chave própria, ADR 032), `tokens` da conta, `derivados_de_arquivo` (máscara de sujeito), `leituras_de_pedido` (registro de quem leu, criado junto com a primeira ferramenta de análise).

### 6.3 Versão, histórico e desfazer

**Aplicar um lote** é uma transação curta: trava a linha do documento, confere `versao_atual` contra a `versaoBase` recebida, aplica com `packages/documento`, grava o lote, grava a árvore nova e avança o ponteiro. Lote com versão desatualizada é recusado com a versão atual na resposta. Não existe rota que receba a árvore do cliente.

**Snapshot a cada lote, no MVP.** `arquitetura.md` deixa em aberto "snapshot periódico ou a cada N". Com a árvore em 7 a 18 KB (V4), guardar uma por lote custa centenas de KB por documento e simplifica leitura, "ver o antes" e desfazer. A coluna `arvore` aceita nulo desde já, para passar a snapshot periódico sem migração quando o tamanho pedir. Gatilho: árvore mediana acima de 256 KB ou a tabela passar de 20% do banco.

**Desfazer é acréscimo, nunca apagar.** A POC remove o último lote do vetor. No MVP, desfazer grava um lote do tipo `reversao`, com autoria de quem pediu, que leva o documento ao estado de uma versão anterior e marca `desfeito_por` nos lotes revertidos. O histórico mostra o lote original e a reversão. Refazer é a reversão da reversão.

Limite honesto: no MVP a reversão é calculada pelo snapshot, e por isso só vale em pilha (o passo mais recente primeiro). "Aceitar em parte" e desfazer fora de ordem pedem o **lote inverso** calculado por `packages/documento`, que é pedido ao especialista-grafico. O banco já comporta os dois.

**Desfazer a tarefa inteira** é o mesmo mecanismo: um lote de reversão para a `versao_inicial` da tarefa. Recusado se houver lote do designer depois do primeiro lote do agente (regra da POC, que o frontend também recomenda).

### 6.4 Arquivos

- Chave do objeto: `contas/{conta_id}/arquivos/{sha256}`. Biblioteca do Otto em `biblioteca/...`. A chave nunca vem do cliente e nunca volta para ele.
- Bucket privado, sem leitura anônima. O prefixo por conta serve operação e retenção; o controle de acesso é a linha em `arquivos` lida sob RLS.
- Sem deduplicação entre contas: dois envios do mesmo arquivo por contas diferentes são dois objetos. Economizar aqui criaria um canal para uma conta descobrir que outra tem o mesmo arquivo.
- Leitura por hash: o caso de uso procura em `arquivos` da conta; se não achar, na biblioteca global; se não achar, 404, e a porta de armazenamento não chega a ser chamada.

### 6.5 O que o ADR 031 restringe no banco

| Dado | Onde fica | Quem lê |
|---|---|---|
| Árvore, operações, nomes de camada, relatório de exportação, falas do agente (`eventos_de_tarefa.texto`, `resumo`) | Tabelas sob RLS | Só a conta. O papel de operação **não** tem leitura nessas tabelas |
| Texto do pedido e briefing preenchido, texto de busca em banco de imagens | `entradas_de_tarefa`, `buscas_em_banco_de_imagens` | A conta; e o papel de operação, com registro de leitura. Retenção proposta no ADR 031: 12 meses |
| Tipo, contagem, duração, resultado, tokens | `eventos_de_uso`, colunas de custo | Operação, sem restrição |

O briefing preenchido cita arquivos por hash. O hash não dá acesso ao arquivo: ler o pedido não abre o documento nem a imagem.

### 6.6 Migrações

Cada migração vem com a volta escrita e testada. Migração que cria tabela cria a política no mesmo arquivo; o teste `toda-tabela-tem-politica` falha se não criar. Mudança em tabela com dado segue expandir, migrar, contrair. Roda como `otto_migrador`, em passo separado do início da API.

O esquema da fila é criado no mesmo passo, pelo papel migrador. API e worker sobem o pg-boss com `migrate: false` e `createSchema: false` (V9), porque `otto_app` não tem privilégio de criar esquema.

Conexões: cada transação com escopo segura uma conexão, e o pg-boss tem pool próprio. O total de API, worker, fila e a conexão de escuta precisa caber no plano do banco gerenciado **[suposição: o menor plano dá cerca de 22 conexões úteis]**. Tamanho de cada pool declarado na configuração, nunca no padrão.

## 7. Contrato da API

> **Atualização (fatia 1, 2026-10-01).** O contrato das seções 7.1 a 7.4 está implementado, e a fonte vigente são os esquemas zod em `packages/shared/src/contrato.ts`. Onde a implementação difere do texto abaixo, vale a seção 17.

Esta seção é para o especialista-react e pode ser lida sozinha. Os tipos citados moram em `packages/shared` como esquemas zod: a API valida o pedido com eles, o editor valida a resposta, e o tipo é um só.

### 7.1 Regras gerais

- **Mesma origem.** O navegador fala com `/api/...` na origem da página. Não há CORS.
- **Sessão por cookie.** Nome `__Host-otto_sessao`, `HttpOnly`, `Secure`, `SameSite=Lax`, caminho `/`. Token opaco. Dura 30 dias, renovados a cada uso. Em desenvolvimento, sem `Secure` e sem o prefixo `__Host-`, porque a borda local é HTTP.
- **Toda rota exige sessão**, menos `POST /api/sessao` e as de saúde. Sem sessão ou com sessão vencida: `401` com código `sem_sessao`. O editor leva para a entrada e guarda a fila de lotes pendentes.
- **Escrita exige** `Content-Type` do corpo e cabeçalho `X-Otto-Cliente: editor`. A API também confere `Origin`. É a defesa contra requisição forjada de outro site.
- **A conta nunca vai na requisição.** Não existe parâmetro, cabeçalho ou campo de conta. A API tira da sessão.
- **Recurso de outra conta responde `404`**, com o mesmo corpo de id inexistente. Nunca `403`.
- **Ids** são UUID. Hash de arquivo é SHA-256 em hexadecimal, 64 caracteres.
- **Versão do catálogo.** Toda resposta traz `X-Otto-Catalogo: <versão>`. O editor manda a dele em toda escrita. Se a dele for mais velha e incompatível: `409` com código `catalogo_desatualizado`. O editor pede para recarregar.
- **Paginação** por cursor: `?cursor=&limite=`, resposta `{ itens, proximoCursor }`.
- **Limite de requisições** em entrada na conta e em criação de tarefa: `429` com `Retry-After`.

**Erro**, sempre nesta forma, com `Content-Type: application/problem+json`:

```json
{ "codigo": "versao_desatualizada", "detalhe": { "versaoAtual": 42 } }
```

`codigo` é estável e é por ele que o editor decide. A frase que o designer lê é montada no editor, em `textos/erros.ts`. A API não manda frase de interface.

### 7.2 Sessão e conta

| Rota | Fatia | Pedido | Resposta |
|---|---|---|---|
| `POST /api/sessao` | 1 | `{ email, senha }` | `204` com o cookie. `401 credenciais_invalidas`. `429` |
| `GET /api/sessao` | 1 | — | `{ usuario: { id, nome, email }, conta: { id, nome }, capacidades, limites, catalogo }` |
| `DELETE /api/sessao` | 1 | — | `204`, cookie apagado |

`capacidades`: `{ agente, visao, bancoDeImagens }`, todos booleanos. `limites`: `{ bytesPorArquivo, ladoMaximoDeImagem, tarefasSimultaneas }`. Isto substitui `GET /api/estado` da POC. O nome do modelo não é exposto.

### 7.3 Documentos

| Rota | Fatia | Pedido | Resposta |
|---|---|---|---|
| `GET /api/documentos` | 1 | cursor | Itens `{ id, nome, pranchetas, versao, alteradoEm, tarefa?: { id, estado }, miniatura: null }` |
| `POST /api/documentos` | 1 | `{ nome? }` | `201` com `DocumentoAberto` |
| `GET /api/documentos/:id` | 1 | — | `DocumentoAberto`. `ETag` com a versão; aceita `If-None-Match` |
| `PATCH /api/documentos/:id` | 1 | `{ nome }` | `200 { id, nome }` |
| `POST /api/documentos/:id/duplicar` | 1 | `{ nome? }` | `201` com `DocumentoAberto` |
| `DELETE /api/documentos/:id` | 1 | — | `204` (arquiva; não apaga) |
| `GET /api/documentos/:id/historico` | 1 | cursor | Itens `{ id, versao, autoria, tarefaId?, tipo, descricao, tocados, quantidadeDeOperacoes, quando }`, do mais novo para o mais velho |
| `POST /api/documentos/:id/lotes` | 1 | `{ id, versaoBase, descricao, operacoes, devolver? }` | `200 { versao, lote: { id, tocados }, arvore? }` |
| `POST /api/documentos/:id/desfazer` | 1 | `{ versaoBase }` | `200 { versao, arvore }`. `409 nada_para_desfazer`, `revisao_pendente` |
| `POST /api/documentos/:id/refazer` | 1 | `{ versaoBase }` | `200 { versao, arvore }`. `409 nada_para_refazer` |

`DocumentoAberto`: `{ id, nome, versao, arvore, tarefaAtiva?, conjuntoPendente? }`. `tarefaAtiva` é `{ id, estado }` quando há tarefa na fila ou rodando. `conjuntoPendente` é `{ tarefaId, versaoInicial, tocados }` quando há alterações do Otto aguardando revisão. É o que deixa a tela se remontar quando o designer volta depois de fechar a aba. Histórico e tarefas não vêm mais dentro do documento.

**Protocolo de lote:**

1. `id` é gerado pelo editor. Reenviar o mesmo `id` não aplica duas vezes: a API devolve o resultado guardado.
2. `versaoBase` é a versão em que o lote foi montado. Se não for a atual: `409 versao_desatualizada` com `{ versaoAtual }`. O editor busca o documento de novo.
3. Lote inválido: `422 lote_invalido` com `{ indice, op, alvo?, campo?, motivo }`. `motivo` é um código, não uma frase. Nada do lote entra.
4. Documento com tarefa rodando: `409 documento_em_tarefa`. Durante a revisão a edição é aceita.
5. `devolver: "arvore"` faz a resposta trazer a árvore como ficou no servidor. Enquanto o ponto P1 da seção 12 estiver aberto, o editor deve pedir sempre. Custa de 7 a 18 KB por resposta (V4).
6. Corpo de até 6 MB (um vetor importado cabe). Acima: `413`.

Simulação sem gravar (`?simular=true`, ADR 027) fica para depois: o editor já simula localmente com o mesmo pacote.

### 7.4 Arquivos, vetores e fontes

| Rota | Fatia | Pedido | Resposta |
|---|---|---|---|
| `POST /api/arquivos` | 1 | Corpo com os bytes; `Content-Type` `image/jpeg`, `image/png` ou `image/webp` | `201 { sha256, tipo, largura, altura, bytes, origem }`. `413 arquivo_grande_demais`, `415 tipo_nao_aceito`, `422 imagem_grande_demais`, `422 imagem_ilegivel` |
| `GET /api/arquivos/:sha256` | 1 | — | Os bytes da imagem (ver nota). `404` |
| `POST /api/vetores?nome=` | 1 | Corpo com o SVG, até 5 MB | `201 { no, avisos }`, com `no` pronto para `criarNo`. `422 svg_invalido` |
| `GET /api/fontes?q=&categoria=` | 1 | — | Itens `{ familia, categoria, pesos }` |
| `GET /api/fontes/:familia/:peso` | 1 | — | `{ familia, peso, nomePostScript, arquivo }`, com `arquivo` sendo a URL dos bytes. `404` |
| `GET /api/fontes/:familia/:peso/arquivo` | 1 | — | Os bytes da fonte, com cache imutável |
| `GET /api/texturas` | 4 | — | Itens `{ nome, modoDeMesclagem, opacidade, sha256, largura, altura }` |
| `GET /api/imagens/busca?q=&orientacao=` | 5 | — | Resultados do banco de imagens, com a origem |
| `POST /api/imagens/trazer` | 5 | `{ banco, id }` | `201` igual ao de `POST /api/arquivos` |

O tipo do arquivo é conferido pelo conteúdo, não pelo cabeçalho. Limites propostos: 25 MB por arquivo, 12.000 px no lado maior.

**Nota sobre `GET /api/arquivos/:sha256`.** O editor usa sempre a mesma URL e sempre com `crossOrigin="anonymous"` (ou `fetch`). O que acontece atrás dela é uma das duas formas abaixo, e a escolha não muda o código do editor:

| Forma | Como | Efeito |
|---|---|---|
| Redirecionamento | A API confere a conta e responde `302` para um link assinado de 5 minutos | Cumpre ao pé da letra a regra "download só por link assinado". O link muda a cada vez, então o navegador baixa de novo a cada sessão. Exige CORS no bucket, senão o canvas fica contaminado e `getImageData` falha |
| Entrega pela API | A API confere a conta e transmite os bytes com `Cache-Control: private, immutable` | URL estável, cache perfeito (o conteúdo é o hash), mesma origem, sem CORS. O tráfego passa pela API |

Recomendo a entrega pela API **para imagem dentro do editor**, e link assinado para download de exportação. É exceção a uma regra do meu papel, então não decido sozinho: está na seção 13. As fontes da biblioteca não são dado de conta e saem direto pela API nas duas formas.

`/fontes/*` estático, `POST /api/site` e `POST /api/arquivos/:hash/sujeito` da POC não existem nas primeiras fatias.

### 7.5 Tarefas do Otto

> **Implementado na fatia 3, com diferenças.** O contrato que vale é `packages/shared/src/tarefa.ts`; o que mudou em relação à tabela abaixo está na seção 17.11.

| Rota | Fatia | Pedido | Resposta |
|---|---|---|---|
| `POST /api/documentos/:id/tarefas` | 3 (`pedido`, `criar`), 4 (`briefing`) | `{ tipo: "briefing", briefing, briefingId?, esforco? }` ou `{ tipo: "pedido" \| "criar", pedido, esforco? }` | `202 { tarefa }`. `409 tarefa_em_andamento`, `409 revisao_pendente`, `400 pedido_vazio`, `400 esforco_desconhecido`, `429 limite_de_tarefas` |
| `GET /api/tarefas/:id` | 3 | — | `Tarefa` |
| `GET /api/tarefas/:id/eventos` | 3 | Ver protocolo | Fluxo de eventos, ou JSON |
| `GET /api/tarefas/:id/antes` | 3 | — | `{ versao, arvore }` na versão anterior à tarefa |
| `POST /api/tarefas/:id/cancelar` | 3 | — | `202 { tarefa }` |
| `POST /api/tarefas/:id/aceitar` | 3 | — | `200 { tarefa }`. `409 tarefa_fora_de_revisao` |
| `POST /api/tarefas/:id/desfazer` | 3 | — | `200 { tarefa, versao, arvore }`. `409 editado_depois`, `409 tarefa_fora_de_revisao` |
| `GET /api/documentos/:id/tarefas` | 3 | cursor | Itens `Tarefa`, sem eventos |

O briefing chega no esquema de `packages/shared`. Quem transforma em mensagem para o modelo é o servidor. `pedido` tem até 4.000 caracteres.

`Tarefa`: `{ id, documentoId, tipo, esforco?, estado, etapa?, fim?, versaoInicial, versaoFinal?, resumo?, pendencias?, tocados, criadaEm, iniciadaEm?, terminadaEm? }`.

`etapa` é o passo do ciclo enquanto o estado é `rodando` (por exemplo `direcao`, `producao`, `conferencia`). Vem do ciclo, não de dedução sobre os lotes. A lista de etapas é do treinador-do-otto com o especialista-ui-ux.

`estado`: `na_fila`, `rodando`, `em_revisao`, `aceita`, `desfeita`, `cancelada`, `falhou`. Depois: `aguardando_confirmacao` (o "pode") e `aceita_em_parte`.

`fim` diz como o trabalho parou, e vale quando o estado deixa de ser `rodando`: `entregue`, `cancelada`, `erro`, `limite_de_passos`, `interrompida`. Uma tarefa `em_revisao` com `fim` diferente de `entregue` é a que "não terminou": o que ela fez está no conjunto de alterações, para aceitar ou desfazer.

**O custo não vai ao navegador.** Tokens, chamadas, imagens e voltas ficam gravados no servidor (seção 6.2) e não fazem parte de `Tarefa`. Os planos de frontend e de experiência pedem o mesmo: a tela mostra só o tempo, que o editor calcula por `iniciadaEm`. Se o Felipe decidir mostrar custo, entra um campo novo; não muda o resto.

**Protocolo de eventos** (`GET /api/tarefas/:id/eventos`):

- Com `Accept: text/event-stream`, fluxo de eventos. Cada evento vem sozinho, com `id` igual à sequência (inteiro crescente por tarefa), `event` igual ao tipo e `data` em JSON.
- Na reconexão o navegador manda `Last-Event-ID` e a API retoma dali. Nada se perde, porque todo evento está gravado antes de ser enviado.
- Comentário de batimento a cada 15 segundos.
- Quando a tarefa sai de `rodando`, a API manda o evento `fim` com a `Tarefa` e fecha.
- Sem `Accept: text/event-stream`, a mesma rota responde JSON com `?depoisDe=<sequencia>`: `{ eventos, tarefa }`. É o caminho de reserva por consulta periódica, com os mesmos dados.

| Evento | `data` |
|---|---|
| `estado` | `{ estado, fim? }` |
| `etapa` | `{ etapa }` |
| `plano`, `mensagem`, `revisao` | `{ texto }` |
| `direcao` | `{ texto, direcao }` |
| `lote` | `{ versao, loteId, descricao, tocados, operacoes }` |
| `lote-recusado` | `{ motivo }` |
| `render` | `{ pranchetaId, detalhe }` |
| `verificacao` | `{ avisos }` |
| `imagem` | `{ texto, sha256? }` |
| `erro` | `{ codigo, texto? }` |
| `entrega` | `{ resumo, pendencias }` |
| `fim` | `{ tarefa }` |

O evento `lote` traz as operações e a versão resultante, como o frontend pediu. Enquanto P1 estiver aberto, aplicar localmente pode divergir do servidor; nesse período o editor busca o documento ao receber o evento (`GET /api/documentos/:id`, com `If-None-Match`). Quando P1 fechar, passa a aplicar localmente sem mudança no contrato.

### 7.6 Exportação

| Rota | Fatia | Pedido | Resposta |
|---|---|---|---|
| `POST /api/documentos/:id/exportacoes` | 2 | `{ formato: "pacote" \| "prancheta" \| "pranchetas-em-um-arquivo", pranchetaId? }` | `202 { exportacao }`. `429 limite_de_exportacoes` |
| `GET /api/exportacoes/:id` | 2 | — | `{ id, estado, formato, versao, bytes?, relatorio?, erro?, expiraEm? }` |
| `GET /api/exportacoes/:id/arquivo` | 2 | — | `302` para link assinado de 5 minutos, com nome de arquivo. `409 exportacao_nao_pronta`, `410 exportacao_expirada` |

`estado`: `na_fila`, `rodando`, `pronta`, `falhou`. O editor consulta `GET /api/exportacoes/:id` a cada 2 segundos enquanto não for final. Exportação não tem fluxo de eventos: dura segundos, não minutos.

`relatorio` tem a forma de `RelatorioDeExportacao` da POC (`arquivos`, `camadas`, `tokens`, `fontes`, `imagens`, `avisos`), com `destino` como enumeração (`nativo-editavel`, `nativo-pixel`, `raster-com-aviso`) em vez de frase.

`GET /api/documentos/:id/relatorio` da POC some: ele rodava a exportação inteira dentro da requisição. Um relatório antes de exportar depende de `packages/psd` conseguir produzi-lo sem renderizar (pergunta ao grafico).

### 7.7 Briefings salvos

> **Implementado na fatia 4.** O contrato que vale é `packages/shared/src/briefing.ts` (marcas, briefings salvos, formulário, banco de imagens, texturas); o desenho está na seção 17.12.

| Rota | Fatia | Pedido | Resposta |
|---|---|---|---|
| `GET /api/briefings` | 4 | cursor | Itens `{ id, nome, alteradoEm, usos }` |
| `POST /api/briefings` | 4 | `{ nome, dados }` | `201 { id, nome, dados }` |
| `GET /api/briefings/:id` | 4 | — | `{ id, nome, dados }` |
| `PUT /api/briefings/:id` | 4 | `{ nome, dados }` | `200` |
| `DELETE /api/briefings/:id` | 4 | — | `204` |

### 7.8 Saúde

`GET /api/saude/vivo` e `GET /api/saude/pronto`, sem sessão, sem dado nenhum além do estado.

### 7.9 O que muda para quem conhece `poc/src/web/api.ts`

1. Tudo exige sessão; `401` pode chegar em qualquer chamada.
2. O "registro" inteiro não existe mais. Documento, histórico e tarefas são chamadas separadas.
3. `POST /lotes` pede `id` e `versaoBase` e devolve versão, não registro.
4. Erro é `{ codigo, detalhe }`, não `{ erro }`.
5. Pedir tarefa responde `202`, e a tarefa pode ficar um tempo `na_fila`.
6. O fluxo de eventos manda um evento por vez, com id, e não reenvia tarefa e documento.
7. Exportar deixa de ser um `GET` com download e vira pedido, consulta e link.
8. Briefing salvo sai do `localStorage`.
9. `/api/estado` vira `GET /api/sessao`.
10. Fonte: uma rota só, que entrega os bytes.

## 8. Worker, filas e o ciclo do agente

> **Implementado na fatia 3, com diferenças** (fila `tarefa-do-otto`, duas partes com o "pode" no meio, baixa por falta de sinal em 60 s e sem job de manutenção, fluxo por consulta à tabela em vez de `NOTIFY`): seção 17.11.

### 8.1 Filas

Tudo passa pela porta `BarramentoDeEventos`, com o pg-boss como adaptador.

| Fila | Job | Concorrência | Novas tentativas | Expira em |
|---|---|---|---|---|
| `tarefa-do-agente` | Roda o ciclo | Até 3 por worker (é espera de rede), 1 por conta | Zero | 60 minutos |
| `exportacao` | Renderiza e monta o PSD | 1 por worker (é CPU e memória), 1 por conta | 2, com espera | 10 minutos |
| `manutencao` | Agendado: fecha tarefa sem sinal de vida, expira exportação, sessão e cache, aplica retenção | 1 | 2 | 5 minutos |
| Depois | `miniatura`, `recorte-de-sujeito`, `leitura-de-site` | — | — | — |

Regras (ADR 023, item 5b):

- **Payload só com identificadores**: `{ contaId, tarefaId }`. Nunca texto de pedido, nunca árvore.
- **O worker revalida a conta.** Abre o escopo com o `contaId` do payload e relê a tarefa sob RLS. Se a linha não existe naquele escopo, o job morre e nada é processado. O payload é hipótese; a linha lida sob RLS é a prova.
- **Toda chave de unicidade começa pela conta.**
- **Limite por conta tem duas camadas.** A fonte de verdade é a nossa tabela: ao criar e ao começar a tarefa, o caso de uso conta as tarefas ativas da conta dentro de uma transação. O `group` do pg-boss (V9) é reforço, não a garantia.

### 8.2 Uma tarefa, passo a passo

1. `POST /api/documentos/:id/tarefas`: numa transação, cria a tarefa em `na_fila`, grava a entrada em `entradas_de_tarefa` e publica o job. O índice único parcial recusa a segunda tarefa ativa no mesmo documento. Responde `202`.
2. O worker pega o job, revalida a conta e faz a transição `na_fila` para `rodando` com uma atualização condicional. Se nenhuma linha mudou, outro worker já pegou ou a tarefa foi cancelada: o job termina sem fazer nada. É isso que torna o consumidor idempotente.
3. O worker monta o `AmbienteDaTarefa` de `packages/agente` com adaptadores: documento atual, `aplicar`, `emitir`, render, verificação, banco de imagens, biblioteca de fontes, modelo.
4. **Cada lote é uma transação curta**, a mesma da seção 6.3, com autoria `agente` e o id da tarefa. Nenhuma transação fica aberta durante uma chamada ao modelo.
5. **Cada chamada ao modelo grava uma linha em `chamadas_ao_modelo`** e soma nos totais da tarefa. Isso é feito por um decorador da porta `ModeloDoAgente`, de modo que agente, diretor de arte e revisor são registrados sem o núcleo saber. A mesma gravação atualiza `batimento_em`.
6. **Cada passo visível grava uma linha em `eventos_de_tarefa`** e avisa por `NOTIFY` com o id da tarefa. O aviso leva só o id.
7. Render e verificação rodam no worker, com recursos carregados depois de conferida a conta (R1). Imagem para o modelo sai na menor escala que resolve (768 px na visão geral, recorte em tamanho real até 1.024 px), como na POC.
8. No fim: `em_revisao` se houve lote, `aceita` se não houve nada a revisar, `falhou` se deu erro sem lote. Grava `fim`, `versao_final`, duração e o custo estimado com a tabela de preços vigente.
9. O designer aceita ou desfaz. O resultado (`aceita`, `desfeita` e, depois, `aceita_em_parte`) fecha o registro de custo do ADR 029.

### 8.3 Cancelamento, queda e deploy

- **Cancelar:** a API grava `cancelamento_pedido_em`. O worker confere entre uma chamada e outra e por um temporizador de 2 segundos que aciona o `AbortController` da chamada em curso. Com lote aplicado, a tarefa vai para `em_revisao` com `fim: cancelada`; sem lote, para `cancelada`.
- **Queda do worker:** a tarefa não é retomada, porque o histórico da conversa com o modelo vive na memória do worker. O job de manutenção fecha tarefa `rodando` sem sinal de vida há mais de 20 minutos: `em_revisao` com `fim: interrompida` se houve lote, `falhou` se não. É o que a POC faz ao reiniciar. Sem nova tentativa automática: repetir custa dinheiro e duplicaria lotes.
- **Deploy:** ao receber o sinal de término, o worker para de pegar job, aborta as tarefas em curso e as fecha como interrompidas. Uma tarefa de 20 minutos não cabe no prazo de desligamento. Retomar tarefa (guardar a conversa com o modelo) fica para depois, com gatilho: mais de uma tarefa interrompida por semana.
- **Teto diário de tokens:** antes de cada chamada, o worker compara o consumo do dia com `TETO_DIARIO_DE_TOKENS`. Estourou: a tarefa para com `fim: erro` e código `limite_diario`, em vez de morrer num 429 no meio da peça. A conta da DigitalOcean tem 45 milhões de tokens por dia, e uma tarefa gasta de 0,6 a 1 milhão (memória de 2026-09-29).

### 8.4 Como o progresso chega ao editor

Fluxo de eventos, com consulta periódica como reserva, os dois servidos pela mesma leitura.

API e worker são processos diferentes, então o progresso atravessa pelo banco: o worker grava em `eventos_de_tarefa` e manda `NOTIFY`; a API mantém **uma** conexão de escuta para todas as tarefas e, ao acordar, lê os eventos novos **sob o escopo da conta** de cada cliente conectado. O aviso não carrega conteúdo, e a leitura passa pelo RLS.

Por que assim: (a) o evento existe antes de ser enviado, então reconectar não perde nada; (b) o designer que fechou a aba e voltou vê a mesma linha do tempo; (c) não precisa de mais um componente (Redis) só para isso. A rota do fluxo não segura transação aberta: cada leitura abre e fecha o seu escopo.

### 8.5 Portas e adaptadores

| Porta | Adaptador real | Adaptador falso | Entra na fatia |
|---|---|---|---|
| Repositórios | Prisma | Em memória | 1 |
| `ArmazenamentoDeArquivo` | Compatível com S3 (Spaces em produção) | Disco local com link por HMAC | 1 |
| `BarramentoDeEventos` | pg-boss | Em memória, síncrono | 2 |
| `FormatoDeArquivoEmCamadas` | ag-psd (grafico) | Falso que devolve bytes fixos | 2 |
| `ModeloDoAgente` | Claude pela DigitalOcean, formato Messages | Roteiro gravado de respostas | 3 |
| `BancoDeImagens` | Pixabay | Lista fixa de resultados | 4 |
| Biblioteca de fontes | Google Fonts mais armazenamento | Fontes base | 1 (base), 4 (Google) |
| `RegistroDeUso` | Tabela `eventos_de_uso` | Coletor em memória | 1 |
| `ProvedorDeAssinatura` | A decidir | — | Fora do MVP |

Cada porta tem uma suíte de contrato que roda contra os dois adaptadores, com um caso de escopo trocado (ADR 023). O adaptador real de serviço externo é testado contra respostas gravadas, sem rede no teste unitário. `capacidades` do modelo (`imagem`, `ferramentas`, `cache`) continua na porta, e o núcleo degrada de forma explícita (ADR 020).

O adaptador falso do modelo vale mais do que parece: com ele, a fatia do agente roda inteira no `docker compose up` sem gastar token, e o frontend desenvolve o acompanhamento da tarefa contra um roteiro que se repete.

## 9. Uso sim, conteúdo não: o que restringe log e evento

Regra de bolso do ADR 031: se o dado permite reconstruir, ver ou identificar o trabalho do cliente, é conteúdo.

| Nunca entra em log nem em evento de uso | Sempre entra no log |
|---|---|
| Árvore, operações, texto de camada, nome de camada, nome de documento, nome de arquivo enviado | `conta_id`, id de correlação |
| Texto do pedido, briefing, texto de busca em banco de imagens | Rota como modelo (`/api/documentos/:id/lotes`), método, status, duração |
| Falas do agente: plano, mensagem, direção, revisão, resumo, pendências | Ids: documento, tarefa, lote, exportação |
| Nome de fonte, valor de token de identidade, hex de cor | Contagens: operações por tipo, nós tocados, bytes, tokens, imagens, voltas |
| Corpo de requisição e de resposta; resposta crua do modelo | Código de erro estável |
| Cookie, token de sessão, chave de fornecedor, **URL assinada** (ela é credencial) | Nome do evento |

Como isso é feito cumprir:

1. **Serialização por lista de permissão** no pino, mais `redact` por caminho. O serializador padrão de erro despeja o corpo da requisição; ele é trocado.
2. **A query string não vai para o log.** `GET /api/imagens/busca?q=...` carrega o texto da busca.
3. **Erro de validação registra caminho e código, não valor.** A mensagem do zod pode citar o valor recebido, que é texto de camada.
4. **Erro do adaptador do modelo registra status e tipo.** Na POC, a mensagem de erro leva os primeiros 300 caracteres da resposta do fornecedor, que pode ecoar conteúdo.
5. **`eventos_de_uso` valida as propriedades contra um esquema por tipo de evento.** Propriedade fora da lista é recusada.
6. **Teste `log-sem-conteudo`:** roda um fluxo completo com frases sentinela no nome da camada, no texto, no nome do documento e no pedido, captura o log e a tabela de eventos de uso, e falha se achar qualquer sentinela. Bloqueia o deploy.
7. Linha de log de caminho de negócio sem `conta_id` é defeito, com asserção em teste.

Eventos de uso que o backend consegue emitir desde a primeira fatia, como proposta para o analista-de-produto fechar: `lote_aplicado` (autoria, operações por tipo, quantidade de nós tocados), `arquivo_enviado` (tipo, bytes, dimensões), `tarefa_criada` (tipo, esforço), `tarefa_terminada` (fim, chamadas, tokens, duração), `tarefa_revisada` (resultado), `exportacao_terminada` (formato, duração, bytes, destinos por tipo, fontes por contagem).

O fornecedor de inferência recebe conteúdo para executar a tarefa, e isso é inevitável. O ADR 031 pede que o contrato com ele diga que não retém nem treina; para a DigitalOcean isso continua **a verificar**.

## 10. Entrada hostil

| Superfície | Risco | Controle | Teste que nasce antes do código |
|---|---|---|---|
| Envio de imagem | Arquivo enorme; imagem pequena em bytes e gigante em pixels | Limite de bytes aplicado no fluxo, antes de guardar na memória. Tipo pela assinatura do conteúdo. **Dimensões lidas do cabeçalho, sem decodificar.** A decodificação completa só acontece no worker, com limite de memória | PNG de poucos KB declarando 50.000 px de lado é recusado sem decodificar; arquivo com extensão de imagem e conteúdo de outra coisa é recusado |
| Envio de SVG | Bomba de entidades XML, entidade externa, milhares de caminhos | Analisador sem DTD e sem entidade externa; limite de 5 MB, de nós e de profundidade; o esquema já limita a 400 caminhos | Arquivo de entidades aninhadas e arquivo com entidade externa são recusados com `svg_invalido` |
| Leitura de arquivo por hash | O hash virar autorização | Toda leitura passa pela linha em `arquivos` sob RLS. Hash referenciado num lote e ausente da conta e da biblioteca: lote recusado | Na suíte `duas-contas`: conta A manda `criarNo` com hash de arquivo da conta B e recebe `422` |
| Lote de operações | Lote gigante para derrubar a API | Limite de corpo, de operações por lote e de nós por documento | Lote com 10.000 operações é recusado antes de aplicar |
| Texto dentro de material (briefing, imagem, nome de camada) | Instrução dirigida ao agente | É dado, nunca instrução (ADR 029). A defesa é do treinador-do-otto; o backend garante que material nunca entra no papel de sistema | Caso no conjunto de avaliação (treinador) |
| Banco de imagens | `trazer` com id forjado virar download de endereço arbitrário | O worker só baixa endereço que veio de uma busca guardada no cache, e só do domínio do banco | `trazer` com id que nunca foi buscado é recusado |
| Leitura do site da marca (depois) | O servidor ser usado para alcançar rede interna. A POC confere o DNS e depois o Chrome resolve de novo; e a página pode carregar recurso de endereço interno, como o de metadados da nuvem | Contêiner próprio, sem credencial; saída filtrada na rede, e não só no código; cada requisição da página conferida | Página que redireciona para endereço interno e página que carrega imagem de endereço interno são bloqueadas |
| Entrada na conta | Força bruta; descobrir e-mails cadastrados | Limite por endereço e por conta; tempo de resposta igual para e-mail existente e inexistente; senha com Argon2id | Resposta e tempo iguais nos dois casos |

## 11. Ordem de entrega

Cada fatia começa por teste no vermelho, fecha com tudo verde e roda com `docker compose up`. A fatia 0 não se usa sozinha; é o chão da 1. O tamanho é relativo (P, M, G), não é prazo.

| Fatia | O que passa a existir | Rotas | O que prova | Tamanho |
|---|---|---|---|---|
| **0. Esqueleto** | O monorepo sobe no Docker. API e worker respondem saúde. Banco com os três papéis. Testes de fronteira e de isolamento rodando | Saúde | pnpm em volumes no dia a dia; núcleo ESM dentro do Nest (regra 6 da seção 4); Prisma com RLS; `packages/documento` aplicando um lote a partir da API | M |
| **1. Conta e documento** | Entrar. Criar, listar, abrir, renomear, duplicar e arquivar documento. Aplicar lote com versão. Desfazer e refazer. Enviar imagem e SVG. Fontes base. **É a primeira coisa usável: o documento persiste, com conta.** | 7.2, 7.3, 7.4 (menos texturas e busca) | Isolamento de ponta a ponta (suíte `duas-contas`), histórico só de acréscimo, log sem conteúdo | G |
| **2. Exportar pela fila** | Pedir exportação PSD, acompanhar, baixar por link assinado, com relatório | 7.6 | Fila, worker, render no worker, armazenamento, limite por conta. Tudo determinístico e sem custo de token. Libera o teste manual no Photoshop | M |
| **3. Tarefa do Otto** | Pedir por texto, acompanhar, cancelar, ver o antes, aceitar, desfazer tudo. Custo gravado por chamada | 7.5 (`pedido`, `criar`) | O ciclo no worker, o fluxo de eventos com retomada, o registro de custo do ADR 029. Roda com o modelo falso e com o real | G |
| **4. Briefing** | Tarefa por formulário, briefing salvo, logo e ícones por referência, Google Fonts sob demanda, Pixabay como ferramenta do agente, texturas | 7.5 (`briefing`), 7.7, texturas | O caminho padrão do ADR 033 e as regras do Pixabay (cache de 24 h, download para o armazenamento, origem guardada) | M |
| **5. Operação e produção** | No ar na DigitalOcean. Teto diário, manutenção agendada, retenção, eventos de uso do catálogo do analista, painel de busca de imagens | Busca e trazer imagem | Deploy repetível, migração como passo separado, segredo fora da imagem | M |
| **Depois** | Recorte de sujeito, leitura do site da marca, miniaturas, o "pode", aceitar em parte, chave própria de banco de imagens, retomada de tarefa, tokens da conta, importar PSD, SVG e PDF para o Illustrator, assinatura | — | Cada um com gatilho próprio | — |

Testes que nascem primeiro, por fatia:

- **0:** `toda-tabela-tem-conta-id`, `toda-tabela-tem-politica`, `papeis-do-banco`, `fronteira-do-escopo`, fronteira do núcleo e de nome de fornecedor; configuração inválida impede a subida.
- **1:** lote com versão velha é recusado e nada é gravado; lote inválido não deixa rastro; reenvio do mesmo id devolve o mesmo resultado; desfazer acrescenta um lote e não remove nenhum; documento de outra conta é `404` idêntico ao de id inexistente; arquivo de outra conta por hash é `404`; imagem com dimensão acima do limite é recusada sem decodificar; `log-sem-conteudo`.
- **2:** job com conta trocada no payload é recusado; segunda exportação da mesma conta espera a primeira; link de download vence; exportação de documento de outra conta é `404` e a porta de armazenamento não é chamada.
- **3:** segunda tarefa no mesmo documento é recusada pelo banco; job repetido não roda o ciclo duas vezes; cada chamada ao modelo deixa uma linha de custo, inclusive quando a tarefa falha; reconexão com `Last-Event-ID` entrega exatamente o que faltava; cancelar com lote aplicado leva para revisão; desfazer a tarefa é recusado se o designer editou depois.
- **4:** segunda busca igual em 24 h não chama o banco de imagens; `trazer` com id que não veio de busca é recusado; o documento nunca guarda URL do banco de imagens.

## 12. Encontro com o plano do frontend

Li `docs/mvp/frontend.md` depois de fechar o desenho. O que confere, o que respondo e o que fica para consolidar.

**Confere:** mesma origem; cookie `HttpOnly`; esquemas zod em `packages/shared`; `node_modules` em volumes; usuário 1000 no contêiner; `404` para recurso de outra conta; somente leitura enquanto o Otto trabalha e edição durante a revisão; "desfazer tudo" recusado se houve edição depois; leitura do site, recorte de sujeito e texturas fora das primeiras fatias; nome de modelo fora da tela.

**Suposições do frontend que eu verifiquei:** `pnpm install` com cada `node_modules` em volume funciona (V2). A App Platform roteia por prefixo de caminho (V10).

**Perguntas do frontend, respondidas aqui:** como os pacotes são consumidos (seção 4); versão do catálogo (7.1); sessão (7.1); bytes da fonte (7.4); renomear, duplicar e apagar documento (7.3).

**Pontos abertos entre os dois planos:**

| # | Ponto | Proposta |
|---|---|---|
| P1 | **`aplicarLote` não dá o mesmo resultado no navegador e no servidor.** Dois motivos. (a) O id de um nó novo é gerado dentro de `aplicarLote` (`novoId`), então o nó criado no navegador tem um id e o do servidor tem outro; o lote seguinte do editor, que cita o id local, seria recusado. (b) `alinhar` e `distribuir` medem a tinta, e o navegador e o servidor medem diferente enquanto houver dois motores. A POC esconde os dois porque troca o estado local pelo do servidor a cada lote | Para (a): o gerador de id passa a ser parâmetro de `aplicarLote`, derivado do id do lote e do índice da operação. Navegador e servidor chegam ao mesmo id sem mudar o esquema das operações. É mudança pequena em `packages/documento`, do grafico. Para (b): some com o motor único. **Até lá**, o editor pede `devolver: "arvore"` em todo lote e adota a resposta, e busca o documento a cada evento `lote` da tarefa. O contrato já comporta os dois momentos |
| P2 | **Ordem entre pedir e exportar.** O frontend entrega "pedir" (1b) antes de "exportar" (1d). Eu ponho exportação (fatia 2) antes do agente (fatia 3) | Mantenho a minha ordem como recomendação: a exportação estreia fila, worker, render e armazenamento com trabalho determinístico e sem custo de token, e libera o teste no Photoshop. O frontend não fica parado: desenvolve 1b contra o roteiro gravado de eventos em `packages/shared`. Se o consolidado inverter, troco as fatias 2 e 3; o custo é estrear a infraestrutura do worker junto com a parte mais cara e instável |
| P3 | **O que é "a primeira coisa usável".** Para o frontend, é o ciclo inteiro (briefing, Otto, revisão, PSD) e a edição manual vem depois. Para o backend, a fatia 1 já persiste documento com conta | Não há conflito de construção: a máquina de lotes é a mesma para o designer e para o agente, e a fatia 1 é pré-requisito das duas ordens. Um designer só usa o produto quando fecham as fatias 1 a 4 do backend e 1a a 1d do frontend |
| P4 | **Imagem do editor: cache imutável (pedido do frontend) contra link assinado (regra do meu papel)** | Seção 7.4 e decisão 6 |
| P5 | **Desfazer otimista** pede lote inverso | Enquanto não existir, desfazer e refazer vão à API e devolvem a árvore. O banco já comporta o lote inverso |
| P6 | **Miniatura na lista de documentos** | Campo previsto, nulo no MVP. Vira job de render depois |

### 12.1 Com o plano de experiência

`docs/mvp/experiencia.md` apareceu quando este plano já estava escrito. Li a seção 8.1 (pedidos ao backend), os estados da tarefa (2.2) e o começo das seções 3.1 e 3.3. **Não li o resto.** O que segue é para a consolidação; não refiz o plano em cima dele.

**Já está no plano:** tarefa durável que vira "não terminou" com o conjunto parcial preservado (8.3); fotografia do estado ao abrir e fluxo com retomada (7.3 e 7.5); interromper com estado próprio; histórico com a tarefa como unidade e versão em todo lote; `404` para recurso de outra conta; link de download de vida curta, renovado a cada pedido; custo gravado sem ir ao navegador; erro de envio com código distinto por causa.

**Aceito sem mudar a ordem das fatias** (cada um é pequeno):

| Pedido da experiência | Como entra |
|---|---|
| Evento explícito de etapa | `etapa` na tarefa e no fluxo de eventos (7.5). O nome das etapas vem do ciclo |
| Marcas (cadastro do cliente) | Tabela `marcas` por conta e rotas de listar, criar, alterar e apagar, na fatia 4. Não estava no meu modelo de dados |
| "Nova peça com este briefing" e "tentar de novo" | `entradas_de_tarefa` já guarda o briefing de cada tarefa. Uma rota para recomeçar com a mesma entrada |
| Peça de exemplo em conta nova | Semeadura ao criar a conta |
| Limites consultáveis antes de enviar, e checagem do teto do dia **antes** de começar a tarefa | Rota de limites com o uso atual. A checagem na criação da tarefa se soma à que eu já tinha no meio (8.3). É a observação certa: parar no meio custa mais que recusar no começo |
| Faixa de tempo típica | Consulta sobre tarefas concluídas, por tipo e número de formatos. Só existe depois de haver tarefas; antes disso a API não devolve número |
| Exportar PNG por prancheta | Mais um formato no pedido de exportação |
| Contagem de edições posteriores em "voltar para antes desta tarefa" | Sai do histórico |

**Diverge do meu recorte, e a consolidação decide:**

| Pedido da experiência | Meu plano | O que custa |
|---|---|---|
| Entrada por link no e-mail, e aviso por e-mail em três transições | E-mail e senha, sem fornecedor de e-mail | Uma porta nova (envio de e-mail), um fornecedor novo, e configuração de domínio para o e-mail chegar. **Se o aviso por e-mail entrar no MVP, a entrada por link deixa de custar um fornecedor a mais, e passo a recomendá-la** no lugar da senha |
| O "pode" cumprido pelo servidor, no MVP | Depois | É viável sem retomar conversa com o modelo: a tarefa vira dois jobs. O primeiro faz direção e plano e grava os dois como dado; a aprovação enfileira o segundo, que começa uma conversa nova com direção e plano na entrada (é como a direção já entra hoje). Enquanto espera, nenhum job roda e nenhum custo corre. A regra "sem plano aprovado, lote que toca segunda prancheta ou remove algo é recusado" cabe no mesmo ponto em que a POC já limita pranchetas novas. Tamanho M, e depende do treinador |
| Leitura do site da marca, com estados e cancelamento | Depois | Seção 10 e decisão 10. É o item de maior risco de segurança do backend |
| Miniatura na lista, atualizada a cada lote | Campo nulo no MVP | Um job de render por lote ou por fim de tarefa. Só depois da fatia 2, que estreia o render no worker |
| Pendências como entidade, com resolução automática | Lista em JSON na tarefa | Guardar com tipo e camadas é barato. Resolver sozinha quando a causa some exige rodar o lint a cada edição, que é render no worker. Proponho a entidade agora e a resolução automática depois |
| Relatório sem exportar | Depende do grafico | Só se `packages/psd` produzir o relatório sem renderizar. Senão é a exportação inteira dentro da requisição, como na POC |
| Pergunta de retorno do PSD e "mandar esta peça para a equipe olhar" | Fora das fatias | É o "reportar problema" do ADR 031: tabela própria, consentimento gravado e caminho de leitura pelo papel de operação. Fatia 5 ou depois |
| Lixeira por 30 dias | Arquivar sem apagar | Compatível: `arquivado_em` já existe; falta o job que apaga depois do prazo |

**Pergunta da experiência: quanto demora exportar um pacote de duas pranchetas pesadas?** Não sei. A POC exporta dentro da requisição e ninguém cronometrou. É a primeira medida da fatia 2.

## 13. Decisões que são do Felipe

| # | Decisão | Minha recomendação, em uma linha |
|---|---|---|
| 1 | Registrar a virada POC para MVP e Docker em ADR (035) e corrigir o `CLAUDE.md`, que ainda diz "POC descartável" e "spikes antes de qualquer tela" | Registrar agora, mantendo dois portões: abrir o PSD no Photoshop e fechar a interface do render |
| 2 | Motor de render do MVP: sair com o Canvas 2D da POC ou esperar o CanvasKit (ADR 030) | Sair com o da POC atrás da interface da seção 3.3. A decisão é sua com o especialista-grafico; para o backend a troca é contida |
| 3 | Onde o MVP roda na DigitalOcean: App Platform ou um Droplet com `compose` | Droplet com `compose`, banco gerenciado e Spaces enquanto o MVP for fechado (cerca de US$ 44 contra US$ 94 por mês); App Platform quando houver pagante |
| 4 | Como se entra na conta: e-mail e senha, link por e-mail, ou conta do Google | E-mail e senha, que não exige fornecedor de e-mail. O plano de experiência pede link por e-mail e aviso por e-mail: se o aviso entrar no MVP, recomendo o link (seção 12.1) |
| 5 | Quem pode criar conta no MVP | Só por convite seu, com conta criada por comando. Cadastro aberto fica para depois dos termos de uso |
| 6 | Imagem dentro do editor: entregue pela API com cache imutável, ou sempre por link assinado | Pela API, com a conta conferida em toda leitura; link assinado para download de exportação. É exceção à regra "download só por link assinado" |
| 7 | Inferência: a conta da DigitalOcean tem 45 milhões de tokens por dia, e uma tarefa gasta de 0,6 a 1 milhão. São 45 a 75 tarefas por dia no produto inteiro | Pedir aumento de limite antes de pôr designers para testar, e pôr um teto diário nosso para falhar com mensagem clara. Segundo adaptador só se o aumento for negado |
| 8 | Limites por conta no MVP | Uma tarefa do Otto e uma exportação por vez por conta; 25 MB e 12.000 px por imagem |
| 9 | Retenção: texto dos pedidos, arquivos de exportação, histórico | Pedidos por 12 meses (proposta do ADR 031); exportação por 7 dias; histórico sem prazo no MVP |
| 10 | Ler a identidade pelo site da marca e recorte de sujeito no MVP | Os dois depois. O primeiro abre a maior superfície de ataque do backend; o segundo o agente nem usou na rodada 4 |
| 11 | Vitest no monorepo inteiro, no lugar do Jest que o ADR 009 escolheu para o backend | Vitest. Os 97 testes da POC já são Vitest e o núcleo é ESM |
| 12 | Manter o repositório no disco exFAT ou mover para ext4 | Mover, se você não precisar do disco no Windows. O plano funciona nos dois casos, mas no exFAT o host fica sem `node_modules` |
| 13 | Identificador da conta na primeira linha do prompt (ADR 023, item 5a) | Não aplicar por enquanto. O prefixo do agente (ferramentas e sistema, cerca de 33 mil tokens) não tem dado de conta; marcar por conta faria cada conta pagar a escrita desse cache. Volta quando tokens ou biblioteca da conta entrarem no prefixo |
| 14 | Aviso aos designers do teste de que o texto dos pedidos é lido pela equipe (ADR 031, item 2) | Um aviso simples antes do primeiro tester de fora, sem esperar os termos completos |

## 14. Dependências de outros especialistas

**Especialista-grafico** (não foi chamado nesta rodada):

1. Mover `poc/src/documento` e `poc/src/render` para `packages/`, ou autorizar que eu faça a mudança mecânica com revisão dele. A fatia 0 depende disso.
2. Fechar a interface do render (seção 3.3), em especial R1 a R3.
3. Tirar a dependência de `documento` para `render` no lint (V6).
4. Gerador de id e medidor como parâmetros de `aplicarLote` (P1).
5. Nome do documento: fora da árvore ou com operação própria (V7).
6. `packages/psd` recebendo recursos por parâmetro, e se o relatório pode sair sem renderizar.
7. Limite de área de render (R7).
8. Lote inverso, para aceitar em parte e desfazer otimista.
9. Conferência manual do PSD no Photoshop (ADR 028).

**Treinador-do-otto:** lista de ferramentas da primeira versão sem `detectarSujeito` (e sem `buscarImagens` na fatia 3); roteiro gravado para o modelo falso; quais limites do ciclo são do esforço criativo e quais são teto do sistema.

**Analista-de-produto:** catálogo de eventos de uso (seção 9 traz uma proposta inicial) e o que entra na coluna de custo além do que o ADR 029 lista.

**Especialista-ui-ux:** o que é um "passo" do desfazer; o que acontece com a tarefa que não terminou; se a exportação pede o relatório antes ou depois.

**Guardião da marca:** os rótulos de esforço criativo e qualquer frase que o servidor produza para o designer. A API manda código; a frase é do editor.

**Especialista-react:** os pontos P1 a P6.

## 15. Riscos

| Risco | Efeito | O que fazer |
|---|---|---|
| Custo e duração da tarefa | 14 a 30 minutos e R$ 1,58 a R$ 7,11 projetados por tarefa de dois formatos na POC, acima da faixa de `custos.md` (R$ 0,28 a R$ 1,46). Pode inviabilizar preço e espera | O MVP grava o custo real por chamada e por tarefa aceita. É a medida que falta para decidir preço. Alavancas são do treinador |
| Limite diário de tokens | Com poucos designers testando, o produto para no meio do dia | Decisão 7; teto nosso com erro legível |
| Troca do motor de render | Memória do worker, medidor da API e imagem mudam | Interface da seção 3.3 fechada antes da fatia 2 |
| PSD nunca aberto no Photoshop | O argumento central do produto pode falhar no primeiro teste com designer | Portão manual antes de fechar a fatia 2 |
| Núcleo ESM, NestJS e TypeScript 7 | A injeção ou o build podem não funcionar como planejado | É a primeira coisa que a fatia 0 prova. Plano B: compilar os pacotes para `dist` |
| Tarefa não retomável | Todo deploy e toda queda do worker interrompe as tarefas em curso | Fechar como interrompida, com o que foi feito em revisão. Deploy fora de hora de uso. Retomada depois, com gatilho |
| Medida de texto dentro da API | A API carrega parte do motor e as fontes; um lote com muitos `alinhar` custa CPU na requisição | Limite de operações por lote; medir na fatia 1; o medidor é peça separada (R3) |
| Memória do worker não medida | O plano de hospedagem está apoiado num chute de 4 GiB | Limite declarado no `compose` desde a fatia 2 e medição com o maior documento da POC |
| RLS mal ligado | Pior que não ter: produz confiança | `FORCE`, `set_config` local à transação como único caminho, e as cinco suítes do ADR 023 bloqueando o deploy |
| Papel da aplicação sem privilégio de esquema contra pg-boss | A fila não sobe | Esquema criado pelo migrador; `migrate: false` (V9). Provar na fatia 2 |
| Servidor compatível com S3 para desenvolvimento | MinIO saiu; os candidatos não foram testados | Teste de contrato escolhe; adaptador de disco local como plano B |
| Disco exFAT | Host sem `node_modules`; caixa de nome de arquivo não conferida; lentidão | Volumes; build de produção no CI; decisão 12 |
| Licença do modelo de recorte e das fontes distribuídas no pacote | Distribuir fonte e modelo exige conferir licença | Fica com o jurídico, antes do primeiro pagante (gatilho do `CLAUDE.md`) |
| Fornecedor de inferência reter ou treinar com o conteúdo | Contradiz a promessa do ADR 031 | Conferir o contrato da DigitalOcean antes do primeiro tester de fora |

## 16. Suposições não verificadas

1. O binário do `@napi-rs/canvas` roda em `node:24-slim` sem biblioteca de sistema adicional. A POC roda com ele neste Linux, mas não dentro do contêiner.
2. `onnxruntime-node` não tem binário para Alpine. É o motivo de eu fixar Debian.
3. NestJS carrega pacotes ESM do workspace e injeta por token explícito sem depender de metadado emitido, com o TypeScript da POC (7.x).
4. A API empacotada num arquivo, com os pacotes do workspace dentro, funciona com o cliente do banco e com os binários nativos de fora.
5. A recarga em desenvolvimento enxerga, de dentro do contêiner, a alteração feita no disco exFAT. O frontend mediu no host, não no contêiner.
6. Garage, SeaweedFS ou Versity Gateway atendem link assinado, CORS e endereço público separado.
7. O menor plano de PostgreSQL gerenciado da DigitalOcean tem cerca de 22 conexões úteis e aceita a versão 17.
8. A App Platform não corta conexão longa com batimento a cada 15 segundos. Não achei limite de tempo documentado.
9. O `group` do pg-boss com limite de concorrência existe na versão que será instalada. Li a documentação do ramo principal, não de uma versão.
10. O analisador de XML da POC (`fast-xml-parser`) não expande entidade externa na configuração usada. Vira teste.
11. O Spaces aceita a configuração de CORS necessária, caso a decisão 6 vá pelo redirecionamento.
12. Os números de custo e duração por tarefa são os do `README` da POC, medidos com o Kimi K3 e projetados para o preço do Sonnet 5. Não há medição de tarefa inteira com Claude gravada nos documentos que li; a memória registra só a composição do custo e o consumo de 0,6 a 1 milhão de tokens por tarefa.
13. Os preços de hospedagem são os de `custos.md` (2026-09-26). Não reconferi.
14. O tamanho relativo das fatias (P, M, G) é estimativa minha, sem base medida.

## 17. O que mudou na implementação (fatias 0 a 4)

O plano acima foi escrito antes do código. Esta seção registra onde a implementação se afastou dele, e por quê. Onde ela e o texto das seções anteriores divergem, vale esta.

### 17.1 Decisões que chegaram depois do plano

- **Sem login no MVP** (ADR 035). Não existem `usuarios`, `sessoes`, `POST /api/sessao` nem `GET /api/sessao`. O banco nasceu com `conta_id` e RLS em tudo, e o servidor resolve o escopo sempre para **uma conta fixa**, semeada pela migração. O ponto único é a porta `ResolvedorDeEscopo`; o adaptador em uso é `ResolvedorDeContaFixa`. Isso ainda é suposição a confirmar com o Felipe, e está marcado no código. A guarda já lê o cookie `otto_sessao` e o entrega ao resolvedor, que hoje o ignora.
- **Motor único é o CanvasKit.** A API carrega o CanvasKit uma vez por processo, na primeira vez que um lote mede texto, e usa só o motor de texto (requisito R3).
- **Imagem do editor sai pela API**, com a conta conferida em toda leitura e `Cache-Control: private, max-age=31536000, immutable` (consolidação, `docs/mvp/README.md`). Link assinado fica para o download de exportação, na fatia 2: a porta `ArmazenamentoDeArquivo` ainda não tem esse método.

### 17.2 Banco

| Plano | Implementação | Por quê |
|---|---|---|
| Política de RLS `TO otto_app` | A política vale para **todos os papéis** | Com `FORCE`, o dono da tabela também fica sob a política. Sem política que valha para ele, o migrador não conseguiria nem semear a conta. Assim todo papel, inclusive o dono, precisa de escopo aberto |
| `otto_app` com leitura e escrita nas tabelas | `otto_app` **não tem `DELETE`** em conta, documento, versão nem lote, e só altera a coluna `desfeito_por` de um lote. Em `arquivos`, só lê e acrescenta | "O histórico só cresce" passa a ser garantia do banco, não só da aplicação |
| Duas funções `SECURITY DEFINER` | Nenhuma | Eram os resolvedores de conta por sessão e por e-mail. Entram com o login |
| `fontes_da_biblioteca` como exceção ao RLS | Feito, com uma regra nova: catálogo global não tem RLS, e `otto_app` só lê e acrescenta | A exceção agora declara o motivo (`propria-conta` ou `catalogo-global`) em `prisma/isolamento.excecoes.ts`, e cada motivo tem a sua garantia conferida em teste |
| — | `PrismaComEscopo.noCatalogoGlobal(fn)` | Catálogo global não tem conta. Uma consulta a tabela de negócio feita por esse caminho dá erro no banco, não lista vazia |
| — | Coluna `quantidade_de_operacoes` em `lotes_de_operacoes` | O histórico lista os lotes sem carregar as operações |
| Lote com `usuario_id` | Sem a coluna | Não há usuário. Entra com o login |
| Conta interna da ottobr.ai | Não semeada | Só a conta fixa existe |

### 17.3 Contrato

| Plano | Implementação |
|---|---|
| `POST .../lotes` devolve `{ versao, arvore, lote }` | Devolve `{ versao, lote: { id, tocados } }`. A árvore só vem com `devolver: "arvore"`. O ponto P1 foi resolvido pelo grafico: o id de nó novo deriva do id do lote, então navegador e servidor chegam à mesma árvore. Peça a árvore só em lote que mede texto (`loteDependeDeMedida`) |
| `id` do lote como chave de idempotência | O `id` do editor é também o `idDoLote` de `aplicarLote`. O servidor guarda um id próprio à parte; para o editor, o id do lote é sempre o que ele mandou |
| `422 lote_invalido` com `motivo` em código | `detalhe` é `{ indice, op, alvo?, campo?, mensagem }`. `mensagem` é o texto que `@otto/documento` escreve para o agente, em português. O editor monta a própria frase com `op` e `campo` |
| Renomear como metadado | `PATCH /api/documentos/:id`. Nome e id saíram da árvore (grafico). O `ETag` de abrir muda com a versão **e** com o nome |
| `409 documento_em_tarefa`, `409 revisao_pendente` | Não existem ainda: não há tarefa |
| Desfazer por pilha, refazer como "reversão da reversão" | Implementado sobre a **versão de conteúdo**: a versão cuja árvore o documento repete. Desfazer grava um lote `reversao` que restaura o conteúdo anterior ao último passo de pé; refazer só existe logo depois de desfazer, e uma edição nova o apaga. Regras puras em `documento/domain/historico.ts` |
| Item do histórico | Ganhou `reverteAteVersao` (em reversão) e `desfeito` |
| `X-Otto-Catalogo` mais velho: 409 | Qualquer valor diferente do servidor: `409 catalogo_desatualizado`, só na escrita. O cabeçalho vem em toda resposta |
| — | `403 cliente_nao_identificado`: escrita sem `X-Otto-Cliente: editor`. Sem login, é o que impede um site qualquer de escrever na API de quem está com o Otto aberto |
| — | `422 arquivo_desconhecido` com `{ quantos }`: o lote cita arquivo que a conta não tem. Só a contagem, para não confirmar o que existe em outra conta |
| — | `X-Otto-Correlacao` em toda resposta |
| `GET /api/fontes/:familia/:peso/arquivo` com cache imutável | `Cache-Control: public, max-age=86400` e `ETag` com o hash. O endereço é por família e peso, não por conteúdo. Devolve o peso mais próximo que existe, e diz qual em `X-Otto-Peso` |
| `POST /api/vetores` | O SVG de origem fica guardado como arquivo da conta e **não é servido de volta**: SVG na mesma origem roda script |
| Limite de requisições (`429`) | Não implementado |
| `?simular=true`, miniatura, texturas, busca de imagens | Não implementados (como previsto) |

Limites em vigor: 500 operações por lote, 6 MB por corpo de lote, 4 MB por árvore, 5 MB por SVG, 25 MB e 12.000 px de lado e 80 megapixels por imagem (os três últimos por variável de ambiente).

### 17.4 Docker e empacotamento

- **Armazenamento de desenvolvimento:** Versity Gateway 1.8.0. Passou no contrato de primeira. O disco local continua como plano B, por configuração.
- **Empacotamento da API:** o app e os pacotes `@otto/*` vão num arquivo; toda dependência de terceiro fica de fora e vem de `node_modules` (`pnpm deploy --prod`). O `canvaskit-wasm` é dependência direta da API por isso.
- **Serviço `semear`** no compose, depois da migração: fontes base da biblioteca, como `otto_app`.
- **NestJS 12 é ESM.** A regra 6 da seção 4 (injeção por token explícito) vale e foi provada no Vitest, no `tsx` e no empacotado.

### 17.5 Log e dado de uso

- Uma linha por requisição, com conta, correlação, método, **rota como modelo**, status, duração e tamanhos. O teste `log-sem-conteudo` roda um fluxo com dez frases sentinela e procura por elas no log.
- Os eventos de uso (`lote_aplicado`, `arquivo_enviado`) saem pela porta `RegistroDeUso`, cujo adaptador hoje escreve no log. A tabela `eventos_de_uso` espera o catálogo do analista-de-produto.

### 17.6 Importação da POC

`pnpm --filter @otto/api importar:poc` lê `poc/dados/` e grava documento, versão 0 e arquivos na conta fixa. Entram 48 de 51. Os três que ficam de fora (`muoi4omeoqb8e5em`, `muoimcm7pop61d6u`, `muoj6v47harh0eqy`) têm o arquivo `.json` sobrescrito com bytes de imagem no disco, em 2026-09-30, entre 16h41 e 17h12; `poc/fontes/google/indice.json` está no mesmo estado. O histórico da POC não é importado: lá o id do nó era aleatório, e reaplicar os lotes daria outra árvore.

### 17.7 O que saiu do meu território por necessidade

- **Importador de SVG** (`apps/api/src/arquivo/application/vetor/importar-svg.ts`). Veio de `poc/src/servidor/svg.ts` quase como estava, com a borda endurecida (entidade XML recusada, teto de elementos e de caminhos, erro com código). O mapeamento SVG para vetor é do especialista-grafico; o arquivo deve ir para um pacote do núcleo quando ele decidir onde.
- **Texto que a pessoa lê, produzido pelo servidor**, ainda sem o guardião da marca: o nome padrão de documento e o sufixo de cópia (`documento/textos.ts`), e os avisos do importador de SVG.

### 17.8 Fatia 2: exportação pela fila

**Contrato** (`packages/shared/src/exportacao.ts`; substitui a tabela da seção 7.6):

| Rota | Pedido | Resposta |
|---|---|---|
| `POST /api/documentos/:id/exportacoes/relatorio` | `PedidoDeExportacao` | `200 RelatorioDeExportacao`. Na hora, sem renderizar, sem criar nada |
| `POST /api/documentos/:id/exportacoes` | `PedidoDeExportacao` | `202 Exportacao`. `422 prancheta_desconhecida`, `422 nada_para_exportar`, `429 limite_de_exportacoes`, `503 fila_indisponivel` |
| `GET /api/exportacoes/:id` | — | `Exportacao`, com `Cache-Control: no-store` |
| `GET /api/exportacoes/:id/arquivos/:indice` | — | `302` para link assinado de 5 minutos, novo a cada pedido. `409 exportacao_nao_pronta`, `410 exportacao_expirada` |
| `GET /api/links/:token` | — | Só com o armazenamento em disco local: a própria API entrega o arquivo do link. Sem sessão: o link é a credencial |

`PedidoDeExportacao` é `{ formato: "psd", arquivos: "por-prancheta" \| "juntas", pranchetas? }` ou `{ formato: "png", escala: 1 \| 2, semFundo, pranchetas? }`. Os formatos "pacote" e "prancheta" do plano viraram isso: uma exportação tem **vários arquivos**, cada um com o seu endereço de download. Não há zip.

| Plano | Implementação | Por quê |
|---|---|---|
| Estados `na_fila`, `rodando`, `pronta`, `falhou` | Mais `pronta_em_parte` | Cada prancheta é exportada em separado: a que falha entra em `falhas`, as outras saem. No PSD com as pranchetas juntas não há meio-termo: falhou, falhou tudo |
| `GET .../arquivo` | `GET .../arquivos/:indice` | Um arquivo por prancheta |
| Relatório antes de exportar dependia do grafico | Existe: `relatorioDeExportacao` de `@otto/psd` não renderiza (1 a 6 ms) | Para PNG, o relatório traz só o que falta e a origem das imagens |
| Exportação da versão atual | Da versão **do momento do pedido**, gravada na linha | Editar depois do pedido não muda o arquivo |
| 2 novas tentativas | 200, a cada 3 s | A tentativa é o que faz uma exportação esperar a vez da conta quando outro processo está com ela. Falha de render não é tentada de novo: vira `falhou` ou `pronta_em_parte` |
| Uma por conta garantida pela fila | **Garantida pelo banco** (índice único parcial em `exportacoes`, `WHERE estado = 'rodando'`) e, dentro do processo, pelo adaptador da fila | Ver "O que a medição mostrou" |
| Job de limpeza | Não existe ainda. `expira_em` (7 dias depois de pronta) é gravado, e baixar depois dele responde 410 | Fica com a fila `manutencao`, na fatia de produção |

**Como roda.** A API grava a linha (`na_fila`) e publica `{ contaId, id }`. O worker abre o escopo com a conta do trabalho (`escopoDoTrabalho`, em `plataforma/escopo/`) e chama `iniciar`, que relê a exportação sob RLS: se ela não existe naquela conta ou não está mais na fila, o trabalho termina sem fazer nada (entrega repetida e conta trocada dão no mesmo). Fontes vêm da biblioteca; imagens, só as que têm linha em `arquivos` **naquela conta**. Hash citado que não é da conta não chega ao motor e aparece no relatório como "em falta". Cada arquivo vai para `contas/{conta}/exportacoes/{exportacao}/{indice}.{ext}`; a chave nunca sai na resposta.

**Queda do worker.** Durante o trabalho o worker grava um sinal de vida a cada 5 s. Exportação `rodando` sem sinal há 2 minutos é dada como `falhou` (`interrompida`) na próxima vez que a conta começa uma exportação, ou quando a fila reentrega o trabalho (10 minutos). No desligamento normal o worker espera a exportação em curso (até 30 s).

**Link assinado.** `ArmazenamentoDeArquivo.linkAssinado(escopo, chave, { validadeEmSegundos, nomeDoArquivo, tipoMime })`, nos três adaptadores, com teste de contrato (entrega o arquivo como anexo, vence, não aceita adulteração, recusa chave de outra conta). No S3, URL pré-assinada; o endereço que vai no link é `ARMAZENAMENTO_ENDERECO_PUBLICO` (em desenvolvimento, `http://localhost:8081`). No disco local e no falso, um token HMAC que a rota `/api/links/:token` abre; precisa de `SEGREDO_DE_ASSINATURA`.

**Fila.** Porta `BarramentoDeEventos` (`plataforma/fila/`), adaptadores pg-boss e em memória, um contrato para os dois. O esquema `pgboss` é criado pelo migrador (`fila:preparar`); `otto_app` só lê e escreve linha. Com a fila fora do ar na subida, API e worker ficam de pé e tentam ligar a cada 5 s; pedir exportação responde 503 e a linha não fica pendurada.

**O que a medição mostrou** (2026-10-01, máquina de desenvolvimento, peça importada "Jazz na Praça (teto da ferramenta)", 2 pranchetas, 38 camadas, PSD por prancheta, 6 MB no total):

| Medida | Valor |
|---|---|
| Do pedido ao arquivo pronto, visto pelo cliente (consulta a cada 0,5 s) | 1,9 a 3,7 s em seis seguidas; 4,5 s na primeira depois de o worker subir (carga do motor) |
| Só o trabalho do worker (`duracaoMs`) | 1,2 a 2,0 s; 2,8 s na primeira |
| Espera na fila | 0,5 a 1,1 s (o worker consulta a fila a cada 1 s) |
| 5 pranchetas, 46 camadas, 23 MB | 7,2 s do pedido ao pronto; 6,3 s de trabalho |
| PNG 2x das duas pranchetas | 4,8 s; 3,9 s de trabalho |
| 64 exportações de uma peça leve em 150 s | Mediana 1,3 s, p95 2,6 s, pior 4,2 s |
| Pico de memória do worker | 422 MB em desenvolvimento (com recarga automática); 241 MB na imagem de produção |

O teto de memória está no `compose.yaml`: 2 GB no worker e 1 GB na API em desenvolvimento. (Os 241 MB desta primeira medida eram só de PSD de uma peça; com SVG, PDF e pacote o pico chega a 896 MB, e o ponto de partida para produção passou a 1,5 GB: ver 17.9.)

**A política "singleton" do pg-boss foi descartada pela medição.** A primeira versão deixava a fila garantir "uma por conta" (um trabalho ativo por chave). Numa das medições, a exportação seguinte da mesma conta ficou **123 s parada**: o pg-boss decide quem está ativo por uma estatística da fila refeita a cada 60 s, e um consumidor que carrega essa estatística velha ignora os trabalhos da conta até a próxima leitura. O contrato da porta ganhou um teste que reproduz isso ("a vez da conta"). A fila agora é comum, e a vez da conta é garantida pelo banco e pelo caso de uso (`ContaOcupada` devolve o trabalho para a fila).

**Regra de migração nova.** Criar chave estrangeira para tabela com `FORCE ROW LEVEL SECURITY` falha com "unrecognized configuration parameter app.conta_id": o banco valida a chave como dono da tabela, que também está sob a política. A migração abre um escopo vazio no começo e fecha no fim (`20261001180000_exportacoes`).

**Dado de uso.** `exportacao_pedida` (formato, pranchetas, juntas) e `exportacao_terminada` (formato, resultado, pranchetas, falhas, arquivos, bytes, espera e duração). Falha de render vai para o log como `falha_na_exportacao`, com o tipo do erro e os quadros da pilha, **sem a mensagem** (ela pode citar camada ou fonte). O link assinado e a chave do objeto não aparecem no log; o teste `log-sem-conteudo` confere.

**Pedidos do react atendidos.** `podeDesfazer` e `podeRefazer` em `DocumentoAberto` e nas respostas de lote, desfazer e refazer. `DocumentoAberto.fontes` lista, para cada família que o documento usa, os pesos que existem; com `pesoMaisProximo` (exportada de `@otto/shared`, a mesma função do servidor) o editor sabe qual peso vai receber sem ler o cabeçalho `X-Otto-Peso`.

**Em aberto desta fatia** (o que foi resolvido depois está em 17.9).

- A conta de "5 na fila" não é atômica: dois pedidos simultâneos podem passar em um.
- `/api/saude/pronto` não inclui a fila.
- O texto dos avisos do relatório (`avisos[].texto`, `camadas[].observacao`) vem de `@otto/psd` em português, sem o guardião da marca. O editor deve escolher a frase pelo `codigo`.

### 17.9 Fechamento da fatia 2: SVG, PDF, pacote, limpeza e retomada

**Catálogo.** `X-Otto-Catalogo` anuncia `VERSAO_DO_CATALOGO` (2, com `duplicar` e `transferir`), não mais `VERSAO_DO_FORMATO`. Editor que manda outro valor na escrita recebe `409 catalogo_desatualizado` com `catalogoDoServidor`.

**Contrato** (`packages/shared/src/exportacao.ts`). Tudo é acréscimo ao da 17.8:

| O que | Como |
|---|---|
| `{ formato: "svg", pranchetas? }` | Um `.svg` por prancheta |
| `{ formato: "pdf", arquivos: "juntas" \| "por-prancheta", pranchetas? }` | Padrão `juntas`: um `.pdf` com uma página por prancheta. Como no PSD com as pranchetas juntas, falhou, falhou tudo |
| `pacote: true`, em qualquer formato | A exportação entrega **um `.zip`** (`arquivos` tem um item, `application/zip`, sem `pranchetaId`): os arquivos do formato, a pasta `Fontes/` e `Relatório de exportação.md`. `Exportacao.pacote` vem `true` |
| `RelatorioDeExportacao.camadas[].destino` | Ganhou `omitido-com-aviso` (só SVG e PDF: a camada não foi para o arquivo) |
| `RelatorioDeExportacao.pacote.fontes[]` | Só em pedido de pacote, no relatório prévio e no final: `{ familia, peso, postScript, licenca, incluida, arquivo?, motivo? }`. `motivo` é `licenca_desconhecida` ou `licenca_nao_permite` |
| `GET /api/documentos/:id/exportacoes` | `ListaDeExportacoes`: até 20 exportações da peça criadas nos últimos 7 dias (em curso ou não), da mais nova para a mais velha, **sem** `relatorio`. Peça de outra conta: 404. É como o editor retoma depois de recarregar a página |

O relatório prévio de SVG e PDF vem de `relatorioDeExportacaoVetorial`, sem renderizar. PNG fora de pacote continua sem relatório final.

**Nome do arquivo.** O nome da prancheta entra sempre que **a peça** tem mais de uma prancheta, mesmo exportando uma só: `Peça - Feed.psd`. Só peça de uma prancheta dá `Peça.psd`. Antes a regra olhava quantas pranchetas tinham sido pedidas, e tentar de novo a que falhou dava `Peça.psd` ao lado de `Peça - Story.psd`. Juntas: `Peça (todas as pranchetas).psd` e `Peça.pdf` (nomes de `@otto/psd`).

**Pacote.** O `.zip` é escrito em `exportacao/application/zip.ts`, com o `deflate` e o CRC-32 da plataforma, sem biblioteca: nomes em UTF-8, sem a extensão de 64 bits (4 GB por arquivo e no total). O teste lê o resultado com um leitor independente (`fflate`, só de teste). Uma medida mudou o desenho: dizendo-se "feito no DOS", o `unzip` do Linux trocava os acentos do nome mesmo com o bit de UTF-8; o arquivo agora se diz feito no Unix, com permissão 0644. No pacote os arquivos ficam em memória até o `.zip` fechar, e só o `.zip` vai para o armazenamento.

**Fontes no pacote e licença.** Vão as fontes que o relatório diz que o arquivo usa. A regra (`biblioteca/domain/licenca-de-fonte.ts`) lê o texto de licença registrado na biblioteca:

| Licença registrada | No pacote? |
|---|---|
| SIL Open Font License, Apache License, Ubuntu Font Licence | Sim |
| "licença aberta, a conferir" (23 das 38 fontes de desenvolvimento, que vieram da POC como "Google Fonts (licença aberta, a conferir por família)") | Sim, **com pendência para o jurídico** |
| Outra licença com nome | Não: `licenca_nao_permite`, e o relatório do pacote diz qual fonte e por quê |
| Nenhuma registrada | Não: `licenca_desconhecida`, idem |

Pendências para o jurídico, sem bloquear: (1) conferir a licença de cada uma das 23 famílias e registrar o nome certo; (2) confirmar que levar só o arquivo original da fonte basta para a SIL OFL, que pede que o aviso de direitos e a licença acompanhem cada cópia (o arquivo os traz nos metadados; o pacote não leva o texto da licença à parte); (3) o PDF embute as fontes, o que é do especialista-grafico e cai na mesma conferência.

O texto da seção de fontes do relatório do pacote está em `exportacao/textos.ts`, provisório, sem o guardião da marca. O desenho pede "Baixe em {origem}" para a fonte que ficou de fora: a biblioteca não guarda a origem da fonte, então a frase ainda não diz onde baixar.

**Limpeza dos arquivos vencidos.** Ao terminar com arquivo guardado, a exportação publica um trabalho na fila `limpeza-de-exportacao` com hora marcada (o vencimento mais 1 minuto). O worker abre o escopo da conta do trabalho, relê a exportação sob RLS, apaga os objetos do armazenamento e grava `arquivos_removidos_em`. A linha fica (nome, tamanho e relatório são o registro do que foi exportado), e baixar responde 410. Chegou antes do vencimento ou o armazenamento falhou: o trabalho volta para a fila (a cada 10 minutos, por um dia).

Por que um trabalho por exportação, e não uma varredura agendada: a varredura precisaria ler exportações de todas as contas, e com `FORCE ROW LEVEL SECURITY` nenhum papel faz isso sem abrir uma exceção ao isolamento. Um trabalho por exportação é igual a qualquer outro: conta e id, relidos sob a política. A porta `BarramentoDeEventos` ganhou `publicar(fila, trabalho, { naoAntesDe })`.

O que essa escolha não cobre: exportação terminada **antes** desta rodada não tem trabalho agendado (em desenvolvimento há algumas centenas; em produção não haverá nenhuma), e trabalho perdido com a fila (fila recriada, base restaurada) deixa o arquivo além do prazo. O pg-boss guarda trabalho agendado por 14 dias, o dobro da retenção.

**Exportação parada.** `darBaixaNasParadas`, sempre na conta do escopo, fecha como `falhou`: a que está `na_fila` há mais de 30 minutos (`abandonada`: o trabalho se perdeu ou esgotou as tentativas) e a que está `rodando` sem sinal de vida há mais de 5 minutos (`interrompida`). Roda ao pedir exportação (antes de contar o limite), ao listar, e ao consultar uma exportação em curso há mais de 5 minutos. Quem acompanha deixa de ver `na_fila` ou `rodando` para sempre, e a parada deixa de contar no limite da conta. O limite de sinal de vida subiu de 2 para 5 minutos: o sinal só é gravado entre as etapas do motor, e uma prancheta com desfoque de movimento levou 41 s.

**Banco** (migração `20261002090000_exportacao_vetorial_e_limpeza`, com `down.sql`): `svg` e `pdf` na enumeração de formato, coluna `arquivos_removidos_em`. Nenhum índice novo: a lista usa o que já existia (`conta_id, documento_id, criada_em DESC`) e a limpeza chega por id. `otto_app` continua sem `DELETE`.

**Tempo e memória, medidos** (2026-10-01; "trabalho" é `duracaoMs`, do começo no worker ao último arquivo guardado; somar perto de 1 s de fila para o tempo que o cliente vê):

| Peça | PSD | PNG 2x | SVG | PDF | Pacote PSD | Pacote PDF |
|---|---|---|---|---|---|---|
| "Jazz na Praça (teto da ferramenta)", 2 pranchetas, 38 camadas | 1,7 a 2,6 s | 1,8 a 2,4 s (1x) | 0,3 a 1,7 s | 0,6 a 2,0 s | 1,8 a 2,4 s | — |
| 5 pranchetas, 46 camadas | 6,8 s | 17,7 s | 20,7 s | 21,5 s | 8,6 s | 31,2 s |
| 2 pranchetas com desfoque de movimento | 18,3 s | 39,2 s | 36,7 s | 43,3 s | 17,1 s | 35,7 s |

Tamanhos: de 0,8 MB (SVG ou PDF da primeira peça) a 26,8 MB (PDF das 5 pranchetas). O pacote de PSD da primeira peça tem 4,7 MB com seis fontes dentro.

| Memória do worker (pico do contêiner) | Desenvolvimento | Imagem de produção |
|---|---|---|
| Um formato só, primeira peça, worker recém-subido | 391 a 491 MB | — |
| Todos os formatos das duas peças pesadas, em seguida, no mesmo processo | 886 MB | 896 MB |

O pico é o da maior exportação, não a soma: sobe até um patamar e fica (a memória do WebAssembly não volta ao sistema, mas é reusada). O especialista-grafico viu passar de 1 GB num processo só; aqui ficou em 0,9 GB. O teto no `compose.yaml` continua em 2 GB; para produção o ponto de partida passa de 1 GB para **1,5 GB**. Peça maior que as medidas (mais pranchetas, 4K) pode passar disso: quem passa do teto é morto, e a exportação vira `interrompida`.

**Dado de uso novo:** `pacote` em `exportacao_pedida` e `exportacao_terminada`; `exportacao_baixada` (formato e pacote, no pedido do link); `exportacao_limpa` (arquivos e bytes).

**Em aberto.**

- Um worker faz uma exportação por vez, de todas as contas: uma exportação de 40 s segura a fila inteira por 40 s. Mais vazão é mais processo de worker.
- O pacote e os arquivos ficam inteiros em memória antes de ir para o armazenamento.
- Exportações terminadas antes desta rodada não têm limpeza agendada.
- As três pendências do jurídico sobre fontes, acima.
- SVG e PDF não foram abertos no Illustrator por ninguém (`packages/psd/README.md`).

### 17.10 Mais de um worker

Pedido do Felipe em 2026-10-02: "faça o worker". Havia um processo, uma exportação por vez para todas as contas, e uma peça pesada segurava a fila inteira.

**O que mudou no desenho.**

| Antes | Agora | Por quê |
|---|---|---|
| O render rodava no laço principal do worker | Cada exportação roda numa **thread** (`MotorDeExportacaoEmThread`, `worker_threads`) | O render é síncrono e leva até 43 s numa prancheta. No laço principal, o processo inteiro parava: sem sinal de vida, sem rota de saúde, sem pegar outro trabalho |
| Uma exportação por processo | `EXPORTACOES_AO_MESMO_TEMPO` por processo (padrão 2, de 1 a 8), e `WORKERS` réplicas no `compose` (padrão 2) | Vazão: quatro exportações ao mesmo tempo no desenvolvimento |
| Fila em ordem de chegada | Cada trabalho entra com a posição dele na fila **da conta** (0 para o primeiro, 1 para o segundo…); quem tem menos passa na frente | Uma conta com cinco na fila não atrasa a exportação única de outra |
| Conta ocupada: o trabalho falhava e gastava tentativa (200 de 3 em 3 s) | Conta ocupada: o consumidor devolve `'adiar'` e o trabalho volta em 3 s **sem gastar tentativa**. A fila também agrupa por conta (`group` do pg-boss com `groupConcurrency: 1`, consulta ao vivo) | A exportação órfã por tentativas esgotadas deixa de existir. As tentativas (5) ficam para falha de infraestrutura |
| Worker morto: a exportação virava `interrompida` | Worker morto: **outro worker refaz a exportação do zero**, uma vez. Na segunda morte, `interrompida` | Ver "Retomada" |
| Sinal de vida gravado entre as etapas do motor | Sinal de vida por relógio, a cada 5 s, no banco e na fila | Com o render na thread, o laço principal está sempre livre |
| Limite de 5 na fila: contar e depois criar | `criarSeCouber`: contar e criar numa transação, com trava por conta (`pg_advisory_xact_lock`) | Dois pedidos simultâneos passavam do limite |
| `/api/saude/pronto`: banco e armazenamento | Mais `fila`. Sem fila, 503 | Sem fila a exportação não entra nem sai |
| A thread nunca devolvia memória | A thread parada por 10 s é encerrada e outra sobe no lugar, de prontidão | A memória do WebAssembly só volta ao sistema quando a thread termina |

**A regra "uma exportação por vez por conta" entre workers** continua sendo do banco: o índice único parcial `exportacoes_uma_rodando_por_conta` e o `UPDATE` condicional de `iniciar`. A fila ajuda (não entrega trabalho de conta com trabalho ativo), mas não é a garantia. Prova: `barramento-com-pg-boss.test.ts`, "dois workers sobre a mesma fila", com dois consumidores do pg-boss, o PostgreSQL de verdade e um motor lento: quatro vagas livres, cinco exportações de duas contas, e uma amostragem do banco a cada 25 ms nunca vê duas `rodando` da mesma conta.

**Retomada.** A fila de exportação tem sinal de vida de 30 s (`REGRAS_DAS_FILAS`). Worker morto para de avisar, a fila dá o trabalho por perdido e o entrega a outro worker. Esse worker chama `iniciar` com `retomar`: se a exportação está `rodando` sem sinal no banco há mais de 20 s e ainda tem tentativa (são 2, contando a primeira), ele apaga os arquivos, as falhas e o progresso da tentativa morta e recomeça. Entrega repetida com o dono vivo é ignorada. Outra exportação da conta que chegue no meio espera (`'adiar'`), em vez de derrubar a parada. Para apagar as linhas dos arquivos da tentativa morta, `otto_app` ganhou `DELETE` em `arquivos_de_exportacao` (migração `20261002150000_retomada_de_exportacao`); é a única tabela em que ele apaga, e ela não é histórico.

Medido matando o worker de verdade (`docker kill` no contêiner que rodava um PDF pesado, perto de 9 s depois do começo): o outro worker assumiu **29 s depois da morte** e terminou a exportação; do pedido ao arquivo, 88 s em vez de 29 s. Duas mortes seguidas (aconteceu sem querer: outro agente salvou arquivos e a recarga automática reiniciou os dois workers duas vezes no meio de um PNG) fecham como `interrompida`, com `tentativas = 2`.

**Tempos, antes e depois** (2026-10-02, máquina de desenvolvimento com 8 núcleos e outros agentes rodando testes; `pnpm --filter @otto/api medir:fila`, duas contas de medição):

| Cenário | Antes (1 worker, 1 por vez) | 1 worker, 2 por vez | 2 workers, 1 por vez | 2 workers, 2 por vez |
|---|---|---|---|---|
| Conta P pede um PDF pesado; 2 s depois a conta L pede um PNG leve. **Espera de L** | 36,3 s | 0,7 s | 1,2 s | 1,3 s |
| O PDF pesado, do pedido ao pronto | 38,4 s | 41,7 s | 31,7 s | 29,0 s |
| Conta P pede cinco PSDs de 5 pranchetas; 1 s depois L pede um PNG leve. **Posição e espera de L** | 6ª a terminar, 30,0 s | — | — | 1ª a terminar, 0,5 a 1,4 s |

Com um worker e uma por vez (medido de novo depois da mudança: 48,9 s de espera), a exportação leve continua esperando a pesada: justiça entre contas ordena a fila, não cria vaga. O tempo da exportação pesada varia de 29 a 51 s entre medidas pelo que mais roda na máquina, não pelo desenho.

Memória por worker, com duas vagas: 1,2 GB de pico com duas exportações pesadas de todos os formatos lado a lado (desenvolvimento); 0,7 GB no worker empacotado como em produção, com um PDF pesado e exportações leves. O teto no `compose.yaml` passou a 3 GB e 2 CPUs por worker.

**Teto de tamanho** (item "arquivos inteiros em memória"). Gravar em fluxo não é barato: `@otto/psd` devolve cada arquivo como um bloco de bytes, e o `.zip` do pacote é montado sobre eles. Fora de pacote, só um arquivo fica em memória por vez. Então o teto é declarado, e recusado antes de estourar:

- **Prancheta: 36 megapixels na escala de saída** (6000 × 6000; um A2 a 300 dpi cabe). Passou, `POST .../exportacoes` responde `422 exportacao_grande_demais` com `{ pranchetaId, megapixels, limite }`, sem criar nada. A escala é a do pedido no PNG e 1 no PSD. No SVG e no PDF as camadas que viram imagem saem em 2x quando a prancheta em 2x cabe no teto, e em 1x quando não cabe.
- **Pacote: 400 MB somando os arquivos.** Passou, a exportação termina como `falhou` com `erro.codigo = "pacote_grande_demais"`, antes de montar o `.zip`.

De onde saiu o 36: uma prancheta de 31 megapixels em PSD levou 21 s e o worker chegou a 1,3 GB; uma de 64 megapixels levou 24 s e chegou a 2,3 GB. As duas medidas são limite de cima (havia outras exportações na máquina). Com 36, duas ao mesmo tempo cabem nos 3 GB do worker.

**Contrato.** `Exportacao.pedido` (na consulta e na lista): o pedido original, com `pranchetas` já resolvidas, na ordem do documento. É aceito de volta como corpo de `POST .../exportacoes`: "tentar só as que falharam" é `{ ...pedido, pranchetas: falhas.map(f => f.pranchetaId) }`. Código novo `exportacao_grande_demais` (422). `RespostaDeSaude.dependencias.fila`. `erro.codigo` de exportação pode ser também `pacote_grande_demais`.

**A fila pronta para a fatia 3.** O comportamento de cada fila é uma linha em `REGRAS_DAS_FILAS` (`plataforma/fila/barramento-de-eventos.ts`): teto do trabalho, tentativas, reentrega, adiamento e sinal de vida. A tarefa do agente entra como fila própria, com consumidor e concorrência próprios, sem tocar no adaptador. O que ela pede de diferente está escrito na tabela: teto de uma hora com sinal de vida curto (quem diz que o worker morreu é a falta de sinal), **zero tentativas** para falha (repetir gasta token; retomar de onde parou é decisão do caso de uso), `'adiar'` para esperar a vez da conta, e o prazo de "abandonada" (hoje 30 minutos, pensado para exportação) por tipo de trabalho. O que falta decidir na fatia 3: desligamento do worker com tarefa de 30 minutos em curso (hoje a espera é de 30 s) e onde registrar o custo de token de uma tentativa que morreu.

**CI.** `.github/workflows/ci.yml`: sobe o `compose`, espera API, worker e página, roda testes, Biome e tipos pelo serviço `teste`, exporta um pacote pela fila, e num segundo job constrói as três imagens de produção. O job `navegador` (Playwright, do especialista-react) está no arquivo e só roda com a variável de repositório `TESTES_DE_NAVEGADOR = ligado`. **O workflow nunca rodou.** Conferido aqui: a sintaxe (`actionlint`, sem apontamento) e os passos de espera e de exportação, rodados à mão contra a pilha. Sem prova: o `chown` para o usuário do contêiner na máquina do GitHub, o tempo total (o teto é 40 minutos por job), o cache de camadas (não há) e o build das imagens, que hoje falha no teste de fronteira por nome de fornecedor em `packages/agente` (trabalho em curso do treinador-do-otto).

**Achados de ambiente.**

- Dois `docker compose run` ao mesmo tempo regravavam o cliente do banco um por cima do outro e o arquivo gerado saía corrompido ("File appears to be binary"). O serviço `instalar` agora roda com `flock`.
- Em desenvolvimento, salvar um arquivo em qualquer pacote reinicia API e workers (recarga automática). Com vários agentes editando, uma exportação longa pode ser morta duas vezes e fechar como `interrompida`. Não acontece na imagem de produção.
- O comentário "suposição a confirmar" saiu do código, do `compose.yaml`, do README e da migração inicial. Editar o comentário de uma migração já aplicada não quebra o `prisma migrate deploy` (conferido); o `migrate dev`, que não usamos, reclamaria da soma.

**Em aberto.**

- Vazão ainda é uma exportação por núcleo. Uma conta com cinco exportações pesadas espera por elas em série (é a regra de uma por conta).
- A conta com muitas exportações pode ficar para trás enquanto outras contas mandam a primeira delas sem parar (a posição na fila da conta é fixada no pedido). Com cinco por conta, não vi isso acontecer; sob carga sustentada de muitas contas, pode.
- O desligamento espera a exportação em curso por 30 s; passou disso, ela é retomada por outro worker (ou por este, quando voltar).
- Objetos órfãos no armazenamento: a tentativa morta pode ter gravado um arquivo que a retomada não regrava (índice maior). Ficam sem linha e sem limpeza agendada.
- Medidas com ruído: outros agentes rodavam testes e exportações na mesma máquina. Os números de espera (de 36 s para perto de 1 s) não dependem disso; os de duração e de memória são aproximados.

### 17.11 Fatia 3: a tarefa do Otto no worker

O ciclo é o de `packages/agente` (do treinador-do-otto), sem alteração. O que é do backend: rotas, fila, transações, estado, custo, limites, isolamento e o fluxo de eventos.

**Onde está o contrato.** `packages/shared/src/tarefa.ts`: rotas no cabeçalho, esquemas zod de `Tarefa`, eventos, pedidos e respostas, limites e pendências. `EntradaDaTarefa`, `EventoDaTarefa`, plano, cartão da direção e pendência são os tipos de `@otto/agente`, reexportados **só como tipo**: o editor não carrega o ciclo nem o prompt. A API valida a entrada com o esquema zod de verdade, o mesmo que o ciclo usa.

**Rotas** (todas sob o escopo da conta; tarefa, peça ou pendência de outra conta responde o 404 de id inexistente):

| Rota | Resposta | Recusas |
|---|---|---|
| `GET /api/tarefas/limites` | `LimitesDeTarefa`: pode enviar, motivo, tarefas hoje e na fila | — |
| `POST /api/documentos/:id/tarefas` | `202 Tarefa` | `409 tarefa_em_andamento` (com `tarefaId` e `estado`), `429 limite_de_tarefas` (`limite_da_conta` ou `fila_cheia`), `429 limite_diario`, `503 fila_indisponivel`, `400 pedido_invalido` |
| `GET /api/documentos/:id/tarefas` | `{ itens, viva? }`, as 20 mais recentes | — |
| `GET /api/tarefas/:id` | `Tarefa`, com `pranchetasNovas` em revisão e `edicoesDepois` depois de aceita | — |
| `GET /api/tarefas/:id/eventos` | Fluxo (`Accept: text/event-stream`) ou JSON (`?depoisDe=`) | — |
| `GET /api/tarefas/:id/antes` | `{ versao, arvore }` de antes da tarefa | — |
| `POST /api/tarefas/:id/aprovar` | `Tarefa` (o "pode") | `409 tarefa_fora_do_estado` |
| `POST /api/tarefas/:id/ajustar` | `Tarefa`; corpo `{ texto }`; a direção e o plano são refeitos | `409 tarefa_fora_do_estado` |
| `POST /api/tarefas/:id/cancelar` e `/interromper` | `Tarefa` | `409 tarefa_fora_do_estado` |
| `POST /api/tarefas/:id/aceitar` | `Tarefa` | `409 tarefa_fora_do_estado` |
| `POST /api/tarefas/:id/desfazer` | `{ tarefa, versao, arvore }`; corpo `{ incluirEdicoesPosteriores? }` | `409 editado_depois` (com `edicoes`), `409 tarefa_fora_do_estado` |
| `POST /api/tarefas/:id/descartar` | `{ tarefa, versao, arvore }`; corpo `{ pranchetaId }` | `422 prancheta_nao_descartavel` |
| `POST /api/tarefas/:id/tentar-de-novo` | `202 Tarefa` nova, com a mesma entrada | `409 tarefa_fora_do_estado` |
| `GET /api/documentos/:id/pendencias?estado=` | `{ itens }` | — |
| `POST /api/pendencias/:id/dispensar` e `/reabrir` | `PendenciaDaPeca` | — |

**Estados.** `na_fila`, `preparando`, `aguardando_confirmacao`, `rodando`, `em_revisao`, `aceita`, `desfeita`, `cancelada`, `falhou`. Viva (a peça é somente leitura): os cinco primeiros. "Aceita em parte" não é estado: é o `resultado` gravado (`aceita`, `aceita_em_parte`, `desfeita`, `sem_alteracao`), que fecha o registro de custo do ADR 029. `fim` diz como o trabalho parou: os fins do ciclo mais `interrompida` (queda ou desligamento do worker).

| Como o trabalho parou | Com lote gravado | Sem lote |
|---|---|---|
| Entregou | `em_revisao` | `aceita` (nada a revisar) |
| Cancelada pelo designer | `em_revisao`, `fim: cancelada` | `cancelada` |
| Erro, teto de tempo, de custo ou de passos, teto diário | `em_revisao`, com o `fim` e o código | `falhou` |
| Queda ou desligamento do worker | `em_revisao`, `fim: interrompida` | `falhou`, erro `interrompida` |

**Banco** (migração `20261003090000_tarefas_do_otto`, com `down.sql`). `tarefas_do_agente`, `entradas_de_tarefa` (o texto do pedido e o briefing: dado de uso, só `SELECT` e `INSERT`, mais `UPDATE` da coluna de ajustes), `eventos_de_tarefa` e `chamadas_ao_modelo` (só `SELECT` e `INSERT`), `pendencias`, e `consumo_diario_do_modelo` (contador da plataforma: dia, tokens, chamadas, quanto resta no fornecedor; sem conta e sem conteúdo, exceção `contador-global` no teste de isolamento). Todas as outras com `conta_id` e RLS com `FORCE`. Dois índices únicos parciais são a regra de concorrência: **uma tarefa viva por documento** (`documento_id` onde o estado é vivo) e **uma tarefa trabalhando por conta** (`conta_id` onde o estado é `preparando` ou `rodando`). A segunda tarefa na mesma peça é recusada pelo banco, não por contagem.

**Fila.** `tarefa-do-otto`, fila própria com concorrência própria (`TAREFAS_AO_MESMO_TEMPO`, padrão 2 por worker): tarefa longa não ocupa vaga de exportação. O trabalho leva só `{ contaId, id }`. Justiça entre contas como na exportação (quem tem menos na fila passa na frente; `group` do pg-boss por conta). Conta ocupada devolve `'adiar'` e volta em 5 s sem gastar tentativa. Teto de uma hora, sinal de vida de 60 s. **Entregar de novo não roda o ciclo de novo**: só a tarefa em `na_fila` começa (atualização condicional), então as 3 tentativas servem para o trabalho que falhou antes de começar.

**As duas partes e o "pode".** A primeira parte (entender, direção, plano) roda num trabalho. Se o ciclo pede confirmação, a tarefa vai para `aguardando_confirmacao` com o preparo gravado e **nada fica na fila nem rodando**: a espera não tem prazo e não custa. `aprovar` devolve a tarefa à fila na fase de execução; `ajustar` guarda o texto e manda a primeira parte rodar de novo; `cancelar` fecha. Sem pedido de confirmação (o ajuste pontual), a execução segue no mesmo trabalho.

**A regra do "pode" é do servidor.** Além do estado (sem preparo aprovado, a fase de execução não existe: há um `CHECK` no banco), cada lote passa de novo pela guarda do plano (`criarGuarda`, de `@otto/agente`) **na porta `aplicarLote` do worker**, com a árvore de antes e a de depois dentro da transação do lote. Lote que cria prancheta fora do plano, toca uma segunda prancheta num ajuste ou remove o que o plano não lista é recusado mesmo que o ciclo o mande. Há um teste com um ciclo hostil injetado.

**O ciclo no worker.**

- Cada lote é uma transação curta em `CasosDeUsoDeDocumento.aplicarLoteDoAgente`: autoria `agente`, id da tarefa, idempotente pelo id do lote, arquivos conferidos contra a conta. Só entra enquanto **essa** tarefa está `rodando` naquela peça. Nenhuma transação fica aberta durante chamada ao modelo.
- A tarefa é uma unidade do histórico: o desfazer do editor volta para antes do primeiro lote dela, e "desfazer tudo" é um lote de reversão ligado à tarefa. Nada é apagado.
- A peça é somente leitura para o designer enquanto a tarefa vive: `409 documento_em_tarefa`, ou `409 revisao_pendente` em revisão. `DocumentoAberto` traz `tarefaAtiva` e, em revisão, `conjuntoPendente`; a lista de peças traz `tarefa`.
- Cada evento do ciclo é gravado em `eventos_de_tarefa` antes de ser mostrado; etapa e etapas previstas ficam também na linha da tarefa.
- **Cada chamada ao modelo grava uma linha em `chamadas_ao_modelo`** (papel, modelo, tokens de entrada, de cache lido e criado, de saída, imagens, duração, resultado), inclusive a que falha, e soma no contador do dia. O total fica na tarefa, com o custo em milionésimos de dólar pelo preço que o modelo declara.
- O worker abre o escopo pela conta do trabalho e relê a tarefa sob RLS. Não achou: `'ignorada'`, e nada roda.
- Render, resumo e verificação vêm da porta `BancadaDoOtto` (adaptador com CanvasKit, variante completa, que codifica JPEG). Fontes: todas as da biblioteca. Imagens: só as da conta.

**Cancelar, cair e desligar.**

| Caso | O que acontece | Medido em 2026-10-02 |
|---|---|---|
| Cancelar na fila ou no "pode" | Fecha na hora, sem alteração | — |
| Interromper com a tarefa trabalhando | A API grava o pedido; o worker o vê no sinal de vida (a cada 2 s) e aborta a chamada em curso. Com lote: revisão | — |
| Desligamento (deploy) | `interromperTudo()` antes de parar a fila: aborta as chamadas, cada tarefa grava o próprio fecho como `interrompida` (espera até 8 s) | Worker empacotado (`node dist/worker.mjs`), `docker stop` com 2 lotes gravados: parou em 0,6 s, tarefa em `em_revisao`, `fim: interrompida`, 2 lotes |
| Queda (worker morto) | Sem sinal de vida por 60 s, a tarefa é fechada como `interrompida` na próxima leitura da conta (abrir a peça, consultar, listar, criar tarefa) | Workers derrubados com 2 lotes: fechada 61 s depois, `em_revisao`, 2 lotes |

Não há job de manutenção: a baixa é feita na leitura, por conta (a varredura global atravessaria o RLS). Em desenvolvimento, `tsx watch` mata o processo sem dar tempo ao desligamento: lá, o que se vê é sempre o caso da queda. "Tentar de novo" desfaz o parcial e cria outra tarefa com a mesma entrada.

**Limites.** Por conta: `TAREFAS_POR_DIA_POR_CONTA` (30) e `TAREFAS_NA_FILA_POR_CONTA` (3). São limites operacionais, não plano comercial. Da plataforma: `TETO_DIARIO_DE_TOKENS` (40 milhões, abaixo dos 45 milhões do fornecedor) e `RESTO_MINIMO_NO_FORNECEDOR` (3 milhões; o adaptador do modelo anota o que o fornecedor diz que resta a cada resposta). Conferidos **antes de aceitar** a tarefa (`429 limite_diario`: parar no meio custa mais que recusar) e **antes de cada chamada** (a tarefa fecha com o que já fez e o código `limite_diario`). O dia é UTC.

**Fluxo de eventos.** `id` = sequência, `event` = tipo, `data` = o evento do ciclo. `event: tarefa` (sem `id`) traz a fotografia quando ela muda. Comentário de batimento a cada 15 s. Quando a tarefa para de andar (inclusive no "pode"), `event: fim` com `{ estado }` e o servidor fecha; depois de aprovar, o editor abre de novo com `Last-Event-ID`. Depois de 30 minutos o servidor fecha sem `fim` e o navegador reconecta sozinho. A leitura é da tabela, por consulta a cada 500 ms (uma leitura leve por volta), e não por `NOTIFY`: trocar é mudança de um arquivo (`fluxo-de-eventos.ts`).

**ADR 031.** O texto do pedido, o briefing e os ajustes do plano ficam em `entradas_de_tarefa`; resumo, pendências e eventos ficam nas tabelas da conta. Nada disso vai para log nem para evento de uso. Eventos de uso: `tarefa_pedida` (tipo, esforço), `tarefa_confirmacao` (pode, ajustar, cancelar), `tarefa_terminada` (estado, fim, código do erro, lotes, recusados, chamadas, tokens, imagens, voltas, duração, custo, conferida) e `tarefa_decidida` (resultado). A suíte `log-sem-conteudo` roda uma tarefa com frases sentinela no briefing, no pedido e no ajuste, mais o que o Otto escreveu na peça, e procura tudo isso no log. O fluxo para o editor leva conteúdo (operações, nomes, texto): é o editor do dono, e passa pelo RLS.

**O modelo.** Porta `ModelosDoOtto` com dois adaptadores e um contrato comum: `claude` (o adaptador de `@otto/agente`, inferência na DigitalOcean) e `roteirizado` (reproduz as tarefas gravadas em `packages/agente/roteiros`, escolhidas pelo **tipo** da entrada: ajuste → `ajuste-titulo`; os demais → `briefing-dois-formatos`). `MODELO_DO_AGENTE` escolhe; produção não sobe com o roteirizado. **Só o worker recebe a chave** (`MODELO_CHAVE`): a API lê a configuração sem o modelo.

**Medições de 2026-10-02.**

| O quê | Resultado |
|---|---|
| Tarefa roteirizada de briefing pela API (pg-boss, dois workers, roteiro a 0,05×) | Primeira parte para no "pode" com o plano (Feed e Story); com o "pode", 24 s, 32 eventos, 5 lotes do Otto, `em_revisao`; editar no meio responde 409; "desfazer tudo" deixa a peça vazia na versão 6, com os 6 lotes no histórico |
| Ajuste pontual com Claude (Sonnet 5) pela API, uma vez | 13,1 s do pedido ao fim do fluxo (10,9 s de ciclo); 3 chamadas; entrada 6 + 24.005 de cache lido + 13.309 de cache criado; saída 542; 2 imagens; US$ 0,0435; 1 lote; conferida |
| Do pedido ao começo do trabalho | Perto de 2 s (a consulta periódica do pg-boss) |
| Resto do limite diário no fornecedor depois dessa chamada | 4,33 milhões de tokens (as medições do treinador no mesmo dia gastaram o resto) |

**O que mudou em relação às seções 7.5 e 8.**

| Plano | Implementado |
|---|---|
| Fila `tarefa-do-agente`, zero tentativas, job de manutenção com 20 minutos sem sinal | `tarefa-do-otto`, 3 tentativas que não repetem o ciclo, baixa na leitura com 60 s sem sinal |
| Estados sem `preparando`; `aceita_em_parte` como estado | `preparando` e `aguardando_confirmacao` existem; aceita em parte é `resultado` |
| `fim` no fluxo leva a `Tarefa` | `event: tarefa` leva a fotografia; `fim` leva só `{ estado }` |
| `NOTIFY` com uma conexão de escuta | Consulta à tabela a cada 500 ms por conexão aberta |
| `409 tarefa_fora_de_revisao`, `400 pedido_vazio` | `409 tarefa_fora_do_estado` (com o estado), `400 pedido_invalido` (com os campos) |
| Decorador da porta `ModeloDoAgente` grava o custo | O ciclo já chama `registrarChamada` por chamada; o decorador do servidor é o do teto diário |
| Render para o modelo em thread | No laço principal do worker (décimos de segundo por render) |

**Em aberto.**

- O fluxo por consulta custa uma leitura a cada 500 ms por painel aberto. Serve para o MVP; com muitas conexões, `NOTIFY`.
- Render e verificação da tarefa rodam no laço principal do worker. Uma prancheta grande segura o processo por décimos de segundo; o sinal de vida atrasa, não se perde. Se pesar, vai para thread como a exportação.
- A baixa da tarefa cujo worker caiu não emite `tarefa_terminada` (as linhas de `chamadas_ao_modelo` existem; o evento de uso, não).
- ~~Tarefa em `na_fila` cujo trabalho se perdeu fica na fila até o designer cancelar.~~ Resolvido na fatia 4 (17.12): o trabalho é publicado de novo.
- `lotes_de_operacoes.tarefa_id` não tem chave estrangeira para `tarefas_do_agente`.
- Pendência não se resolve sozinha quando o designer corrige a camada: só dispensar e reabrir.
- A "faixa de tempo típica" que o plano de experiência pede antes de enviar não existe: faltam dados (uma medição por tipo).
- ~~Com o modelo roteirizado, o resto anotado do fornecedor continua valendo no dia.~~ Resolvido na fatia 4 (17.12): com o roteirizado, os tetos de tokens não recusam.
- O roteiro de briefing não traz contagem de tokens (o de ajuste traz): rodar o roteirizado não exercita o custo de uma tarefa grande.
- Sem prova: tarefa de briefing com Claude pela API (proibida nesta rodada por custo; o treinador mediu fora da API), duas tarefas longas de contas diferentes no mesmo worker, e o comportamento do fluxo atrás de um proxy que não seja o Caddy do `compose`.

### 17.12 Fatia 4: briefing, marcas, banco de imagens, fontes sob demanda e texturas

**Onde está o contrato.** `packages/shared/src/briefing.ts`, com as rotas no cabeçalho. O editor não conhece banco de imagens nem catálogo de fontes pelo nome: mostra o `nome` que o servidor devolve e manda de volta o `id` (ADR 020; o teste de fronteira acusa nome de fornecedor fora de `adaptadores/` e da configuração).

**Rotas novas.**

| Rota | Resposta | Recusas |
|---|---|---|
| `POST /api/documentos/:id/tarefas` com `{ tipo: "briefing", briefing: FormularioDeBriefing, cuidado?, briefingId? }` | `202 Tarefa` | `400 pedido_invalido` (com o campo), `422 marca_desconhecida`, `422 arquivo_desconhecido` (com `quantos`), e as da tarefa |
| `GET`, `POST /api/marcas`; `GET`, `PUT`, `DELETE /api/marcas/:id` | `Marca`, `ListaDeMarcas`, `204` | `422 arquivo_desconhecido`, `429 limite_de_cadastros` |
| `GET`, `POST /api/briefings`; `GET`, `PUT`, `DELETE /api/briefings/:id` | `BriefingSalvo`, `ListaDeBriefings` (sem os dados), `204` | `422 marca_desconhecida`, `422 arquivo_desconhecido`, `429 limite_de_cadastros` |
| `GET /api/imagens/busca?q=&orientacao=` | `ResultadoDaBuscaDeImagens`, com a origem | `503 banco_de_imagens_indisponivel`, `429 limite_de_imagens` |
| `GET /api/imagens/:banco/:id/previa` | Os bytes da prévia, pelo servidor | `404` se o id não veio de busca |
| `POST /api/imagens/trazer` com `{ banco, id }` | `201 ImagemTrazida` (arquivo da conta, origem, `no` para `criarNo`) | `422 imagem_nao_buscada`, `429 limite_de_imagens`, `503` |
| `GET /api/texturas`; `POST /api/texturas/:nome/trazer` | `ListaDeTexturas`; `201 TexturaTrazida` | `404` |
| `GET /api/arquivos/:sha256/dados` | `DadosDoArquivo` (espécie, medidas, nome, origem) | `404` |
| `GET /api/vetores/:sha256` | `VetorImportado`, com a miniatura | `404` |
| `GET /api/fontes?q=&categoria=&catalogo=1` | `ListaDeFontes`; com `catalogo`, também o que ainda não foi baixado | — |

**Formulário de briefing.** `FormularioDeBriefing` (versão 1) é fechado: campo a mais é recusado. Obrigatórios: título, de um a três formatos com nomes diferentes, e de onde vêm as imagens (`minhas`, `banco` ou `nenhuma`). Imagem, logo e ícone entram pelo hash de um arquivo que a conta já enviou; nenhum campo aceita endereço. O cuidado tem três opções (`direto`, `cuidadoso`, `autoral`) e o servidor traduz para o nível do ciclo com a tabela do treinador (`esforcoDaOpcao`, em `@otto/agente`).

São dois momentos, de propósito:

| Quando | Onde | O que faz |
|---|---|---|
| Criação | API (`BriefingParaOOtto.preparar`) | Confere que a marca e os arquivos são da conta; aplica a marca ao formulário (identidade, logo, ícones, rodapé e restrições que o formulário não trouxe; o que ele trouxe vence). **O que fica guardado em `entradas_de_tarefa` é o formulário**, só com referências: é pequeno, e é o que "nova peça com este briefing" devolve (`briefingDaTarefa`) |
| Execução | Worker (`paraOCiclo`) | Troca as referências pelo material que o ciclo lê: nó de imagem com as medidas, o desenho do logo (relido do SVG guardado). Cada arquivo é relido sob a conta do trabalho |

A marca é copiada para o formulário no momento do pedido: apagar ou mudar a marca depois não muda a tarefa. Marca sem identidade não inventa identidade: o material diz "não definida". A forma do material é a da POC (`paraOAgente`, em `Briefing.tsx`), que é a que o ciclo espera.

O briefing solto (sem `versao`), que é como os roteiros gravados chegam, continua aceito **fora de produção**, com o mesmo teto de três formatos. Em produção só entra o formulário.

**Marcas e briefings salvos.** Tabelas `marcas` e `briefings`, com `conta_id` e RLS com `FORCE`. Só o nome da marca é obrigatório. O briefing salvo guarda o formulário pela metade (`RascunhoDeBriefing`). Apagar a marca não apaga o briefing: a chave estrangeira anula o vínculo (`ON DELETE SET NULL (marca_id)`). A tarefa guarda o briefing salvo de origem (`briefing_id`) e ele conta os usos. Limites: 200 marcas e 500 briefings por conta, contados e criados na mesma transação. Tudo aqui é conteúdo (ADR 031): o evento de uso leva contagens (`marca_salva`: quantas cores, fontes, ícones, restrições). "Resultado aceito vira briefing" não precisa de rota: o editor lê o formulário da tarefa e o salva.

**Banco de imagens (ADR 032).** Porta `BancoDeImagens`, com o adaptador do Pixabay e um falso, e teste de contrato nos dois (o do Pixabay contra uma resposta gravada). O caso de uso cumpre as regras do banco:

| Regra | Como |
|---|---|
| Cache de 24 h | Tabela `buscas_de_imagens`, da plataforma (sem `conta_id`, exceção `catalogo-global`): a chave é o SHA-256 de banco, consulta normalizada e orientação. **O texto da busca não é guardado.** Só cresce |
| Link direto proibido | `trazer` baixa para o armazenamento da conta, como arquivo comum (tipo conferido pelo conteúdo, limites de tamanho). O nó do documento leva hash, banco, autor e licença, com `url` vazia; a página da imagem fica na linha do arquivo |
| Só id que veio de busca | O endereço baixado sai do cache do servidor, nunca do pedido. Sem busca nas últimas 24 h: `422 imagem_nao_buscada`. O adaptador só baixa dos hosts do banco, em https, sem seguir redirecionamento, com teto de bytes |
| Origem sempre à vista | Vem em toda resposta de busca e de `trazer`, e em `GET /api/arquivos/:sha256/dados` |
| Nada em massa | Por conta: 100 imagens por dia e 20 buscas novas por minuto (o que vem do cache não conta). Por tarefa do Otto: 8 buscas e 6 imagens |
| A chave | `PIXABAY_API_KEY`, só na configuração. Vai na query da busca, então nenhum erro do adaptador carrega endereço nem resposta: só um código |

A prévia sai pelo servidor (`GET /api/imagens/:banco/:id/previa`): o navegador não fala com o banco. O Otto usa o mesmo caso de uso, com a origem `otto` no evento.

**Fontes sob demanda.** Porta `CatalogoDeFontes`, com o adaptador do Google Fonts e um falso. Uma família que não está na biblioteca e está no catálogo é trazida na primeira vez em que é pedida: os pesos de 300 a 700 que ela tem. O nome PostScript e a licença são lidos do próprio arquivo. Dois gatilhos: `GET /api/fontes/:familia/:peso` (o editor) e o lote que cita a família (`garantir`, antes de travar a peça: é rede, não cabe na transação). Quem lê fonte (medidor, bancada, exportação) continua lendo só da biblioteca. O catálogo fica guardado por 7 dias no armazenamento da biblioteca. `CATALOGO_DE_FONTES=nenhum` (o padrão do código) não vai à rede.

**Texturas.** As seis da POC, redesenhadas com o CanvasKit (a receita é a mesma; os pixels não são os da POC). São geradas pela semeadura (ou pelo worker, se faltar) e guardadas no armazenamento da biblioteca; a API não desenha. Para entrar numa peça, a textura vira arquivo da conta.

**Arquivo enviado.** O vetor volta com a miniatura do que foi entendido: um SVG montado pelo servidor a partir dos caminhos já validados (só `<svg>` e `<path>`), sem render. A ampliação por formato é a função `ampliacoesPorFormato`, em `@otto/shared`, sobre as medidas que o envio já devolve.

**Portas do ciclo ligadas.** `imagens` (se há banco configurado), `texturas`, `fontes.buscar` (se há catálogo) e `previaDeArquivo`. Ausente a configuração, o ciclo nem recebe a ferramenta.

**Peça de exemplo.** `semear` cria uma peça em camadas na conta (um lote de operações do catálogo), uma vez: `documentos.de_exemplo` marca, e a peça apagada não volta.

**Pendências da fatia 3, resolvidas.**

- A lista de peças e `tarefaAtiva` trazem `fim`.
- Limite diário da conta: o padrão do código continua 30; o `compose` de desenvolvimento usa 1.000. Com o modelo roteirizado o teto de tokens e o resto do fornecedor não recusam nem são somados (a API recebe `MODELO_DO_AGENTE`, sem a chave).
- Tarefa parada na fila: depois de 5 minutos o trabalho é publicado de novo, uma vez por intervalo, na leitura da conta. Publicar de novo não roda o ciclo duas vezes.

**Medições de 2026-10-02, pela API.**

| O quê | Resultado |
|---|---|
| Busca no Pixabay | 0,33 s; a mesma busca de novo, 8 ms (cache); 12 resultados, nenhum endereço do banco na resposta |
| Trazer uma imagem | 0,34 s; 853 × 1280, 183 KB, no armazenamento da conta, com banco, autor e licença |
| Fonte do catálogo (Oswald) | 2,8 s na primeira vez (5 pesos, 432 KB); 10 ms depois |
| Tarefa roteirizada pelo formulário, com marca e briefing salvo | Para no "pode" com Feed e Story; com o "pode", 21 s, 5 lotes, em revisão |

**Em aberto.**

- O Otto usando o banco de imagens numa tarefa de verdade não foi rodado (briefing com Claude estava fora desta rodada). O que há é teste da porta com o ciclo trocado e a busca de verdade pela rota do editor.
- O relatório de exportação lista banco, autor e licença de cada imagem, com o endereço vazio: a página da imagem está no arquivo da conta e não é lida na exportação.
- O cache de busca só cresce; não há limpeza das linhas vencidas.
- O texto da busca não é guardado em lugar nenhum (o ADR 032 o trata como dado de uso de acesso restrito).
- O teto de buscas novas por minuto é por processo.
- Fonte: a rota é aberta e traz no máximo 60 famílias novas por hora por processo; só os pesos de 300 a 700; família já na biblioteca com menos pesos não é completada pelo catálogo.
- Leitura do site da marca, recorte de sujeito e chave própria de banco de imagens: fora.
- Texto público a revisar: os textos da peça de exemplo e as descrições das texturas.
