# MVP: plano de frontend

Status: proposta, para consolidar com `docs/mvp/backend.md` e `docs/mvp/experiencia.md`
Data: 2026-10-01
Dono: especialista-react
Origem: decisão do Felipe de 2026-10-01 de levar a POC (`poc/`) para o MVP, com Docker

> **Nota de 2026-10-01, depois das decisões do Felipe ([ADR 035](../decisoes/035-da-poc-ao-mvp-com-docker.md) e [README](README.md)).** Este plano foi escrito antes delas e ficou vencido em quatro pontos: (1) o motor do MVP é o CanvasKit, não o Canvas 2D da POC atrás da porta; a porta está em `docs/tecnico/spike-render.md`, seção 11.2, e a imagem entra no motor como bytes; (2) não há `/entrar` nem sessão por enquanto; (3) a ordem das fatias é a do README, com exportar antes da tarefa do Otto; (4) as rotas e a disposição do editor são as de `experiencia.md` (`/editor/p/:id`, Otto à esquerda, Propriedades e Camadas à direita). A fatia 0 do web está em `apps/web`; o resto do plano (estado em três partes, fila de lotes, guardas, textos) vale como está.

Quando este plano foi escrito, `docs/mvp/backend.md` e `docs/mvp/experiencia.md` ainda não existiam. O que depende deles está nas seções 11 e 12, e a arquitetura abaixo foi desenhada para tela e contrato poderem mudar sem reescrever o núcleo do editor.

Este plano não decide nada que é de outro dono: o motor de render é do especialista-grafico (seção 4), o contrato da API é do especialista-backend, a tela é do especialista-ui-ux. As decisões que cabem ao Felipe estão na seção 13.

## 1. O que a POC ensina e o que ela esconde

Três coisas da POC valem ouro e entram no MVP como estão no desenho:

1. **Todo gesto vira lote do catálogo**, aplicado no navegador com o mesmo `aplicarLote` do servidor e confirmado pela API (`estado.tsx`, função `aplicar`).
2. **O campo de propriedade só confirma no Enter ou ao sair** (`Propriedades.tsx`, componente `Campo`): um lote por confirmação, não um por tecla.
3. **A revisão do conjunto de alterações**: marca em âmbar, aceitar, desfazer tudo, segurar para ver o antes (`PainelDoOtto.tsx`).

Cinco coisas da POC não sobrevivem a documento grande nem a conta de verdade. Foram lidas no código, não supostas:

| # | O que acontece hoje | Onde | Consequência |
|---|---|---|---|
| 1 | Um contexto React só carrega documento, seleção, tarefa e erro. Qualquer mudança re-renderiza canvas, camadas e propriedades inteiros | `estado.tsx` | Não chega a 60 quadros com 200 camadas |
| 2 | Arrastar gera um documento novo a cada movimento do mouse (`comDeslocamento`), e ele recria **todas** as pranchetas. O cache de composição é indexado pelo objeto da prancheta, então **todas as pranchetas são recompostas a cada movimento**, não só a que tem a camada arrastada | `Canvas.tsx`, linhas 48 a 59, 73 e 134 | É o limite conhecido do README, e é pior do que o README descreve |
| 3 | `aplicarLote` começa com `structuredClone(doc)`: depois de qualquer lote, nenhum nó mantém a referência anterior | `documento/operacoes.ts`, linha 507 | Cache por prancheta e seletor por nó perdem a validade a cada lote, mesmo o que não tocou neles |
| 4 | Toda resposta da API devolve o registro inteiro: documento, histórico com todas as operações e todas as tarefas com todos os eventos. O fluxo de eventos da tarefa reenvia a tarefa inteira e o documento inteiro a cada lote | `api.ts`, `servidor.ts` | Custo quadrático em tarefa longa (as da POC têm de 14 a 49 chamadas) |
| 5 | O navegador importa `servidor/esforco.ts` em tempo de execução para ler os rótulos dos níveis. O mesmo objeto carrega texto de prompt (`criteriosAutorais`, `paraODiretor`). O formulário também monta a mensagem para o agente (`paraOAgente` em `Briefing.tsx`) e o painel guarda pedidos prontos (`ATALHOS`) | `SeletorDeEsforco.tsx`, `PainelDoOtto.tsx`, `Briefing.tsx` | Texto de prompt vai no pacote do navegador, e o frontend vira dono de instrução ao agente. No MVP isso é do servidor e do treinador-do-otto |

## 2. Estrutura de `apps/web`

Next.js com App Router, um app só, com a fronteira do ADR 019. Tudo que exige sessão mora no segmento `/editor`, para existir **uma** fronteira a vigiar.

```
apps/web/
  Dockerfile
  next.config.ts          output standalone, transpilePackages, reescrita de /api no desenvolvimento
  middleware.ts           sem cookie em /editor → /entrar. Não é autorização (ADR 019, item 5)
  public/                 favicon e imagem de Open Graph. Nada do motor
  src/
    app/
      layout.tsx          servidor. <html lang="pt-BR">, fontes da interface. Nenhum provedor de cliente
      (site)/
        layout.tsx        dynamic = 'error'
        page.tsx          estática
      entrar/page.tsx     dinâmica, noindex
      editor/
        layout.tsx        servidor. force-dynamic, robots noindex. Provedores de cliente moram AQUI
        page.tsx          servidor. Lista de documentos da conta
        novo/page.tsx     servidor, com o formulário de briefing (cliente) dentro
        [documentoId]/
          page.tsx        servidor. Só monta o carregador
          loading.tsx · error.tsx · not-found.tsx
      robots.ts · sitemap.ts
    editor/               todo o editor. Nada daqui é importado por (site)
      Editor.tsx          casca: topo, coluna esquerda, centro, coluna direita
      nucleo/             TypeScript puro, sem React (seção 3)
      canvas/             casca React fina, controlador de gestos, sobreposições, porta do motor (seção 4)
      paineis/            camadas, propriedades, otto, historico
      briefing/ · exportar/
    api/                  cliente HTTP tipado, fluxo de eventos, erros
    textos/               todo texto visível (seção 9)
    ui/                   primitivos comuns ao site e ao editor (botão, campo, diálogo)
    estilos/              tokens.css, editor.css
  testes/                 teste de pacote (sentinela) e testes de navegador
```

