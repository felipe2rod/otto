# @otto/agente

Núcleo do ciclo do agente do Otto (ADR 029): entender → planejar → fazer em lotes → conferir → entregar. Prompt, descrição das ferramentas, direção de arte, segunda conferência, esforço criativo e as portas. TypeScript puro: sem `node:`, sem framework, sem log. Roda igual no worker, no terminal e no teste.

Veio de `poc/src/servidor/` (`agente.ts`, `prompt.ts`, `direcao.ts`, `esforco.ts`, `modelo.ts`). Dono: treinador-do-otto.

```bash
docker compose run --rm --no-deps teste pnpm --filter @otto/agente test
docker compose run --rm --no-deps teste pnpm --filter @otto/agente typecheck      # o pacote e a pasta avaliacao/
docker compose run --rm --no-deps teste pnpm --filter @otto/agente tarefa -- --caso briefing-cafe   # tarefa de verdade (avaliacao/README.md)
```

| Entrada | Para quem | O que tem |
|---|---|---|
| `@otto/agente` | worker, editor, testes | O ciclo, o contrato (zod), as portas e o modelo roteirizado (falso) |
| `@otto/agente/contrato` | editor, `@otto/shared` | Só o contrato (zod e tipos): entrada, plano, preparo, eventos, pendência, resultado. Não alcança o ciclo nem o prompt |
| `@otto/agente/adaptadores/claude` | quem monta o modelo de verdade | `criarModeloClaude({ chave, modelo?, endereco?, aoVerLimites? })` |
| `@otto/agente/roteiros/*.json` | worker e editor em desenvolvimento | Tarefas de verdade gravadas, para reproduzir sem gastar token |

## A tarefa em duas partes

O "pode" não depende de retomar a conversa com o modelo. A primeira parte devolve dado; a aprovação dispara a segunda, que começa conversa nova.

```ts
import { prepararTarefa, executarTarefa, type EntradaDaTarefa, type Preparo, type ResultadoDaTarefa } from '@otto/agente';

// 1. entender e planejar. Não toca no documento. O que volta é dado (zod: Preparo): guarde.
const preparo: Preparo = await prepararTarefa(amb, entrada);
//    preparo.pedeConfirmacao === true  → estado aguardando_confirmacao; nada roda nem custa na espera
//    "ajustar a direção": prepararTarefa(amb, entrada, { ajuste: { anterior: preparo, texto } })
//    preparo.naoConsigo               → o Otto disse que não dá; executarTarefa só fecha a tarefa, sem modelo

// 2. fazer, conferir e entregar. Conversa nova, com a direção e o plano aprovado na entrada.
const resultado: ResultadoDaTarefa = await executarTarefa(amb, entrada, preparo);

// as duas de uma vez (avaliação e teste): rodarTarefa(amb, entrada, { confirmar })
```

**Entrada** (`EntradaDaTarefa`, zod):

| `tipo` | O que é | Primeira parte | "Pode" |
|---|---|---|---|
| `briefing` | Formulário: uma prancheta por formato. `{ briefing, esforco? }` | 1 chamada (direção de arte) | Com 2 ou mais formatos |
| `criar` | Pedido livre que cria uma peça. `{ pedido, esforco? }` | 1 chamada (direção de arte) | Não |
| `pedido` | Pedido sobre a peça aberta: adaptar, variar, revisar, remover. `{ pedido, selecao?, esforco? }` | 1 chamada (plano) | Mais de uma prancheta, ou qualquer remoção |
| `ajuste` | Ajuste pontual: o caminho rápido. `{ pedido, selecao? }` | nenhuma chamada | Não |

**Quando o "pode" é pedido** (`motivosDoPode`, regra de código): a tarefa cria ou altera mais de uma prancheta (`varias_pranchetas`); remove qualquer coisa que já existia (`remocao`); ou a direção de arte não saiu válida em duas tentativas (`sem_direcao`: "posso seguir só com o briefing?").

**O plano aprovado é o limite da execução.** Antes de gravar um lote, o ciclo o ensaia e a guarda (`guarda.ts`) recusa o que sai do plano: prancheta além das autorizadas, alteração em prancheta que já existia e não está no plano, remoção do que já existia e não está no plano. O que a própria tarefa criou, ela ajusta e remove à vontade. Camada bloqueada é recusada pelo catálogo.

**Resultado** (`ResultadoDaTarefa`): `fim` (`entregue`, `cancelada`, `erro`, `limite_de_passos`, `limite_de_custo`, `limite_de_tempo`), `entrega` (`resumo` e `pendencias`), `conferida`, `lotes`, `erro?` (código), `custo`. Só `entregue` é entrega completa; nos outros, o que foi feito fica e a entrega diz o que ficou sem conferir. `lotes === 0`: não há o que revisar.

