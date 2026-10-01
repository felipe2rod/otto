# Spike de render: CanvasKit no navegador e no Node

Dono: especialista-grafico. Data: 2026-10-01. Decisão testada: [ADR 030](../decisoes/030-motor-de-renderizacao-unico.md). Código em [`spikes/render/`](../../spikes/render/README.md); números crus em `spikes/render/resultados/`.

A pergunta, do `CLAUDE.md`: **render idêntico no navegador e no Node, 60 quadros por segundo com 200 camadas**, com CanvasKit (Skia em WebAssembly), mesma versão nos dois lados.

## 1. Veredito

**Passa com ressalva.** As duas metades da pergunta passam, mas não ao mesmo tempo no mesmo caminho de render.

| Metade | Resultado | Condição |
|---|---|---|
| Idêntico no navegador e no Node | **Zero pixel diferente** em 10 cenas | Raster de CPU do WebAssembly nos dois lados (Node 24.21 e Chrome 154) |
| 60 quadros por segundo com 200 camadas | **60, sem quadro perdido**, ao mover a câmera e ao arrastar camada | WebGL, com cache por prancheta e três partes ao arrastar. Medido em Radeon RX 5500 XT (placa de mesa) e, com região suja, em Intel HD Graphics 2000 (integrada de 2011) |

A ressalva tem três partes:

1. **O editor a 60 quadros é WebGL, e WebGL não dá os mesmos pixels que o raster de CPU.** A diferença está em borda de forma, texto acima de uns 160 px, cauda de desfoque e arredondamento de 1 a 3 níveis em degradê, foto e modo (seção 3.2). O raster de CPU no navegador faz de 7 a 30 quadros por segundo: não serve para editar.
2. **O raster de CPU do CanvasKit é lento.** O binário publicado no npm não tem SIMD. Uma prancheta de 50 camadas com efeitos leva de 1,1 a 2,4 s no Node (na GPU, de 8 a 25 ms). E shader próprio (SkSL) em CPU custa de 0,5 a 7 µs por pixel, de 10 a 150 vezes o que custa um laço de pixel em TypeScript. Então, no raster de CPU, modo não nativo e camada de ajuste saem por laço, como na POC. São duas implementações da mesma fórmula (shader na GPU, laço na CPU), presas uma à outra por teste.
3. **Não medi num notebook comum de hoje.** As duas placas desta máquina são os extremos: uma dedicada de mesa e uma integrada de 2011. O que está no meio é suposição até o Felipe abrir a página de conferência (seção 10).

O ADR 030 diz "mesmo binário, mesmos pixels". O spike mostra que isso vale para o **render de referência** (CPU), que é o que o agente confere, o lint mede e a exportação grava. O canvas do editor é uma prévia em GPU do mesmo documento, com diferença medida e limitada. O ADR precisa dizer isso com essas palavras (seção 8).

## 2. O que foi medido e como

**Máquina:** Intel Core i7-2600S (2011, 4 núcleos, 8 linhas, até 3,8 GHz), 15 GB de memória, Linux 6.8. Placas: AMD Radeon RX 5500 XT (dedicada) e Intel HD Graphics 2000 (integrada do próprio processador, alcançada com `DRI_PRIME`). O processador é antigo: os tempos de CPU abaixo são pessimistas para um servidor atual.

**Versões:** `canvaskit-wasm` 0.42.0 (a mais recente no npm), Node 24.21.0 em `node:24-slim`, Google Chrome 154 sem janela. Fontes de `poc/fontes/` (12 arquivos), imagens sintéticas geradas pelo próprio motor (duas JPEG de 1280 px, uma PNG com alfa).

**Motor do spike** (`spikes/render/src/motor/`, 204 testes): nó de cada tipo que a POC tem (forma, texto, imagem, vetor, grupo, ajuste), 26 modos de mesclagem, máscara em degradê e de forma (suave, invertida), máscara de recorte, grupo com opacidade e modo (inclusive atravessar), sombra projetada, degradê linear e radial, imagem com enquadramento, foco, zoom e recorte, desfoque, rotação, traço interno, quatro tipos de camada de ajuste. Não portei: desfoque de movimento, ruído, nitidez, efeitos de camada além da sombra, duotone, máscara de sujeito, versalete sintético.

**Como:**

- *Paridade:* as mesmas cenas renderizadas no Node e numa página aberta no Chrome sem janela. A página envia os pixels (RGBA de 8 bits, não premultiplicado) ao servidor do spike, e um script compara: maior diferença de canal, pixels diferentes, pixels acima de 2, 8 e 32 níveis.
- *Causa de cada diferença:* 42 cenas com um recurso só, GPU contra CPU no mesmo navegador.
- *Desempenho:* documento sintético de 200 camadas em 4 pranchetas (Feed, Story, Quadrado, Banner; 50 camadas cada). Por tipo: 84 textos, 64 formas, 32 imagens, 8 grupos, 8 ajustes, 4 vetores. Com efeito: 32 sombras, 16 modos de mesclagem, 8 máscaras, 4 desfoques, 4 máscaras de recorte. Canvas de 1600 × 813 px. Cada cenário: 20 quadros de aquecimento, 240 medidos em cadência livre (intervalo entre quadros do navegador) e 90 medidos **esperando a GPU terminar** (`gl.finish` e leitura de um pixel), que é o custo real do quadro. O navegador limita a 60; "com GPU" mostra a folga.
- *Custos:* script no Node, com um processo por caso de memória.