### Rotas

| Rota | Renderização | Para quê |
|---|---|---|
| `/` e demais páginas de `(site)` | Estática, gerada no build | Site público. No MVP, uma página e, se o Felipe quiser, termos de uso |
| `/entrar` | Dinâmica, noindex | Entrada na conta. A forma depende do backend |
| `/editor` | Dinâmica, componente de servidor | Lista de documentos, com estado da tarefa de cada um |
| `/editor/novo` | Dinâmica | Formulário de briefing, o caminho padrão para criar (ADR 033). Deixa de ser modal sobre o editor |
| `/editor/[documentoId]` | Dinâmica, casca no servidor e editor só no cliente | O editor |

Os nomes das rotas são proposta. Se o especialista-ui-ux desenhar outra navegação, o que não muda é: tudo que exige sessão fica sob um segmento só.

### Servidor e cliente

- **Componente de servidor:** os layouts, o site, a lista de documentos (busca a API repassando o cookie de sessão, sem cache) e as cascas das páginas. Nenhum deles importa nada de `src/editor/`.
- **Componente de cliente:** o formulário de briefing, as ações da lista (criar, renomear, apagar) e o editor inteiro.
- **O editor não é renderizado no servidor.** A página monta um carregador de cliente que faz `import()` dinâmico da casca do editor com `ssr: false`. O documento é buscado pelo cliente, em paralelo com o motor e as fontes, para não haver cascata nem documento duplicado no HTML.
- **Mutação tem um caminho só:** o cliente HTTP de `src/api/`. Sem Server Actions para escrever na API. Dois caminhos de escrita são dois lugares para errar a sessão.

### Como o motor e o editor ficam fora do pacote público

1. O motor é carregado por `import()` dinâmico, de dentro de `src/editor/canvas/`, depois que a casca do editor montou. O arquivo `.wasm` do CanvasKit, quando existir, é servido como arquivo estático versionado, buscado em tempo de execução só por esse código.
2. `dynamic = 'error'` no layout de `(site)` quebra o build se alguma página pública ler cookie ou buscar sem cache.
3. **Teste de pacote por sentinela.** O ADR 019 pede um teste que leia `app-build-manifest.json`. Proponho um teste que não dependa do formato do manifesto (ele muda com o empacotador): `src/editor/Editor.tsx` e `packages/render` exportam cada um uma constante de texto única. Depois do build, o teste abre o HTML gerado de cada rota de `(site)`, segue os scripts referenciados e falha se achar a sentinela ou a extensão `.wasm` em qualquer um. Roda no CI e dentro do estágio de build da imagem.
4. No navegador, um teste confere que abrir `/` não faz nenhuma requisição a `.wasm`.

### Origem única

O navegador fala com a API na **mesma origem** (`/api/...`). Cookie de sessão `httpOnly` funciona sem CORS e o fluxo de eventos também. No desenvolvimento, uma reescrita do Next encaminha `/api` para o contêiner da API. Em produção, o roteamento por prefixo é da infraestrutura. O componente de servidor usa o endereço interno da API por variável de ambiente.

## 3. Estado do editor

Três estados, com donos diferentes. Nenhum deles é um contexto React com tudo dentro.

| Estado | Onde vive | Quem lê |
|---|---|---|
| **Documento** (árvore, versão, lotes por confirmar) | `SessaoDoDocumento`, TypeScript puro em `editor/nucleo/` | Canvas por assinatura direta; painéis por seletor |
| **Tarefa do Otto** (estado, passos, conjunto de alterações) | `TarefaDoOtto`, TypeScript puro, alimentada pelo fluxo de eventos | Painel do Otto, marca nas camadas, sobreposição no canvas |
| **Interface** (seleção, câmera, ferramenta ativa, painel aberto, comparando) | Store leve | Canvas por assinatura direta; painéis por seletor |

Recursos que não são o documento (catálogo de fontes, briefings salvos, relatório de exportação, dados da sessão) ficam num cache de consulta, com provedor no layout de `/editor`. O documento nunca entra nesse cache.

React lê os três por `useSyncExternalStore` com seletor estreito: `useNo(id)`, `useLinhasDeCamadas()`, `useSelecao()`, `useEstadoDaTarefa()`. O painel de propriedades assina só o nó selecionado. O canvas não passa pelo React.

### 3.1 Documento: do registro inteiro à sessão com fila

A sessão guarda três coisas:

- `confirmado`: o documento na última versão que a API confirmou, com o número da versão.
- `pendentes`: os lotes aplicados aqui e ainda não confirmados, em ordem, cada um com um id gerado no navegador.
- `visivel`: `confirmado` com os pendentes aplicados. É o que canvas e painéis mostram.

Fluxo de um gesto:

1. O gesto monta um lote e chama `aplicar`. A sessão valida e aplica com `packages/documento`. Se falhar aqui, mostra o motivo e nada sai do navegador.
2. O lote entra na fila. A fila envia **um por vez, em ordem**, com o id do lote e a versão base.
3. A API confirma com a versão nova. A resposta **não** traz o documento.
4. Se a API recusar por validação, a sessão descarta aquele lote e os que vieram depois dele (foram feitos em cima dele), volta ao confirmado e mostra o motivo. Se recusar por versão, busca o documento de novo.

O id gerado no navegador torna o reenvio seguro: se a rede cair depois do envio, mandar de novo não aplica duas vezes.