Estado da tarefa no servidor: `entregue` com lotes → `em_revisao`; qualquer `fim` com lotes → `em_revisao` com esse `fim`; sem lotes → `aceita` (entregue), `cancelada` ou `falhou`.

## Portas (`portas.ts`)

O ambiente da tarefa. Tudo que é efeito está aqui.

| Porta | O que o worker faz |
|---|---|
| `modelo`, `modeloDoJulgamento?` | `ModeloDoAgente`. O mesmo adaptador serve aos dois; o decorador de custo do worker embrulha os dois |
| `documento()` | A árvore atual |
| `resumir(doc, prancheta?)` | `resumirDocumento(doc, { medidor, prancheta, nome })` |
| `aplicarLote({ id, descricao, operacoes })` | Transação curta, autoria do agente, `idDoLote = id`. Devolve `{ ok, tocados, versao? }` ou `{ ok: false, erro }` |
| `renderizar(doc, { prancheta, ladoMaximo, regiao? })` | Render de referência, na escala que cabe em `ladoMaximo` (768 na visão geral, 1024 no recorte), em JPEG ou PNG |
| `verificar(doc, prancheta?)` | `verificarDocumento(doc, meios, prancheta)`. O ciclo chama também com o documento inicial, para separar o que já existia |
| `previaDeArquivo?(arquivo, ladoMaximo)` | Imagens do cliente no briefing, para a direção e a segunda conferência |
| `imagens?` | `BancoDeImagens` (`buscar`, `trazer`). Ausente: sem as duas ferramentas, e o prompt não as cita |
| `fontes` | `daConta()` (entra no prompt) e `buscar?()` |
| `texturas?`, `detectarSujeito?` | Ausentes: sem a ferramenta e sem as técnicas que dependem dela |
| `relogio`, `novoId()` | Tempo e id (UUID). O id vira id de lote e código da cerca de material |
| `emitir(evento)` | Progresso (`EventoDaTarefa`) |
| `registrarChamada?(chamada)` | Custo por chamada: papel, modelo, tokens, duração, imagens, resultado. Só números e códigos |
| `sinal` | Cancelamento cooperativo, conferido entre passos e repassado à chamada em curso |
| `limites?` | Tetos do sistema (abaixo) |

## Eventos (`EventoDaTarefa`, zod)

| `tipo` | Dados | Para quê |
|---|---|---|
| `etapa` | `etapa`, `prancheta?`, `rodada?` | O painel de espera. Vem do ciclo, não de dedução sobre os lotes |
| `etapas` | `previstas[]` | A lista inteira, para desenhar as que faltam |
| `direcao` | `direcao`, `cartao` | `cartao` é a direção em campos curtos para o "pode": conceito, assinatura, paleta com papéis, tipografia, imagem |
| `plano` | `plano`, `pedeConfirmacao`, `motivos` | `plano.criar`, `plano.alterar`, `plano.remover`, em listas separadas |
| `mensagem` | `texto` | Fala do Otto durante o trabalho (registro fechado) |
| `lote` | `loteId`, `descricao`, `tocados`, `operacoes`, `versao?` | O conjunto de alterações |
| `lote-recusado` | `motivo` (código), `detalhe?` | `lote_invalido`, `operacao_recusada`, `fora_do_plano`, `remocao_sem_plano`, `prancheta_a_mais`, `fora_do_ajuste`, `vetor_desconhecido` |
| `render`, `verificacao`, `imagem`, `revisao`, `erro` | — | Registro fechado |
| `entrega` | `resumo`, `pendencias[]` | Sempre o último evento, inclusive em entrega parcial |

**Etapas:** `leitura`, `direcao` (briefing e criar) ou `plano` (pedido), `producao` (uma por prancheta), `conferencia`, `revisao` (a segunda conferência), `ajustes`, `conferencia`, `entrega`. No ajuste pontual: `leitura`, `producao`, `conferencia`, `entrega`.

**Pendência:** `{ tipo, texto, camadas[], prancheta?, origem, regra?, gravidade? }`. `origem` diz quem falou: `otto` (na entrega), `verificacao` (o que a verificação ainda acusa entra sozinho, diga o modelo o que disser) ou `sistema` (teto, interrupção, falta de conferência). `texto` do sistema é provisório (`textos.ts`): monte a frase pelo `tipo`.

Eventos, plano, preparo e entrega carregam conteúdo do trabalho: banco sim, log e evento de uso não (ADR 031). `custo` e `ChamadaRegistrada` são só números.