## 3. Paridade

### 3.1 Raster de CPU: Node contra Chrome

| Cena | Tamanho | Maior diferença | Pixels diferentes |
|---|---|---|---|
| texto | 900 × 700 | 0 | 0 |
| mesclagem (26 modos sobre foto) | 1020 × 660 | 0 | 0 |
| mascaras | 900 × 620 | 0 | 0 |
| efeitos | 900 × 620 | 0 | 0 |
| ajustes | 900 × 600 | 0 | 0 |
| peca (Feed completo) | 1080 × 1350 | 0 | 0 |
| duzentas-feed | 1080 × 1350 | 0 | 0 |
| duzentas-story | 1080 × 1920 | 0 | 0 |
| duzentas-quadrado | 1080 × 1080 | 0 | 0 |
| duzentas-banner | 1200 × 628 | 0 | 0 |

Isso inclui texto (FreeType e HarfBuzz dentro do WebAssembly), decodificação de JPEG e PNG, desfoque, e o laço de pixel em TypeScript (V8 nos dois lados). Também dão os mesmos bytes: duas instâncias do WebAssembly no mesmo processo, a linha principal contra um `worker_thread`, e a variante "completa" do CanvasKit contra a padrão (6 cenas).

**Não medido:** Firefox e Safari. O WebAssembly é determinístico, mas o laço de pixel usa `Math.pow` (níveis) e `Math.sqrt`, que o padrão não obriga a dar o mesmo último bit em motores diferentes. No Otto o render de referência roda no servidor; no navegador ele só aparece se o editor oferecer "ver como exporta".

### 3.2 WebGL contra raster de CPU

Chrome com a Radeon, contra o Node:

| Cena | Maior diferença | % de pixels diferentes | Acima de 2 níveis | Acima de 8 | Acima de 32 | Diferença média |
|---|---|---|---|---|---|---|
| texto | 6 | 4,7 | 1.409 | 0 | 0 | 0,03 |
| mesclagem | 173 | 19,4 | 1.096 | 196 | 123 | 0,07 |
| mascaras | 169 | 20,2 | 11.787 | 3.716 | 1.482 | 0,25 |
| efeitos | 87 | 23,2 | 23.870 | 2.198 | 349 | 0,28 |
| ajustes | 5 | 23,1 | 374 | 0 | 0 | 0,08 |
| peca | 255 | 48,0 | 32.121 | 10.823 | 6.632 | 0,52 |
| duzentas-feed | 222 | 53,1 | 32.712 | 14.131 | 3.569 | 0,43 |
| duzentas-story | 222 | 55,3 | 39.127 | 13.610 | 3.364 | 0,39 |
| duzentas-quadrado | 76 | 60,4 | 15.116 | 4.621 | 277 | 0,30 |
| duzentas-banner | 63 | 53,3 | 23.733 | 6.597 | 315 | 0,37 |

Metade dos pixels difere, quase todos em 1 nível; cerca de 1% difere em mais de 8. A Intel integrada e o SwiftShader dão números parecidos, mas **não os mesmos**: três GPUs, três resultados. WebGL não é determinístico entre máquinas.

**Causa de cada diferença** (um recurso por cena de 600 × 400, GPU da Radeon contra CPU, mesmo navegador):

| Causa | Maior diferença | Onde | Recursos medidos |
|---|---|---|---|
| Nenhuma | 0 | — | Retângulo alinhado ao pixel |
| **Antisserrilhado de borda.** A GPU calcula a cobertura da borda de um jeito, a CPU de outro | 29 a 81 | Só nos pixels de borda (0,1 a 0,8% da cena) | Retângulo em meio pixel (54), arredondado (57), elipse (57), girado (29), traço (50), vetor (81), recorte arredondado de foto (18), grupo com opacidade (41) |
| **Texto grande vira caminho na GPU.** Até 96 px o glifo é a mesma máscara rasterizada em CPU e só enviada à GPU; em 220 px a GPU desenha o contorno | 2 (até 96 px), 187 (220 px) | Borda da letra, menos de 1 px de deslocamento | Texto de 22, 96 e 220 px, girado; máscara de recorte com título de 220 px (192) |
| **Desfoque.** Algoritmos diferentes na cauda | 4 a 19 | Halo da sombra e área desfocada; quase tudo abaixo de 8 níveis | Sombra (19), desfoque de forma (4), de foto (9), máscara suave (3) |
| **Arredondamento.** Precisão de ponto flutuante diferente | 1 a 3 | Áreas inteiras, 5 a 40% dos pixels, sempre 1 a 3 níveis | Degradê (1), foto ampliada e reduzida (1), opacidade (2), máscara em degradê (2), modos nativos (2 a 3), luz linear (4), subtrair (2), ajustes (2 a 3) |
| **Divisão amplia o arredondamento** | 7 a 13 | Regiões em que o divisor é pequeno | Luz intensa (13), dividir (7) |
| **Modo com degrau.** Um nível de diferença no fundo troca o resultado inteiro | 111 a 230 | 24 a 71 pixels na Radeon; nenhum no SwiftShader | Mistura sólida (230), cor mais clara (111) |