**Operação que depende de medida de texto** (`alinhar` e `distribuir` medem pela tinta). Navegador e servidor podem medir diferente enquanto o motor for Canvas 2D. Para esses lotes a resposta da API precisa trazer os nós tocados como ficaram no servidor, e a sessão adota o valor do servidor. Sem isso, a camada "pula" depois da confirmação.

**Salvamento.** Não há botão de salvar: cada lote confirmado está salvo. A interface mostra um estado só, derivado da fila: salvo, salvando, sem conexão com N alterações por enviar, ou não salvo com motivo. Com pendentes na fila, fechar a aba pede confirmação. Fila guardada no disco do navegador para trabalhar sem rede fica para depois.

**Histórico único com autoria.** O histórico deixa de vir embutido no documento. É uma lista paginada da API, com autoria `designer` ou `agente` e o id da tarefa. Os lotes de uma tarefa aparecem agrupados como uma entrada: o conjunto de alterações.

**Desfazer e refazer.** Hoje desfazer é uma ida à API que devolve o registro inteiro, e refazer não existe. No MVP o designer espera Ctrl+Z e Ctrl+Shift+Z imediatos. O caminho que deixa os dois otimistas é `aplicarLote` devolver o **lote inverso**: desfazer vira um lote como outro qualquer, passa pela mesma fila e o histórico continua linear. Isso é decisão do especialista-grafico com o backend. Enquanto não existir, desfazer continua indo à API e esperando a resposta, como na POC.

**Identidade dos nós.** Com `structuredClone` em todo lote, seletor por nó não adianta. Preciso que `packages/documento` preserve a referência do que não foi tocado. Enquanto isso não vem, a sessão reconcilia: usa a lista `tocados` que `aplicarLote` já devolve para reaproveitar as referências antigas de pranchetas e nós não tocados. É um remendo aceitável para a primeira fatia de edição.

### 3.2 Tarefa do Otto

O estado da tarefa é uma união discriminada, não um punhado de booleanos:

```
na fila → trabalhando → em revisão → aceita | aceita em parte | desfeita
                     ↘ interrompida | não terminou
aguardando o "pode" (antes de trabalhar, em tarefa grande: ADR 029, item 2)
```

- **Progresso em tempo real** por `EventSource` na mesma origem. Cada evento chega **sozinho**, com id crescente. Um evento de lote traz as operações e a versão resultante, e a sessão aplica com o mesmo `aplicarLote`. Lote com versão já aplicada é ignorado, então receber duas vezes não quebra nada.
- **Reconexão.** `EventSource` reenvia o id do último evento sozinho. A API retoma dali. Tarefa da POC dura de 14 a 30 minutos, então a conexão vai cair, e o designer vai fechar a aba. Ao abrir o documento, a API diz se há tarefa ativa ou conjunto pendente, e a tela se remonta a partir disso.
- **Enquanto o Otto trabalha, o documento fica só para leitura** para o designer (zoom, mover a vista e seleção continuam). É o que a POC faz. Evita intercalar lotes de duas autorias na mesma fila.
- **Camadas tocadas** são o conjunto dos `tocados` dos lotes da tarefa. A marca em âmbar nas camadas e no canvas lê desse conjunto e some quando o conjunto é aceito ou desfeito.
- **Ver o antes.** A API entrega o documento na versão anterior à tarefa. O editor busca ao entrar em revisão, compõe com o mesmo motor e alterna sem recompor.
- **Aceitar e desfazer em um passo** são uma chamada cada, e a resposta traz a versão nova. Desfazer tudo é a única resposta em que o editor recarrega o documento.
- **Aceitar em parte** e **o "pode"** não existem na POC. Entram em fatia própria (seção 10) e dependem de decisão (seção 13).

### 3.3 Interface

Seleção (passa a aceitar várias camadas, para Ctrl+G e alinhar), câmera, ferramenta ativa e painéis abertos. A câmera sai do estado do React: mover a vista e dar zoom não re-renderizam componente nenhum. O indicador de zoom assina a câmera.

Atalhos numa tabela só (`nucleo/atalhos.ts`), ignorados quando o foco está em campo de texto: V, M, T, Delete, setas e Shift+setas, Ctrl+Z, Ctrl+Shift+Z, Ctrl+J, Ctrl+G, Ctrl+Shift+G, Alt+arrastar, espaço para a mão, Shift+1 para enquadrar. A lista final é do especialista-ui-ux.

## 4. Canvas: a porta de que o editor precisa

A troca do Canvas 2D da POC pelo CanvasKit do ADR 030 é do especialista-grafico e é **dependência**, não tarefa deste plano. Para a troca não reescrever a interface, o editor fala com o motor por uma porta definida pelo lado de quem consome. Proposta, a fechar com o especialista-grafico:

```ts
interface MotorDeRender {
  redimensionar(larguraCss: number, alturaCss: number, pixelsPorPonto: number): void;
  definirDocumento(doc: Documento, mudanca?: { tocados: ReadonlySet<string> }): void;
  /** Gesto em andamento: desloca ou redimensiona nós sem criar documento novo. null encerra. */
  definirPrevia(previa: PreviaDeGesto | null): void;
  definirCamera(camera: { x: number; y: number; zoom: number }): void;
  /** Resolve quando fontes e imagens do documento estão prontas para desenhar. */
  prepararRecursos(doc: Documento): Promise<void>;
  /** Mede pela tinta, para o aplicarLote local chegar no mesmo lugar que o servidor. */
  readonly medidor: Medidor;
  readonly contadores: { composicoesDePrancheta: number; quadros: number };
  destruir(): void;
}

function criarMotor(canvas: HTMLCanvasElement, recursos: RecursosDoRender): Promise<MotorDeRender>;

interface RecursosDoRender {
  imagem(hash: string): Promise<Blob>;
  fonte(familia: string, peso: number): Promise<ArrayBuffer>;
}
```