## Tetos

| Teto | De onde vem | Padrão | Ao estourar |
|---|---|---|---|
| Voltas de conferência | nível de esforço | 4 a 10 (6 sem nível; 3 no ajuste) | O modelo é avisado; passando 2 do teto, a entrega sem conferir é aceita como parcial |
| Chamadas do ciclo | nível de esforço | 40 a 90 (60 sem nível; 8 no ajuste) | `limite_de_passos` |
| Segunda conferência | nível de esforço | 1 rodada (2 no `ICONIC`); só em tarefa que cria prancheta | — |
| Chamadas, somando tudo | sistema (`limites.maximoDeChamadas`) | 90 | `limite_de_passos` |
| Custo em dólar | sistema (`limites.tetoDeCusto`) | 3 | `limite_de_custo` |
| Tokens | sistema (`limites.tetoDeTokens`) | 4 milhões | `limite_de_custo` |
| Tempo | sistema (`limites.tetoDeTempoMs`) | 40 minutos | `limite_de_tempo` |

O teto diário do fornecedor é do worker: confira antes de cada chamada no decorador do modelo e lance `ErroDoModelo('limite_diario', ...)`. O ciclo fecha a tarefa com `fim: 'erro'`, `erro: 'limite_diario'`, e os lotes ficam.

## Esforço criativo

Sete níveis no código (`ESFORCOS_CRIATIVOS`), três opções na tela (`OPCOES_DE_CUIDADO`): `direto` → `STANDARD`, `cuidadoso` (padrão) → `REFINED`, `autoral` → `CONCEPTUAL`. `esforcoDaOpcao('cuidadoso')` devolve o nível. O mapeamento é proposta: só o `REFINED` foi medido, uma vez. Sem `esforco`, o prompt sai sem a seção e os limites são os de sempre. O ajuste pontual não tem esforço.

## Caminho rápido (`tipo: 'ajuste'`)

Sem direção, sem plano do modelo, sem segunda conferência. O documento vai resumido na primeira mensagem; o modelo manda um lote; o sistema aplica, roda a verificação e devolve o render na mesma resposta; o modelo olha e entrega. Prompt enxuto e esquema de operações compacto. Limites cumpridos em código: uma prancheta, sem criar prancheta, sem remover o que já existia. Pedido maior que isso termina com a pendência `fora_do_ajuste` e zero alterações: ofereça ao designer pedir como tarefa (`tipo: 'pedido'`).

## Material é dado, nunca instrução

Tudo que vem de fora chega ao modelo entre cercas com um código da tarefa (`material.ts`): briefing, pedido, texto e nome de camada, nome de arquivo, resultado de busca, avisos da verificação. O prompt do sistema nunca recebe texto da tarefa. A defesa que vale não depende de o modelo obedecer: a guarda do plano e o catálogo recusam o lote. `injecao.test.ts` roda cada caminho com um modelo que obedece ao ataque.

## Modelo falso, sem gastar token

```ts
import { criarModeloRoteirizado, idsDoRoteiro } from '@otto/agente';
import roteiro from '@otto/agente/roteiros/criar-uma-peca.json' with { type: 'json' };

const modelo = criarModeloRoteirizado(roteiro, { velocidade: 1, preco });   // 1: demora o que demorou na gravação; 0: responde na hora
const amb = { ...portas, modelo, novoId: idsDoRoteiro(roteiro) };
```

| Roteiro | Entrada | O que exercita | Onde roda |
|---|---|---|---|
| `ajuste-em-qualquer-peca.json` | `ajuste` | Caminho rápido em duas chamadas: põe em azul a primeira camada de texto da peça | Qualquer peça com uma camada de texto |
| `ajuste-titulo.json` | `ajuste` | O ajuste gravado com Claude (título na cor de destaque, maior; entrega com pendência de contraste) | Só peça com prancheta "Feed", camada "Título" e token "destaque" |
| `criar-uma-peca.json` | `criar` | Direção, uma prancheta, verificação que acusa e correção, segunda conferência, entrega com pendência. Sem "pode" | Peça vazia ou existente |
| `briefing-dois-formatos.json` | `briefing` | O mesmo, com dois formatos e o "pode" | Peça vazia ou existente |
| `pedido-dois-formatos.json` | `pedido` | Plano do modelo, "pode" por duas pranchetas, produção, correção, segunda conferência | Peça vazia ou existente |

Todos sem foto (não dependem de banco de imagens), com duração e contagem de tokens em cada passo (o custo e o teto diário andam como numa tarefa de verdade: o briefing soma perto de 710 mil tokens e US$ 0,69 no preço do Sonnet 5).