Nada disso é erro de fórmula. É GPU contra CPU, e nenhuma escolha de parâmetro fecha a diferença de borda.

### 3.3 Decodificação de imagem

Os dois JPEG decodificados pelo WebAssembly e pelo decodificador do Chrome (`createImageBitmap`) deram **os mesmos pixels**. O PNG com alfa não: passando pelo Canvas 2D do navegador, que guarda premultiplicado, 21.443 pixels saíram diferentes (até 127 níveis). Conclusão: **a imagem entra no motor como bytes e é decodificada dentro dele**, nos dois lados. O plano do frontend previa decodificar com `createImageBitmap`; isso quebra a paridade em imagem com alfa. Custo medido de decodificar no motor: 15 a 45 ms por foto de 1280 px (101 JPEG reais dos dados da POC, todos decodificados; SVG não é imagem para o motor).

## 4. Texto

Parágrafo do Skia (modelagem por HarfBuzz, quebra por ICU), com fonte de arquivo registrada por apelido próprio (`família#peso`), uma por arquivo.

| Pergunta | Resposta medida |
|---|---|
| Fonte do sistema entra? | Não existe fonte do sistema dentro do WebAssembly. Mas, pedida uma família que não foi entregue, **o Skia desenha com outra fonte registrada, sem avisar**. O motor do spike recusa antes: não desenha e devolve `fonteEncontrada: false` |
| Parágrafo em caixa com quebra | Funciona; nenhuma linha passa da largura. **Difere da POC:** palavra que não cabe na caixa é partida no meio ("Quint/a"); a POC deixava estourar e o lint acusava `palavraEstourada`. O lint terá de detectar pela quebra fora de espaço |
| Tracking por trecho | Exato: 8 letras × 250/1000 × 40 px = 80 px a mais, medido 80 |
| Trechos de estilo (fonte, peso, corpo, cor) | Funcionam, com trecho de outra família e outro corpo na mesma linha |
| Entrelinha | Linhas descem corpo × entrelinha, exato. A primeira linha encosta a ascendente da fonte no topo da caixa (`DisableFirstAscent`), como a POC fazia |
| **Linha de base** | **O parágrafo do Skia encaixa a linha de base em pixel inteiro** (51,25 virou 51). É até meio pixel fora da métrica da fonte, e consome metade do orçamento de 1 px do gatilho do ADR 028 |
| **Medida pela tinta** | Sai da caixa de cada glifo já posicionado (`getShapedLines` e `getGlyphBounds`), **sem rasterizar**. Em 6 casos (título, parágrafo com acento, centralizado, direita com tracking, trechos mistos, serifada) e com rotação, ficou a 1 px do que o raster pinta. Custo: 0,3 ms por nó de texto |
| Kerning ligado ou desligado | Funciona (`kern` em 0) |
| **Recursos OpenType** | **Sim, qualquer um, pelo nome** (`fontFeatures`). `smcp` desenha o versalete de verdade; `ss01`, `ss02` e `zero` trocam o "a", o "g" e o zero da IBM Plex. O Canvas 2D da POC não dava isso |
| O `smcp` resolve o versalete? | Só onde a fonte tem. Dos 44 arquivos de fonte em `poc/fontes/`, **só a Anton declara `smcp`**. A Playfair Display tem versalete no original, mas o arquivo estático que o Google Fonts entrega é um recorte sem ele. O versalete sintético continua necessário; `opentype.ts` lê do arquivo quais recursos a fonte tem, para escolher |

**Não medido:** quebra de linha, kerning e entrelinha contra o motor de texto do Photoshop. É o maior risco do ADR 028 e só se prova abrindo o PSD no Photoshop. O que este spike entrega para esse teste é a posição exata de cada linha de base e de cada glifo, que o exportador vai precisar.

## 5. Modos de mesclagem

Fórmula de referência: a que a POC calcula em pixel, estendida aos 26 modos (`mesclagem.ts`).

- **16 saem pelo modo nativo do Skia.** **10 saem por shader próprio:** os 9 que a POC já calculava em pixel, mais a **superexposição linear**. O "Plus" do Skia (e o `lighter` do Canvas, que a POC usa) soma os premultiplicados e, com opacidade abaixo de 100%, clareia mais que a fórmula. A linha `lddg` do `psd.md` já previa shader próprio; a POC está errada nesse modo com opacidade parcial.
- **Os 26, CanvasKit contra a fórmula:** no máximo **1 nível** com fundo e camada opacos e com opacidade de 60%; no máximo **2 níveis** com alfa nos dois (4.096 pares de cor aleatórios por caso, 78 testes).
- **Mistura sólida precisa de limiar em inteiro.** Em ponto flutuante, 100/255 + 155/255 pode dar 0,99999994 e errar o empate. Shader e laço comparam o nível de 8 bits.
- **Luz suave continua em aberto.** O Skia usa a fórmula do W3C. A fórmula atribuída ao Photoshop difere dela em **até 17 níveis, em 7% dos pares** de fundo e camada. O shader com a fórmula do Photoshop está pronto (`SKSL_LUZ_SUAVE_DO_PHOTOSHOP`), fora do documento, esperando a conferência.
- **Em CPU, shader próprio é inviável.** Por megapixel, shader contra laço de pixel: subtrair 917 ms contra 19 ms; luz intensa 1.708 contra 12; mistura sólida 1.253 contra 8; níveis 946 contra 15; matiz e saturação 4.417 contra 131. O laço usa tabela de 256 × 256 por modo quando fundo e camada são opacos, e fica a no máximo 1 nível da fórmula e 2 níveis do shader. A cena dos 26 modos caiu de 7,7 s para 0,26 s.