O que essa porta fixa:

- **O motor recebe documento, prévia e câmera, e agenda o próprio quadro.** O React não chama "desenhar".
- **Comandos sem retorno síncrono.** Com isso o motor pode ir para um Worker com `OffscreenCanvas` sem mudar o editor. A decisão de ir ou não é do especialista-grafico.
- **Teste de alvo (que camada está sob o ponteiro) e caixa de cada nó são geometria do documento**, não do motor. Ficam em `packages/documento`, rodam na linha principal e não dependem de qual motor desenha. Hoje estão em `Canvas.tsx` (`acharNoEm`), ignoram rotação e precisam ir para o pacote.
- **Sobreposições são do editor, não do motor.** Contorno de seleção, alças, marca em âmbar, rótulo da prancheta e guias da zona do story vão numa segunda camada por cima do canvas, desenhada pelo editor a partir da câmera e das caixas. Mudar a seleção não recompõe a cena, e trocar o motor não toca nessa camada.
- **Fontes e imagens entram por uma porta que o editor implementa** (busca com a sessão). O motor não conhece URL da API.
- **Contadores** permitem testar desempenho sem medir tempo (seção 6).

O primeiro adaptador embrulha o `renderizarPrancheta` da POC. O adaptador CanvasKit entra quando o spike de render terminar. Entregar o MVP com o primeiro adaptador enquanto o spike corre é decisão do Felipe (seção 13).

A casca React do canvas tem uma responsabilidade: montar os elementos, criar o motor num efeito, ligar as assinaturas (documento, câmera, seleção, tarefa) e desmontar. Os gestos ficam num controlador em TypeScript puro, ligado aos eventos de ponteiro do elemento, que só produz duas coisas: chamadas de prévia durante o gesto e **um lote** ao soltar.

## 5. Migração de `poc/src/web/`, arquivo por arquivo

| Arquivo | Linhas | Destino | O que muda |
|---|---|---|---|
| `main.tsx` | 13 | Some | Entrada passa a ser o App Router |
| `vite-env.d.ts`, `vite.config.ts` | — | Somem | O proxy vira reescrita do Next |
| `App.tsx` | 115 | **Reescrito** | Vira a casca `Editor.tsx` e a barra do topo. O seletor de documento vira a página `/editor`. O id sai do `#` do endereço e vira parâmetro de rota. O selo com o nome do modelo some (seção 9) |
| `estado.tsx` | 175 | **Reescrito** | Vira `nucleo/` (seção 3). Ficam a ideia do `aplicar` otimista e o tipo `Selecao` |
| `api.ts` | 123 | **Reescrito** | Tipos viram esquemas zod em `packages/shared`, compartilhados com a API. Cliente com resposta validada e erro com código. `projecaoSonnet5` sai da interface |
| `recursos.ts` | 90 | **Reescrito** | Vira a implementação de `RecursosDoRender`. O carregamento de fonte vai para trás do motor |
| `estilo.css` | 317 | **Quase como está**, depois fatiado | Primeiro: variáveis em `tokens.css` e o resto em `editor.css`, carregado só no layout de `/editor`. Depois, um módulo por componente, conforme cada um for tocado. As fontes da interface deixam de vir do CDN do Google e passam a ser arquivos locais |
| `componentes/Propriedades.tsx` | 596 | **Quase como está** | O padrão `Campo` é o certo. Troca `useEditor()` por seletor do nó selecionado, tira o texto para `textos/`, e o arquivo se divide por grupo (texto, forma, imagem, máscara, efeitos, filtros, ajuste, tokens, escolha de fonte) |
| `componentes/Exportar.tsx` | 105 | **Quase como está** | A tabela do relatório fica. Baixar deixa de ser link direto e vira pedido de exportação com estados (preparando, pronto, falhou) e link assinado. A comparação com o texto `'Nativo editável'` vira enumeração |
| `componentes/SeletorDeEsforco.tsx` | 18 | **Quase como está**, se entrar no MVP | Enumeração vem de `packages/shared`, rótulos de `textos/`. Nunca mais importa de código do servidor |
| `componentes/Camadas.tsx` | 251 | **Reescrito em parte** | Ficam a linha da camada e as operações que ela dispara. Mudam: seletor por linha, lista virtualizada, navegação por teclado como árvore. Importar logo, textura e camada de ajuste saem do cabeçalho e vão para um menu de inserir |
| `componentes/PainelDoOtto.tsx` | 299 | **Reescrito em parte** | Ficam o desenho de cada passo (`Evento`) e o bloco de revisão. Sai o bloco de custo. Os pedidos prontos (`ATALHOS`) viram tipos de tarefa com o texto no servidor. O histórico vira painel próprio |
| `componentes/Canvas.tsx` | 369 | **Reescrito** | Divide em casca React, controlador de gestos, câmera, sobreposições e adaptador do motor (seção 4) |
| `componentes/Briefing.tsx` | 505 | **Reescrito** | De modal para a rota `/editor/novo`. Formulário com biblioteca de formulário e esquema zod compartilhado. Briefing salvo sai do `localStorage` e vai para a conta. `paraOAgente` vai para o servidor: o navegador manda o briefing no esquema e mais nada. Campos e ordem das seções se mantêm |

**Fica para depois**, com o que já existe na POC:

- Ler a identidade pelo site da marca (`api.lerSite`): depende de navegador sem janela no servidor.
- Texturas, recorte do sujeito, camadas de ajuste prontas e editor de degradê: entram quando a fatia de edição estiver de pé e o catálogo do `packages/documento` os tiver.
- Esforço criativo: a própria POC registra que não foi medido.
- Painel de custo por tarefa: é instrumento interno, não tela de produto.

**Não existe na POC e o designer espera**: refazer, seleção múltipla, redimensionar pelas alças, reordenar camada arrastando, renomear na própria linha, duplicar (Ctrl+J), ferramentas V, M e T. Entram nas fatias 2 e 3.