**O roteiro se adapta à peça.** O passo pode trazer marcas, trocadas pelo que o ciclo mandou ao modelo na primeira mensagem (o mesmo documento que o modelo de verdade lê): `{{prancheta}}` e `{{texto}}` são a prancheta e o nome da primeira camada de texto da peça; `{{nova:Feed}}` é "Feed" se a peça não tem prancheta com esse nome, senão "Feed 2", "Feed 3". Fora o `ajuste-titulo.json`, nenhum roteiro cita id de nó nem nome fixo, e nenhum toca no que já existia. Com entrada `criar`, use o roteiro de criar: `criar` planeja uma prancheta só, e um roteiro de dois formatos tem os lotes recusados.

`comGravacao(modelo, agora)` grava qualquer tarefa de verdade; o comando `tarefa` deixa um `roteiro.json` em cada saída. Roteiro gravado cita ids e fotos: só se repete sobre o mesmo documento, com os ids da gravação (`idsDoRoteiro`).

## Modelo de verdade

`criarModeloClaude` fala com o Claude pelo fornecedor de inferência, no formato Messages: ferramenta, imagem e cache de prompt, raciocínio adaptativo com esforço por chamada (baixo no ajuste, médio no ciclo, alto na direção e na segunda conferência). Marcas de cache explícitas em bloco: ferramentas, prefixo do sistema e duas no histórico. Erros com código (`ErroDoModelo.codigo`): `cancelada`, `limite_diario`, `limite_de_taxa`, `rede`, `recusa`, `credencial`, `pedido_invalido`, `resposta_invalida`, `desconhecido`. `ErroDoModelo.detalhe` pode trazer trecho do pedido: não vai para log.

## Medições com Claude (2026-10-02)

Primeira medição com o modelo de verdade: Sonnet 5 pelo fornecedor de inferência, prompt `2026-10-02.2`, uma execução de cada (não é média). Preço de `docs/tecnico/custos.md`; câmbio R$ 5,1991. Máquina de desenvolvimento, render em CPU. As pastas ficam em `avaliacao/saida/medicao-*` (fora do git).

| Tarefa | Tempo | Chamadas | Entrada (do cache) | Cache escrito | Saída | Imagens | Lotes | US$ | R$ |
|---|---|---|---|---|---|---|---|---|---|
| Ajuste pontual, peça de 2 pranchetas e 18 camadas (antes de avisar que o render já veio) | 19 s | 3 | 39,2 mil (64%) | 14,1 mil | 1,0 mil | 2 | 1 | 0,050 | 0,26 |
| O mesmo ajuste, depois | 13 s | 2 | 25,2 mil (80%) | 4,9 mil | 0,8 mil | 1 | 1 | 0,024 | 0,13 |
| Briefing do café, Feed e Story, nível `REFINED` (cuidadoso), com banco de imagens | 10 min 46 s | 35 (direção 1, ciclo 33, segunda conferência 1) | 2,60 milhões (95%) | 118,6 mil | 50,2 mil | 20 | 12 (1 recusado) | 1,295 | 6,73 |
| O mesmo briefing, com as quatro alavancas ligadas (prompt `2026-10-02.3`) | 5 min 51 s | 25 (1, 23, 1) | 0,97 milhão (92%) | 77,3 mil | 29,3 mil | 18 | 12 (3 recusados) | 0,665 | 3,46 |

O que os números dizem:

- **O tempo é do modelo.** No briefing, 620 dos 646 s foram espera de resposta; render e verificação, juntos, 26 s. A direção levou 65 s e a segunda conferência, 67 s. Três chamadas do ciclo levaram de 59 a 109 s (as que escrevem lote grande).
- **O custo se divide em três:** saída 39% (US$ 0,50), leitura de cache 38% (US$ 0,50), escrita de cache 23% (US$ 0,30). Entrada cheia: 70 tokens na tarefa inteira.
- **O prefixo relido a cada chamada tem perto de 44 mil tokens** (ferramentas e prompt do sistema), e mais da metade é o esquema de `aplicarOperacoes` (48 mil de 84 mil caracteres; `avaliacao/comandos/medir-prompt.ts`). Em 33 chamadas, só o prefixo dá 1,45 milhão dos 2,6 milhões de tokens.
- **O limite diário do fornecedor é o gargalo antes do preço:** o contador de "tokens restantes no dia" caiu 2,24 milhões nessa tarefa. Se for assim sempre, 45 milhões por dia dão perto de 17 tarefas de dois formatos para a plataforma inteira.
- Três das seis voltas de conferência foram gastas tentando calar um aviso (`faixa-vazia`) com enfeite. A tarefa bateu no teto de voltas e entregou com um erro de 4 px de caixa de texto, declarado nas pendências.
- O caminho rápido cabe no minuto: 13 a 19 s num ajuste de um lote. Ajuste que pede dois ou três lotes não foi medido.