**O que só o Photoshop prova.** O ADR 030 pede teste de cada modo contra referência exportada do Photoshop. Não existe Photoshop no CI nem nesta máquina. Peço ao Felipe, uma vez: documento RGB de 8 bits, 256 × 256 px; camada de baixo com degradê linear preto → branco na horizontal; camada de cima com o mesmo degradê na vertical; para cada um dos 26 modos, exportar um PNG sem perfil. Cada PNG é a tabela B(fundo, camada) do Photoshop, e vira o golden do modo. Luz suave e mistura sólida são as que mais importam.

## 6. Máscara, recorte, grupo, sombra, degradê, imagem, desfoque e ajuste

Todos funcionam e estão nas cenas de paridade. O que o CanvasKit muda em relação à POC:

| Recurso | Na POC (Canvas 2D) | No CanvasKit |
|---|---|---|
| Máscara em degradê ou de forma | Superfície à parte e `destination-in`; suavizar e inverter em laço de pixel | Camada temporária com `DstIn` (ou `DstOut` para a invertida) e desfoque de máscara do Skia. Sem ler pixel |
| Máscara de recorte | Três superfícies | Camada do conjunto, e a base redesenhada com `DstIn` |
| Grupo com opacidade e modo | Superfície por grupo | `saveLayer` com opacidade e modo; atravessar sem efeito compõe direto |
| Sombra e desfoque | `shadowBlur` do canvas e desfoque de três caixas em pixel | Filtros de imagem do Skia (`DropShadow`, `Blur`) |
| Camada de ajuste | Copia a superfície inteira e roda laço | Na GPU, shader que lê o fundo e mistura pela máscara, sem cópia. Na CPU, laço na memória da própria superfície, sem cópia |
| Imagem | `drawImage` | Decodificada no motor, com níveis reduzidos (mipmap) para foto grande em caixa pequena |

Camada de ajuste por shader ou por laço contra a fórmula da POC: no máximo 1 nível (matiz e saturação, brilho e contraste, níveis, preto e branco). **Ajustes empilhados somam o arredondamento:** dois ajustes que aumentam contraste chegaram a 4 níveis entre shader e laço.

Achados menores, que valem para `packages/render`:

- O Skia antisserrilha diferente um caminho recortado pela prancheta e o mesmo caminho inteiro (até 8 níveis em meia dúzia de pixels). Aparece só na prévia do arraste.
- A amostragem de imagem com mipmap linear custa 3 vezes a com o nível mais próximo em CPU (503 ms contra 152 ms por megapixel). O spike usa o nível mais próximo nos dois lados.
- `saveLayer` sem limites aloca a prancheta inteira. O compositor passa a caixa do nó com a folga da sombra e do desfoque.
- Ler os pixels de volta em não premultiplicado custa cerca de 60 ms por megapixel, em todo render. Dá para tirar fazendo a conversão no laço em TypeScript.

## 7. Desempenho

### 7.1 Estratégia que chegou ao número

1. **Uma imagem por prancheta.** Parado, movendo a câmera ou dando zoom, o quadro é um desenho de imagem por prancheta, com a transformação da câmera.
2. **Três partes ao arrastar**, montadas uma vez no começo do gesto: *abaixo* (tudo sob a camada, composto numa imagem), *a camada* (sozinha, com sombra, desfoque e máscara, numa imagem do tamanho dela, sem o recorte da prancheta) e *acima*. Em "acima", trechos seguidos que não dependem do fundo viram uma imagem; camada com modo de mesclagem vira imagem desenhada com o modo; camada de ajuste é redesenhada por shader. O quadro é: abaixo, camada deslocada, itens de acima em ordem. **Nada é recomposto durante o gesto** (teste por contador).
3. **Região suja** (opcional): redesenha só o retângulo onde a camada estava e onde está. Exige que o canvas guarde o quadro anterior (`preserveDrawingBuffer`).
4. **Ao soltar,** só a prancheta tocada é recomposta. O cache é por identidade do objeto da prancheta.

Grupo em atravessar, sem opacidade nem máscara, é achatado: os filhos entram como camadas soltas.

**Limite do spike:** camada dentro de grupo isolado ou de conjunto de recorte não entra nas três partes; nesse caso o editor recompõe a prancheta a cada quadro (linha "sem cache de partes" abaixo). A prévia do arraste junta imagens intermediárias de 8 bits, então difere do render direto em até 3 níveis, e em até 8 em poucos pixels de borda; ao soltar, a prancheta volta a ser composta direto.