## 6. Desempenho

Requisito: 60 quadros por segundo com 200 camadas (ADR 030). O que cabe ao frontend:

1. **Arrastar não cria documento.** O controlador manda `definirPrevia({ ids, dx, dy })`. O documento só muda ao soltar, com um lote `mover`.
2. **Um quadro por quadro.** Os movimentos do ponteiro são juntados e aplicados no próximo `requestAnimationFrame`.
3. **Gesto fora do React.** Arraste, câmera e zoom não passam por `useState`. Nenhum componente re-renderiza durante o gesto.
4. **Só a prancheta tocada recompõe.** Depende do item 3 da seção 1: sem identidade preservada, o cache não tem como saber o que mudou. A porta já passa `tocados` ao motor.
5. **Zoom reaproveita a composição.** Durante o gesto de zoom, a composição em cache é escalada. A recomposição na escala nova acontece quando o gesto para. Hoje cada passo da roda recompõe tudo.
6. **Teto de tamanho da composição.** A POC compõe a prancheta inteira em `pixelsPorPonto × zoom`. Com zoom de 400% num story em tela de alta densidade, isso passa de 100 megapixels. O motor precisa compor só a região visível ou ter um teto. A porta passa câmera e tamanho da área para isso.
7. **Painel de camadas virtualizado**, e painel de propriedades assinando só o nó selecionado.
8. **Imagens decodificadas fora da linha principal** (`createImageBitmap`).

O que é do motor e eu só consumo: separar a cena em "abaixo, camada arrastada, acima" no começo do gesto, para cada quadro ser três desenhos. Isso só vale quando nada acima depende do que está abaixo (modo de mesclagem, camada de ajuste, máscara de recorte). Nos outros casos o motor escolhe entre recompor em escala menor durante o gesto ou recompor só a região suja.

**Como testar sem cronômetro.** O motor expõe contadores. Um teste em Vitest, com motor falso, simula 60 movimentos de ponteiro e exige: zero chamadas a `definirDocumento` durante o gesto, no máximo uma prévia por quadro e exatamente um lote ao soltar. Isso é determinístico e pega a regressão que importa.

**O que não consigo medir hoje:** quadros por segundo de verdade. Faltam o documento de 200 camadas com efeitos (pedir ao especialista-grafico) e o motor definitivo. Proposta: uma página de bancada só de desenvolvimento, que carrega esse documento, reproduz um arraste gravado e registra o tempo de cada quadro. Medição manual num notebook comum, com o número anotado. Quadros por segundo em CI não é confiável e não vira portão.

## 7. Docker

O arquivo `compose` da raiz é comum com o backend. O que segue é o que o serviço `web` precisa.

### Desenvolvimento

O disco do repositório é **exFAT** (conferido com `df -T`): não aceita link simbólico, não distingue maiúscula de minúscula e não guarda permissão de arquivo. O pnpm cria link simbólico dentro de todo `node_modules`. Por isso:

- **Código-fonte por montagem do diretório do repositório** no contêiner.
- **Todo `node_modules` em volume nomeado do Docker**, que mora em disco do Docker e aceita link simbólico: o da raiz e o de cada pacote do workspace (`apps/web`, `apps/api`, `packages/*`). A lista é fixa e fica no `compose`.
- **`.next` também em volume nomeado.** exFAT é lento para muitos arquivos pequenos.
- **Armazém do pnpm em volume nomeado**, com cópia em vez de link físico (volumes diferentes não aceitam link físico entre si).
- **`pnpm install` roda dentro do contêiner.** O `pnpm-lock.yaml` é arquivo comum e é gravado no repositório.
- **Usuário do contêiner com o mesmo id do Felipe (1000)**, para os arquivos gravados no disco montado não mudarem de dono.
- **Pacotes do workspace consumidos pelo código-fonte** (`transpilePackages`), sem passo de build em desenvolvimento. Alterar `packages/documento` recarrega o editor.

**Recarga a quente.** Medi no host: o `fs.watch` do Node recebe os eventos de criar, alterar e apagar num diretório deste disco. O aviso de mudança funciona em exFAT. Dentro do contêiner, pela montagem, não medi. Se falhar, a saída é ligar a vigia por consulta periódica do Next. É o primeiro teste da fatia 0.

**Consequência para o trabalho no dia a dia:** o host não tem `node_modules`. Teste, verificação de tipo e Biome rodam por `docker compose exec`, inclusive quando quem roda é um agente. O editor de código do Felipe só enxerga os tipos se abrir o projeto dentro do contêiner. Ver a decisão 9 na seção 13.

### Imagem de produção

Dockerfile de vários estágios, com contexto na raiz do monorepo:

1. `deps`: copia `package.json`, `pnpm-lock.yaml` e os manifestos dos workspaces, instala. Só depois entra o código (cache de camada, ADR 019).
2. `build`: `next build` com saída `standalone` e rastreamento a partir da raiz do monorepo. Roda o teste de pacote por sentinela. Se ele falhar, a imagem não é gerada.
3. `runner`: só o `standalone`, os estáticos e `public/`. Usuário sem privilégio, `HOSTNAME=0.0.0.0`, porta pela variável `PORT`.

O build das páginas de `(site)` não pode depender da API no ar. O `dynamic = 'error'` garante.

## 8. Testes

Teste antes do código, em todo comportamento novo.

### Vitest com Testing Library