**Com as quatro alavancas ligadas, uma execução:** tempo −46%, chamadas −29%, tokens −62%, custo −49%, e a peça saiu sem erro de verificação (a da linha de base saiu com um). Não dá para separar o efeito de cada alavanca com uma execução; o que os registros mostram:

- o prefixo caiu de 44,4 para 19,8 mil tokens (alavanca 1), e os lotes recusados por sintaxe subiram de 1 para 3;
- as chamadas do ciclo que só pediam render ou verificação caíram de 13 para 3 (alavanca 2);
- o modelo deixou um aviso de ritmo de 2 px nas pendências, dizendo que não gastaria outra rodada com ele (alavanca 3);
- direção e segunda conferência caíram de 132 para 42 s e de 11,7 para 3,6 mil tokens de saída (alavanca 4). A direção ficou mais contida: o conceito perdeu o selo de preço da linha de base. Uma execução não diz se foi a alavanca.

A qualidade visual das duas peças não foi julgada por rubrica, e isso é o que falta para ligar as alavancas por padrão. A 1 e a 2 não mexem no que o modelo decide; a 3 e a 4 mexem.

## Alavancas de custo (`alavancas.ts`)

Quatro opções, **desligadas por padrão**, para medir com e sem. Entram por `prepararTarefa(amb, entrada, { alavancas })` e `executarTarefa(amb, entrada, preparo, { alavancas })` (ou `rodarTarefa(..., { alavancas })`); `lerAlavancas('todas' | '1,3' | ...)` lê da configuração.

| Alavanca | O que faz |
|---|---|
| 1 `esquemaCompacto` | `aplicarOperacoes` vai ao modelo só com o nome de cada operação; a sintaxe está nas receitas do prompt e o erro de validação volta legível |
| 2 `conferenciaNoLote` | A resposta de cada lote já traz a verificação e o render das pranchetas que mudaram (as vazias não). Montar não conta volta; lote de correção conta; o teto de voltas dobra |
| 3 `avisoEJulgamento` | O prompt diz que erro se corrige e aviso é julgamento: não se gasta volta nem se põe enfeite para calar aviso |
| 4 `julgamentoEmMedio` | Direção de arte e segunda conferência em raciocínio médio, em vez de alto |

No ajuste pontual elas não valem (ele já usa o esquema compacto e a conferência no lote).

## O que mudou em relação à POC

| Mudança | Por quê |
|---|---|
| Tarefa em duas partes, com `Preparo` como dado | O "pode" cumprido pelo servidor, sem custo na espera |
| Plano estruturado e guarda do plano | Regras 3 e 4 do caráter em código, não só no prompt |
| Etapas com nome, emitidas pelo ciclo | O painel de espera |
| Caminho rápido para ajuste pontual | De minutos para segundos |
| Prompt em blocos, com o prefixo estável primeiro | Na POC a seção de esforço ficava no meio e cada nível tinha um cache próprio |
| Caráter com as cinco regras por extenso, versionado (`VERSAO_DO_PROMPT`) | A POC tinha quatro linhas |
| Cerca de material com código da tarefa | A POC usava `<briefing>` e `<pedido>` fixos |
| Ferramentas, técnicas e receitas conforme o que o ambiente tem | O Otto não anuncia recurso que não existe |
| `duplicar`, `transferir`, palavra partida pelo motor | Catálogo e motor do monorepo |
| Verificação separa o que já existia do que a tarefa causou | Em peça existente, o aviso antigo não é do agente |
| O que a verificação ainda acusa entra nas pendências sozinho | Conferência honesta por construção |
| Segunda conferência só em tarefa que cria prancheta | Ninguém pediu crítica de direção de arte num ajuste |
| Arquétipo da direção aceita de A a J | A POC descrevia dez e aceitava cinco |
| Tetos de custo, de tempo e de tokens; entrega parcial com o que ficou sem conferir | Antes só havia teto de chamadas e de voltas |

## O que não veio

- Leitura do site da marca (`site.ts`, `marca.ts`): fora do MVP (`docs/mvp/README.md`).
- Recorte de sujeito, texturas e catálogo de fontes: são portas opcionais; nenhum adaptador foi escrito.
- Banco de imagens de verdade: a porta existe; o adaptador é da fatia do briefing. A avaliação usa um banco local.
- Critério por render e rubrica humana do conjunto de avaliação.