### 7.2 Números

Canvas de 1600 × 813 px. "q/s" é o que o navegador entregou em 240 quadros; "com GPU" é o tempo de um quadro esperando a placa terminar, p50 / p95 em ms.

| Cenário | Radeon RX 5500 XT | Intel HD 2000 (2011) | Intel HD 2000, região suja | SwiftShader (sem GPU), região suja |
|---|---|---|---|---|
| Mover a câmera, 4 pranchetas | 60 q/s · 3,2 / 4,1 | 60 q/s · 15,1 / 15,5 | 60 q/s · 12,6 / 13,5 | 60 q/s · 9,1 / 11,2 |
| Zoom de 15% a 150% | 60 q/s · 2,9 / 3,8 | 60 q/s · 5,8 / 6,2 | 60 q/s · 3,2 / 3,7 | 56 q/s · 11,4 / 15,0 |
| Arrastar a camada do topo (2 itens) | 60 q/s · 3,1 / 4,0 | 60 q/s · 13,4 / 17,2 | 60 q/s · 10,3 / 11,0 | 60 q/s · 1,4 / 1,7 |
| Arrastar o título, com 2 ajustes acima (6 itens) | 60 q/s · 3,4 / 5,0 | **58 q/s**, 10 perdidos · 22,7 / 24,2 | 60 q/s · 3,7 / 4,0 | 55 q/s · 13,5 / 15,8 |
| Arrastar camada em multiplicação perto do fundo (8 itens) | 60 q/s · 3,8 / 5,5 | **49 q/s**, 52 perdidos · 26,8 / 27,7 | 60 q/s · 12,3 / 13,9 | 52 q/s · 15,2 / 18,0 |
| Sem cache de partes: recompor a prancheta a cada quadro | 60 q/s · 14,4 / 15,7 | 27 q/s | 27 q/s | 4 q/s |
| Sem cache nenhum: 200 camadas a cada quadro | **34 q/s** · 31,8 / 34,5 | 24 q/s | 24 q/s | 3 q/s |

- Na Radeon, com canvas de 3200 × 1626 px (tela de alta densidade): 60 q/s em todos os cenários com cache, p95 de 3,8 a 8,4 ms.
- Nenhum quadro perdido na Radeon em nenhum cenário com cache, nem na Intel com região suja.
- **Custos de uma vez só, na GPU:** compor uma prancheta de 50 camadas, em geral 17 a 25 ms (59 ms na pior rodada; a primeira prancheta leva 190 ms, porque compila os shaders); montar as três partes no começo do arraste, 13 a 32 ms; recompor ao soltar, 7 a 8 ms.
- JavaScript por quadro: 0,5 a 1,8 ms com cache; 11 ms recompondo uma prancheta; 29 ms recompondo as quatro.

**O gatilho do ADR 030 se confirma:** sem cache, 200 camadas dão 34 q/s numa placa dedicada. Com o cache, 60. A resposta foi a estratégia de cache, não trocar de motor.

**Raster de CPU no navegador** (o caminho idêntico ao servidor): mover a câmera 30 q/s, zoom 7,5 q/s, arrastar 12 q/s; compor uma prancheta 0,9 a 2,1 s. **Híbrido** (cache rasterizado em CPU, quadro em WebGL): os quadros ficam iguais aos da GPU, mas o começo do arraste espera 1,2 a 1,5 s e soltar espera 1,5 s. Nenhum dos dois serve para editar.

## 8. Custos de operação

| Item | Medido |
|---|---|
| WebAssembly (variante padrão) | 7,32 MB; 2,96 MB em gzip; 2,28 MB em brotli |
| JavaScript de cola | 121 kB; 37,5 kB em gzip |
| Variante completa (também codifica JPEG e WebP) | 8,24 MB; 3,31 MB em gzip; 2,54 MB em brotli |
| Carga no Node | 81 ms a primeira instância, 53 ms as seguintes |
| Carga no Chrome (servidor local, sem rede) | 12 a 20 ms o script; 64 a 140 ms baixar, compilar e instanciar |
| Criar a sessão (12 fontes, 3 imagens) | 97 ms no Node, 106 a 156 ms no Chrome; só com fontes, 17,5 ms |
| Memória de uma instância | O WebAssembly reserva 128 MB de início. Processo Node com motor e sessão: 133 MB residentes |
| Render do documento de 200 camadas no Node | Feed 1,8 s · Story 2,4 s · Quadrado 1,4 s · Banner 1,1 s. Pico de 177 MB residentes |
| O mesmo, antes do laço de pixel (shader em CPU) | 9,3 s · 13,2 s · 7,5 s · 4,9 s |
| Render para o agente | Região de 512 × 512 em 1:1: 332 ms. Prancheta com lado de 768: 577 ms |
| Exportação de uma prancheta (Feed) | Composta 1,8 s; pixel de 46 camadas, uma a uma, 4,9 s |
| Codificar a composta de 1080 × 1350 | PNG 387 ms (913 kB); JPEG 82: 41 ms (156 kB); WebP 82: 401 ms (78 kB) |
| Medidor de texto | 0,3 ms por nó |
| Worker | Mesmos pixels que a linha principal; 134 ms de preparo e 1.252 ms de render; a linha principal bateu o relógio de 50 ms 30 vezes durante o render |