| O quê | Como |
|---|---|
| `SessaoDoDocumento` e fila de lotes | TypeScript puro, com API falsa injetada: aplicação otimista, envio em ordem, recusa que descarta os seguintes, conflito de versão, reenvio com o mesmo id, desfazer e refazer |
| `TarefaDoOtto` | Sequência de eventos falsa: transições de estado, lote repetido ignorado, retomada depois de queda, conjunto de camadas tocadas |
| Controlador de gestos | Eventos de ponteiro sintéticos e motor falso: um lote ao soltar, nada abaixo de 1 px, Esc cancela, camada bloqueada não anda, nada anda com o Otto trabalhando |
| Atalhos | Tabela de casos, com e sem foco em campo |
| Painéis | Camadas (teclado como árvore, alternar visível e bloqueado vira operação, marca do Otto, janela virtual), propriedades (um lote por confirmação, Esc restaura, desativado quando bloqueado), painel do Otto (uma tela por estado, aceitar, desfazer, segurar para ver o antes), briefing (validação, corpo enviado confere com o esquema) |
| Cliente da API | Respostas validadas por esquema, erro com código, com servidor simulado |
| Acessibilidade | Regras automáticas nos painéis e diálogos; foco preso e devolvido nos diálogos |
| Texto | Nenhum texto literal em componente (seção 9) |
| Fronteira do pacote | Teste por sentinela, depois do build |

### Só no navegador (Playwright, em contêiner)

O ambiente do Vitest não tem canvas, WebGL nem WebAssembly, então isto só vale testado num navegador de verdade:

- O motor carrega e desenha um documento de exemplo, e `/` não busca `.wasm`.
- Arrastar com ponteiro de verdade, zoom com Ctrl e roda, mover a vista com espaço.
- Fluxo de eventos de ponta a ponta com a API e o proxy do desenvolvimento, incluindo queda e retomada. Proxy que segura a resposta é o defeito clássico aqui.
- Carregamento de fonte, envio de arquivo, aviso ao fechar a aba com alteração por enviar.
- Redirecionamento para `/entrar` sem sessão, e 404 para documento de outra conta.
- O caminho inteiro da fatia 1: briefing, acompanhar, revisar, exportar.

Regressão visual do render não é teste do frontend: é do `packages/render`, com goldens no servidor (ADR 030).

## 9. Texto visível

- **Todo texto que o designer lê fica em `apps/web/src/textos/`**, um módulo por área (`site`, `entrada`, `documentos`, `briefing`, `camadas`, `propriedades`, `otto`, `historico`, `exportar`, `erros`). Objeto tipado, com função quando há número ou nome no meio (plural com `Intl.PluralRules` em `pt-BR`). Sem biblioteca de tradução: é um idioma só. A forma deixa a troca barata se um dia houver outro.
- **Conta como texto visível:** rótulo, dica, texto de exemplo em campo, `aria-label`, `alt`, título de página, texto de Open Graph, descrição de lote que aparece no histórico e o rótulo desenhado no canvas ("zona da interface: sem texto").
- **Componente não tem texto literal.** Uma verificação automática no CI falha se achar. Assim o guardião da marca revisa uma pasta, e não o código inteiro.
- **Erro da API chega como código e dados; a frase é montada aqui**, em `textos/erros.ts`. Hoje a POC mostra ao designer a mensagem que `descreverErro` escreve para o agente.
- **Fala do Otto** (passos, resumo, pendências) vem do servidor, é do treinador-do-otto e passa pelo guardião por lá. O frontend só exibe.
- **Vocabulário de `docs/marca/identidade.md`:** tarefa, alterações do Otto, revisar alterações, exportar para PSD. Fornecedor de modelo não aparece em tela: o selo com o nome do modelo e a "Projeção com Sonnet 5" da POC saem.
- Toda fatia entrega o diff de `textos/` para o guardião-da-marca antes de fechar.

## 10. Ordem de entrega

Cada fatia tem teste, roda no Docker e pode ser mostrada. A primeira usável é a fatia 1.

| Fatia | O que o designer consegue fazer | Depende de |
|---|---|---|
| **0. Esqueleto** | Nada ainda. `apps/web` sobe no Docker com recarga a quente medida, página pública estática, `/editor` dinâmico e noindex, Vitest, Biome e teste de pacote rodando | Raiz do monorepo e `compose` (com o backend) |
| **1a. Ver** | Entrar, ver a lista de documentos, abrir um, navegar pelo canvas (zoom, mover a vista, enquadrar), ver as camadas | API de sessão e de documentos; `packages/documento` e um motor atrás da porta |
| **1b. Pedir** | Preencher o briefing em `/editor/novo` e acompanhar o Otto trabalhando, passo a passo, com o canvas atualizando | API de tarefa e fluxo de eventos; esquema do briefing |
| **1c. Revisar** | Ver as camadas marcadas, segurar para ver o antes, aceitar ou desfazer tudo | API de revisão |
| **1d. Exportar** | Baixar o PSD com o relatório. **Aqui o ciclo fecha: é a menor coisa usável.** O designer termina no Photoshop | API de exportação |
| **2. Editar** | Selecionar, arrastar, setas, apagar, propriedades, desfazer e refazer, estado de salvamento | Lote com versão e id; lote inverso (ou desfazer pela API) |
| **3. Editor de profissional** | Alças de redimensionar, seleção múltipla, agrupar, duplicar, reordenar e renomear camada, ferramentas V, M e T, painel virtualizado | Catálogo com as operações; desenho do especialista-ui-ux |
| **4. Tarefa sobre peça existente** | Pedido livre, tarefas prontas (adaptar para story, para banner), o "pode" antes de tarefa grande, aceitar em parte | Estados novos da tarefa na API; decisões 3 e 4 |
| **5. Conta** | Briefings salvos na conta, imagens próprias reaproveitadas, "salvar como briefing" depois de aceitar | API de briefings e de arquivos |
| **6. Motor definitivo** | O mesmo editor, com CanvasKit e a meta de 60 quadros medida | Spike de render do especialista-grafico |
| **7. Site e saída vetorial** | Site público de verdade; exportar SVG e PDF (ADR 034) | Texto do guardião; `packages` de exportação |

