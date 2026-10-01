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

## 17. O que mudou na implementação (fatias 0 e 1)

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