**Prancheta grande** (a peça de 1080 × 1350 ampliada, com conteúdo de verdade):

| Tamanho | Megapixels | Tempo | Memória do WebAssembly | Memória residente |
|---|---|---|---|---|
| 2160 × 2700 | 5,8 | 5,0 s | 128 MB | 272 MB |
| 4320 × 5400 | 23,3 | 19,7 s | 392 MB | 594 MB |
| 6480 × 8100 | 52,5 | 44,4 s | 853 MB | 1.181 MB |
| 7560 × 9450 | 71 | recusado pelo limite, em 0,3 ms, antes de alocar | 128 MB | 129 MB |
| 8640 × 10800, em 9 ladrilhos de 4096 | 93,3 | 85 s | 302 MB | 467 MB |

Regra que sai daí: cerca de **0,85 s e 16 bytes de pico por pixel**, em superfície única. Uma superfície sozinha aloca até 23.000 × 23.000 px (2 GB); o que acaba antes é a memória das camadas temporárias. O spike fixa **64 megapixels por superfície** e devolve erro legível acima disso. Acima do limite, render por região: a memória fica plana e o tempo segue linear. **30.000 × 30.000 px (PSB) dá uns 14 minutos de composta** nesta máquina. Ladrilho contra superfície única não é idêntico: 1.398 pixels diferentes em 5,8 milhões, até 8 níveis, na emenda de desfoque e sombra. O ladrilho de produção precisa de sangria.

**O WebAssembly fora do pacote público (ADR 019).** No spike, o motor em TypeScript só importa os *tipos* do CanvasKit; o pacote de cada página tem 76 a 79 kB e nenhum código do motor (o script de empacotar confere). O `.wasm` e o script de cola são arquivos estáticos, buscados em tempo de execução por quem abre a página. No Next vale o mesmo desenho: os dois arquivos em caminho estático versionado, carregados por `import()` dinâmico de dentro de `/editor`, e o teste por sentinela que o plano do frontend propõe. **Não testei com o Next.**

## 9. O que falhou e o que não deu para medir

**Falhou ou saiu diferente do ADR:**

1. Paridade de pixel entre o editor a 60 quadros (WebGL) e o servidor (CPU). Só CPU contra CPU é idêntico.
2. Shader próprio como caminho único. Em CPU é de 10 a 150 vezes mais lento que o laço; o motor precisa dos dois.
3. O pacote publicado **não escreve PDF** (`MakePDFDocument` não existe em nenhuma variante). O ADR 034 cita o módulo de PDF do Skia como candidato: com o pacote do npm, não há. Sobra uma biblioteca de PDF no Node ou um CanvasKit compilado por nós.
4. A variante padrão **só codifica PNG**. JPEG para o agente (R4) pede a variante completa nos dois lados (0,9 MB a mais, mesmos pixels) ou um codificador fora do motor.
5. Ladrilho não é idêntico à superfície única sem sangria.

**Não medido:**

- Notebook comum de hoje, monitor de 120 ou 144 Hz, Firefox, Safari, macOS, Windows.
- Texto e modos contra o Photoshop.
- Perda de contexto WebGL e a recuperação.
- Motor dentro de Web Worker com `OffscreenCanvas`.
- Memória de textura na GPU (o CanvasKit não informou o valor nesta versão).
- Arraste de camada dentro de grupo isolado, redimensionar e girar pela alça, edição de texto no canvas.
- Zoom acima de 100% com recomposição da região visível na escala nova.
- CanvasKit compilado com SIMD.
- Empacotamento no Next e carga com rede de verdade.
- Desfoque de movimento, ruído, nitidez, efeitos de camada além da sombra, máscara de sujeito.

## 10. O que muda na arquitetura

**Com a ressalva aceita como está** (recomendo):

1. **Render de referência é o raster de CPU.** É ele que o agente vê, que o lint mede (contraste, camada invisível), que a exportação grava e que os goldens do CI comparam, com tolerância zero entre Node e Chrome. O texto do ADR 030 muda de "mesmos pixels no navegador e no servidor" para "mesmos pixels no render de referência; o canvas do editor é prévia em GPU".
2. **Dois limites declarados, não um.** Referência contra golden: zero. Prévia em GPU contra referência: proponho *diferença média abaixo de 1 nível e no máximo 2% dos pixels acima de 8 níveis*, por cena. Hoje a pior cena tem média de 0,52 e 1,0% acima de 8. Um limite por maior diferença não serve: borda, cauda de sombra (19) e modo com degrau (230) estouram qualquer teto baixo sem que o olho veja. O número final é do Felipe com o diretor-de-arte.
3. **`packages/render` tem dois cálculos para modo não nativo e ajuste**, shader e laço, com uma fórmula de referência só e teste que prende os três.
4. **O worker fica mais lento que na POC.** Render na fila sempre, nunca na requisição. O backend precisa remedir a memória (seção 8) e contar 1 a 2,5 s por prancheta por render do agente.
5. **Decodificação de imagem dentro do motor**, não no navegador.