A edição manual vem **depois** do ciclo do Otto de propósito. O posicionamento é "o agente faz a produção", e o PSD editável deixa o designer terminar onde quiser. A fatia 1 entrega isso sem depender de nenhuma decisão em aberto sobre edição. Se o Felipe preferir editar antes de pedir, as fatias 1b a 1d e a 2 trocam de lugar sem retrabalho, porque as duas saem da 1a.

O que eu cortaria antes de adicionar qualquer coisa: leitura do site da marca, texturas, esforço criativo, painel de custo, trabalho sem rede, celular e tablet.

## 11. O que preciso do backend

Chamadas que o editor faz hoje (`api.ts` e buscas soltas nos componentes) e o que muda:

| Hoje na POC | No MVP |
|---|---|
| `GET /api/documentos` | Só os da conta da sessão. Cada item com estado da tarefa (trabalhando, aguardando revisão) e, se der, miniatura. Paginação |
| `POST /api/documentos` | Igual, na conta da sessão |
| `GET /api/documentos/:id` devolve documento, histórico inteiro e todas as tarefas | Documento, versão, tarefa ativa e conjunto pendente (com os `tocados`). Histórico em chamada própria, paginada. Documento de outra conta: 404 igual ao de id inexistente (ADR 023) |
| `POST /api/documentos/:id/lotes` devolve o registro inteiro | Recebe id do lote (gerado aqui), versão base, descrição e operações. Devolve a versão nova. Recusa de validação com código, nó e campo. Conflito de versão com a versão atual. Reenvio do mesmo id não aplica duas vezes. Para lote que depende de medida de texto, devolve os nós tocados |
| `POST /api/documentos/:id/desfazer` | Desfazer e refazer. Ideal: lote inverso calculado em `packages/documento`, e desfazer vira um lote comum |
| `POST /api/documentos/:id/tarefas` com o briefing já transformado em mensagem para o agente | Recebe o briefing no esquema de `packages/shared`. Quem transforma em mensagem é o servidor. Tarefas prontas por tipo, não por texto vindo do navegador |
| `GET /api/tarefas/:id/eventos` reenvia tarefa e documento inteiros | Um evento por mensagem, com id crescente. Evento de lote com operações e versão. Retomada por `Last-Event-ID`. Batimento periódico para a conexão não cair por ociosidade. Sem proxy segurando a resposta |
| `GET /api/tarefas/:id/antes` | Igual |
| `POST /api/tarefas/:id/aceitar`, `/desfazer`, `/cancelar` | Mais: confirmar o plano (o "pode") e aceitar em parte, com a unidade que for decidida |
| `GET /api/documentos/:id/relatorio` e download direto em `/exportar` | Pedido de exportação com estado, relatório e link assinado de curta duração (arquitetura, fluxo de exportação) |
| `POST /api/arquivos`, `GET /api/arquivos/:hash` | Com a conta conferida em toda leitura: o hash não é autorização. Cabeçalho de cache imutável. Limite de tamanho declarado. Se der, variante reduzida para o editor |
| `POST /api/vetores` (importar SVG) | Igual, com a conta |
| `GET /fontes/...`, `GET /api/fontes/catalogo`, `GET /api/fontes/arquivo/:familia/:peso` | Igual. Os bytes da fonte precisam chegar ao motor, não só a URL |
| `GET /api/estado` (nome do modelo e capacidades) | Vira dados da sessão: conta, nome, limites e capacidades. Sem nome de modelo |
| `GET /api/texturas`, `POST /api/arquivos/:hash/sujeito`, `POST /api/site` | Ficam para depois |
| Briefings em `localStorage` | Listar, criar, alterar e apagar briefings da conta |
| Não existe | Entrar, sair e ler a sessão. Renomear, duplicar e apagar documento |

E mais:

1. **Mesma origem** para navegador e API, em desenvolvimento e em produção.
2. **Esquemas zod em `packages/shared`** para tudo que atravessa a rede. O frontend valida a resposta, a API valida o pedido, e o tipo é um só.
3. **Como os pacotes do workspace são consumidos.** O `web` quer o código-fonte TypeScript. Se a API precisar de pacote compilado, combinamos as duas saídas antes da fatia 0.
4. **Versão do catálogo** numa resposta ou cabeçalho. Navegador com `packages/documento` mais velho que o da API, depois de um deploy, precisa saber que tem de recarregar.
5. **Sessão:** qual cookie, quanto dura, o que a API responde quando expira no meio da edição.

## 12. O que preciso do especialista-ui-ux e do especialista-grafico

**Do especialista-ui-ux** (`docs/mvp/experiencia.md`):

1. Mapa de telas e rotas. As minhas são proposta.
2. A primeira tela depois de entrar: lista de documentos ou formulário de briefing.
3. Desenho de cada estado da tarefa, incluindo a espera de 15 a 30 minutos e a volta do designer que fechou a aba.
4. O que o designer pode fazer enquanto o Otto trabalha e durante a revisão.
5. Unidade do aceitar em parte, e como ela aparece.
6. Como o estado de salvamento e a falta de conexão aparecem.
7. Tabela de atalhos, e o que as ferramentas V, M e T fazem no MVP.
8. Navegação por teclado no painel de camadas e nos painéis laterais.
9. Largura mínima suportada e o que aparece abaixo dela.
10. Estados vazio, carregando e erro de cada tela.
11. Desfazer com setas repetidas: dez toques são dez passos do histórico ou um.
12. Se os tokens visuais da POC (grafite, âmbar, laranja, as três famílias de fonte) continuam.

**Do especialista-grafico** (não foi chamado nesta rodada; isto é dependência):

1. Fechar a porta `MotorDeRender` da seção 4.
2. `aplicarLote` preservando a referência do que não foi tocado.
3. Lote inverso, para desfazer e refazer.
4. Teste de alvo e caixa com rotação em `packages/documento`.
5. Documento de 200 camadas com efeitos, para a bancada.
6. Se `poc/src/documento` e `poc/src/render` viram `packages/documento` e `packages/render` como estão. Este plano supõe que sim.
7. Marcar no catálogo quais operações dependem de medida de texto.