**Se a ressalva pesar**, em ordem de custo:

| Dor | Mudança |
|---|---|
| O designer precisa ver exatamente o que exporta | Botão "ver como exporta": render de referência num Web Worker, 1 a 2 s por prancheta. Sem mudar o resto |
| A borda e o desfoque da prévia incomodam | Desfoque e sombra implementados por nós, com o mesmo algoritmo em shader e em laço (o ADR 030 já prevê efeito "implementado por nós"). A borda antisserrilhada não tem conserto: é da GPU |
| O servidor fica lento ou caro | Compilar o CanvasKit com SIMD (não medido; passa a existir uma compilação nossa para manter). Ou Skia nativo no servidor, que quebra "mesmo binário" e exige provar a paridade de novo |
| Notebook comum não chega a 60 | Região suja ligada por padrão (levou a integrada de 2011 de 49 para 60) e cache em escala menor durante o gesto |
| Nada disso basta | Aí sim rever o motor. O spike não aponta para isso |

## 11. Proposta da porta do motor

### 11.1 Núcleo, para o backend (R1 a R9)

```ts
// packages/render: sem Nest, sem disco, sem rede. Recebe a instância do CanvasKit e bytes.
const MOTOR: { nome: 'canvaskit-wasm'; versao: string; raster: 'cpu' };          // R8

interface RecursosDaSessao {                                                       // R1
  fontes: { familia: string; peso: number; bytes: Uint8Array }[];
  imagens: { arquivo: string; bytes: Uint8Array }[];   // chave = hash do conteúdo; PNG, JPEG ou WebP
}
function criarSessao(ck: CanvasKit, recursos: RecursosDaSessao): Sessao;           // R2: uma por job
interface Sessao { texto: MotorDeTexto; destruir(): void }

interface MotorDeTexto {                                                           // R3
  medirTinta(no: NoTexto): Caixa;            // já com a rotação; não cria superfície
  diagramar(no: NoTexto): TextoDiagramado;   // linhas, linha de base, tinta, fonteEncontrada, glifosAusentes
}

function renderizarPrancheta(sessao: Sessao, p: Prancheta, opcoes?: {              // R4, R5, R6
  escala?: number;
  regiao?: Caixa;                    // recorte em unidades da prancheta
  apenas?: ReadonlySet<string>;      // pixel de uma camada, sem fundo (PSD)
  excluir?: ReadonlySet<string>;     // o que está atrás de um nó (lint)
  fundo?: boolean;
}): { largura: number; altura: number; rgba: Uint8Array };

const LIMITE_DE_PIXELS: number;                                                    // R7
class ErroDeAreaDoRender extends Error { largura: number; altura: number }
```

| # | Atende? | Como, e o que falta |
|---|---|---|
| R1 | Sim | Só bytes. O motor não tem `import` de `node:` nem `fetch`. A borda (`src/node/carregar.ts` no spike) é quem lê disco |
| R2 | Sim | Tudo vive na sessão. Duas instâncias no mesmo processo dão os mesmos bytes. Resta uma tabela de modo em memória de módulo: é dado derivado da fórmula, sem dado de conta |
| R3 | Sim, com custo | O medidor é o mesmo WebAssembly: 53 a 81 ms de carga, 128 MB reservados por instância, 17,5 ms para registrar as fontes, 0,3 ms por nó. Cabe na requisição; a API carrega o motor uma vez por processo e cria só a parte de texto da sessão |
| R4 | Em parte | Prancheta, região e escala: sim. O motor devolve RGBA; PNG sai na variante padrão, JPEG só na completa |
| R5 | Sim | `apenas`, 4,9 s para 46 camadas. Dá para baixar renderizando cada camada só na caixa dela |
| R6 | Sim | `excluir` e `apenas` são os meios. Tirar o render de dentro do lint (V6 do backend) continua valendo: o lint recebe os meios por parâmetro |
| R7 | Sim | 64 megapixels por superfície, erro com tamanho e motivo em 0,3 ms, antes de alocar. Acima, por região. O backend escolhe o limite pelo teto de memória do worker: 16 bytes por pixel mais 130 MB |
| R8 | Sim | `MOTOR`. A versão do CanvasKit entra na chave de qualquer cache e nos goldens |
| R9 | Sim | Medido em `worker_thread`: mesmos pixels, linha principal livre. Cada worker carrega a própria instância |

### 11.2 Editor, para o frontend

A porta proposta em `docs/mvp/frontend.md` serve. Mudanças:

```ts
interface MotorDeRender {
  redimensionar(larguraCss: number, alturaCss: number, pixelsPorPonto: number): void;
  definirDocumento(doc: Documento, mudanca?: { tocados: ReadonlySet<string> }): void;
  definirPrevia(previa: PreviaDeGesto | null): void;
  definirCamera(camera: { x: number; y: number; zoom: number }): void;
  prepararRecursos(doc: Documento): Promise<void>;
  readonly medidor: Medidor;
  readonly contadores: { composicoesDePrancheta: number; partes: number; quadros: number };
  /** Novo: o render de referência (CPU), igual ao do servidor. Para "ver como exporta" e para o lint local. */
  renderizarReferencia(idDaPrancheta: string, opcoes?: { escala?: number; regiao?: Caixa }): Promise<ImageBitmap>;
  /** Novo: o WebGL pode perder o contexto; o editor precisa saber para avisar e recriar. */
  aoPerderContexto(aviso: () => void): void;
  destruir(): void;
}

interface RecursosDoRender {
  imagem(hash: string): Promise<ArrayBuffer>;   // mudou: bytes, não Blob decodificado pelo navegador
  fonte(familia: string, peso: number): Promise<ArrayBuffer>;
}
```

1. **`definirDocumento` depende de identidade.** O cache guarda a imagem enquanto a prancheta for o mesmo objeto. O achado do frontend sobre `structuredClone` em `aplicarLote` é pré-requisito: com clone inteiro, todo lote recompõe tudo. `tocados` é atalho, não substituto.
2. **`definirPrevia` cobre "mover" de camadas do nível de cima** (e de dentro de grupo em atravessar). Redimensionar, girar e mover dentro de grupo isolado recompõem a prancheta a cada quadro: 14 ms na Radeon, 40 ms na integrada de 2011.
3. **Região suja pede `preserveDrawingBuffer`.** É decisão do motor, invisível para o editor.
4. **A recomposição ao arrastar** que a POC tinha some: zero composições durante o gesto, uma ao soltar.
5. **Zoom:** o cache fica na resolução do documento, e a GPU escala. Acima de 100% a imagem fica mole até recompor na escala nova; a recomposição da região visível ao fim do gesto não foi construída.
6. **O medidor é síncrono e roda na linha principal.** Se o motor for para um Worker, o editor fica com duas instâncias (128 MB reservados cada). Proponho começar com o motor na linha principal: o JavaScript por quadro é de 0,5 a 1,8 ms.
7. **Sobreposições, teste de alvo e caixa** continuam fora do motor, como o frontend propôs.

### 11.3 O que peço aos outros

- **Backend:** remedir a memória do worker com a tabela da seção 8; decidir entre a variante completa e um codificador de JPEG fora do motor; o ladrilho com sangria entra junto com o PSB.
- **Frontend:** imagem como bytes; `aplicarLote` preservando referência antes da fatia de edição.
- **Treinador:** render de região de 512 px custa 0,33 s, e a prancheta inteira 1 a 2,4 s. Conferir detalhe por região sai mais barato também em tempo.
- **Felipe:** os 26 PNGs de modo do Photoshop (seção 5); abrir a página de conferência num notebook.

## 12. Linhas do `psd.md` que este spike toca

Não alterei o `psd.md`. Proponho, para a migração:

- Coluna "Motor" dos modos: superexposição linear passa a "shader próprio" de fato; luz suave fica "nativo do Skia, fórmula do W3C; difere da atribuída ao Photoshop em até 17 níveis; a decidir com referência do Photoshop".
- Texto: acrescentar "linha de base encaixada em pixel inteiro pelo parágrafo do Skia (até 0,5 px)" e "palavra maior que a caixa é partida".
- Recursos OpenType entram no documento só com linha própria; `smcp` mapeia para small caps do Photoshop, os outros precisam de verificação um a um.

## 13. Suposições, sem verificar

1. Um notebook comum de hoje fica entre a integrada de 2011 e a Radeon, portanto faz 60 quadros com o cache. **Não medi nenhum.**
2. A fórmula "do Photoshop" para luz suave e o limiar inteiro da mistura sólida são os da literatura; não conferi no Photoshop.
3. Um servidor atual faz o raster de CPU de 2 a 3 vezes mais rápido que este processador de 2011.
4. O CanvasKit compilado com SIMD seria algumas vezes mais rápido em CPU.
5. O Next entrega o `.wasm` como arquivo estático fora do pacote público, do jeito que o spike faz com um servidor próprio.
6. Firefox e Safari dão os mesmos pixels no raster de CPU.
7. A versão 0.42.0 continua disponível e as próximas não mudam o raster. Toda troca de versão do CanvasKit refaz os goldens.
8. As fórmulas de ajuste são as da POC, que aproximam as do Photoshop. O spike mede o motor contra a POC, não contra o Photoshop.

## 14. Como conferir

```bash
cd spikes/render
docker compose up -d --build
docker compose exec spike npm install               # só na primeira vez
docker compose exec spike node scripts/empacotar.ts
```

Abrir <http://127.0.0.1:8137/bancada.html> no navegador. O número grande é quadros por segundo no cenário escolhido; o painel diz qual placa o navegador está usando. "Rodar a bateria de medição" mede os sete cenários e mostra "com GPU", que é a folga real. `?sujo=1` liga a região suja; `?densidade=2` simula tela de alta densidade; `?motor=cpu` mostra o raster idêntico ao servidor e por que ele não serve para editar.

A paridade se refaz com `bash scripts/medir-tudo.sh` (uns 15 minutos), que grava `resultados/*.json`.