## 13. Decisões que são do Felipe

| # | Decisão | Minha recomendação |
|---|---|---|
| 1 | O MVP sai com o motor Canvas 2D da POC atrás da porta, enquanto o spike do CanvasKit corre, ou espera o CanvasKit | Sair com o Canvas 2D atrás da porta. A troca é a fatia 6. O ADR 030 pede o CanvasKit, então isso precisa ficar registrado |
| 2 | A primeira coisa usável é o ciclo do Otto com canvas só para ver, ou a edição manual | O ciclo do Otto (fatia 1). A edição vem na fatia 2 |
| 3 | O designer edita durante a revisão? E "desfazer tudo" depois de ele ter editado? | Manter a regra da POC: só leitura enquanto o Otto trabalha; durante a revisão pode editar, e "desfazer tudo" é recusado se houver edição dele depois, com aviso claro |
| 4 | Unidade do aceitar em parte | Por prancheta, na fatia 4. Lote solto não dá: um lote depende do anterior |
| 5 | Custo e modelo na tela | Tirar modelo e tokens. Mostrar só o tempo, até existir unidade de cobrança |
| 6 | Esforço criativo no MVP | Fora das primeiras fatias. Não foi medido |
| 7 | Ler a identidade pelo site da marca no MVP | Depois. Pede navegador sem janela no servidor |
| 8 | CSS: módulos com variáveis, ou Tailwind | Módulos com as variáveis que a POC já tem. Menos uma ferramenta |
| 9 | Mover o repositório para um disco ext4 | Mover, se for possível. Some o problema de link simbólico, de maiúscula e minúscula e de lentidão, e o host volta a ter `node_modules`. O plano de Docker funciona nos dois casos |
| 10 | Tamanho do site público no MVP | Uma página estática e `/entrar`. Conteúdo de verdade depois do recorte de aquisição |
| 11 | Um conjunto de alterações aceito é um passo do Ctrl+Z ou vários | Um passo |
| 12 | Editor só em computador no MVP | Sim, com aviso abaixo da largura mínima |

Escolhas técnicas minhas, reversíveis, que não precisam de decisão (ADR 009: "o resto pode escolher"): store leve para a interface, cache de consulta para o que não é o documento, biblioteca de formulário com zod no briefing, lista virtual no painel de camadas, Playwright para o teste de navegador. Cada uma entra só na fatia que precisa dela.

## 14. Riscos

| Risco | Efeito | O que fazer |
|---|---|---|
| A porta do motor foi desenhada sem o especialista-grafico | Pode não servir ao CanvasKit (contexto WebGL perdido, Worker, superfície) | Fechar com ele antes da fatia 1a. A porta é pequena de propósito |
| Navegador e servidor medem texto diferente | O gesto otimista chega num lugar e a API em outro: a camada pula | Resposta com os nós tocados nas operações que medem (seção 3.1). Some com o motor único |
| `aplicarLote` clona o documento inteiro | Cache e seletores não valem; custo por lote cresce com o documento (logo em vetor com milhares de caracteres de caminho) | Reconciliação por `tocados` no frontend como remendo; correção no `packages/documento` |
| Fluxo de eventos atrás de proxy | Progresso chega em bloco ou não chega; conexão cai por ociosidade em tarefa de 30 minutos | Teste de navegador de ponta a ponta na fatia 1b, batimento, retomada por id |
| Tarefa de 15 a 30 minutos | O designer fecha a aba; a tela precisa se remontar do zero. Se a espera é aceitável é **hipótese** do README da POC, não medida | Estado da tarefa sempre lido da API ao abrir. Medir a reação à espera no teste com designers |
| Disco exFAT | Sem link simbólico, sem diferença entre maiúscula e minúscula (import com caixa errada funciona aqui e quebra na imagem), lento, host sem `node_modules` | Volumes nomeados; `forceConsistentCasingInFileNames`; decisão 9 |
| Mesmo documento em duas abas | Conflito de versão no segundo lote | No MVP: detectar, avisar e recarregar. Sem sincronização entre abas |
| Navegador com catálogo mais velho que o da API depois de deploy | Lote recusado sem motivo aparente | Versão do catálogo na resposta e aviso para recarregar |
| Formato do manifesto do Next muda com o empacotador | O teste do ADR 019 quebra ou passa sem conferir | Teste por sentinela (seção 2) |
| Escopo, com uma pessoa só construindo | Fatias 3 a 7 são grandes | Cada fatia fecha usável; a lista de cortes está na seção 10 |

## 15. O que foi medido e o que é suposição

**Medido ou lido no código em 2026-10-01:**

- O disco do repositório é exFAT.
- No host, o `fs.watch` do Node recebe eventos de criação, alteração e remoção num diretório deste disco.
- Docker 29.8.1, Compose v5.5.1 e Node 24.0.0 no host.
- Os cinco achados da seção 1, com arquivo e linha.
- `poc/src/documento` e `poc/src/render` não importam módulo do Node.

**Suposição, sem verificar:**

- A recarga a quente funciona dentro do contêiner com o código montado deste disco.
- `pnpm install` funciona no contêiner com cada `node_modules` em volume nomeado.
- O Next empacota o CanvasKit por `import()` dinâmico sem levar o `.wasm` para o pacote comum.
- A reescrita de `/api` do Next não segura o fluxo de eventos.
- A hospedagem de produção roteia por prefixo na mesma origem.
- `packages/documento` e `packages/render` nascem do código da POC.
- Existe forma de verificar "componente sem texto literal" com o Biome ou com um script pequeno.
- Sessão por cookie `httpOnly`, como no ADR 019.
- Nenhuma medida de quadros por segundo foi feita.
