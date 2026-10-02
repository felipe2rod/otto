# @otto/render

Motor de render único do Otto (ADR 030, ADR 035): CanvasKit 0.42.0, com **render de referência em CPU** (agente, lint, exportação, goldens) e **prévia do editor em GPU**. Veio de `spikes/render/` (medições em `docs/tecnico/spike-render.md`). Dono: especialista-grafico.

```bash
docker compose run --rm teste pnpm --filter @otto/render test
docker compose run --rm teste pnpm --filter @otto/render typecheck
# o motor mudou de propósito? regenere os goldens e confira os PNGs no diff antes de versionar
docker compose run --rm -e ATUALIZAR_GOLDENS=1 teste pnpm --filter @otto/render test
```

## Três entradas

| Entrada | Para quem | O que tem |
|---|---|---|
| `@otto/render` | todos | O motor, puro: recebe a instância do CanvasKit e bytes. Só importa **tipos** de `canvaskit-wasm`; nada do WebAssembly entra no pacote de quem importa |
| `@otto/render/node` | API e worker | `carregarCanvasKit(variante?)` e `arquivosDoMotor()` |
| `@otto/render/navegador` | editor | `criarMotor(canvas, recursos, opcoes?)`, `carregarCanvasKit(endereco?)`, `telaWebGL`, `ENDERECO_PADRAO_DO_MOTOR` |

### Servidor

```ts
import { carregarCanvasKit } from '@otto/render/node';
import { criarSessao, renderizarPrancheta, criarMedidor, criarMeiosDeVerificacao, recursosEmFalta, naoDesenhado, MOTOR } from '@otto/render';

const ck = await carregarCanvasKit();                        // 50 a 80 ms; 128 MB reservados por instância
const sessao = criarSessao(ck, { fontes, imagens });         // bytes; uma sessão por job, destruída no fim
const { largura, altura, rgba } = renderizarPrancheta(sessao, doc, prancheta, { escala, regiao, apenas, excluir });
const medidor = criarMedidor(sessao);                        // para aplicarLote({ medidor }) e resumirDocumento
const avisos = verificarDocumento(doc, criarMeiosDeVerificacao(sessao));
sessao.destruir();
```

- Área acima de 64 megapixels por superfície lança `ErroDeAreaDoRender` antes de alocar; acima disso, renderize por `regiao`.
- `recursosEmFalta(sessao, doc)` lista fonte e imagem que o documento usa e não foram entregues. **Texto com fonte em falta não é desenhado** (o Skia, sozinho, trocaria por outra em silêncio); imagem em falta vira retângulo cinza.
- `naoDesenhado(doc)` lista o que o documento usa e este motor ainda não desenha.
- O motor devolve RGBA. PNG sai na variante padrão; JPEG e WebP só na `completa` (`carregarCanvasKit('completa')`, mesmos pixels).

### Editor

```ts
const { criarMotor } = await import('@otto/render/navegador');   // import dinâmico, só dentro de /editor
const motor = await criarMotor(canvas, recursos);                // recursos: { imagem(hash), fonte(familia, peso) } → bytes
await motor.prepararRecursos(doc);
motor.redimensionar(larguraCss, alturaCss, devicePixelRatio);
motor.definirDocumento(doc);
motor.definirCamera({ x, y, zoom });          // x, y: pixels de tela da origem do plano; zoom: pixels de tela por unidade
motor.definirPrevia({ ids, dx, dy });         // arrastar; null encerra
motor.definirPrevia({ ids, dx: 0, dy: 0, caixas: { [id]: { x, y, largura, altura, rotacao? } } });   // redimensionar e girar
const cancelar = motor.aoMudarEmFalta((emFalta) => { /* fonte ou imagem que faltava chegou, ou passou a faltar */ });
```

- `criarMotor(canvas, recursos, { fundo })`: `fundo` é a cor da área de trabalho em `#rrggbb`, ou `'transparente'` (o canvas fica vazado fora das pranchetas, com alfa premultiplicado, e o editor põe o próprio fundo por baixo).
- `aoMudarEmFalta` avisa ao receber um documento e ao terminar `prepararRecursos`, só quando a lista muda. Custa uma passada pelas camadas, e só quando há quem ouça.
- `SENTINELA_DO_MOTOR` (também em `@otto/render/sentinela`, arquivo sem nenhum import) é a marca que o teste do pacote público procura: está em `motor.sentinela`, então vai em todo pacote que carrega o motor.

**Carga do WebAssembly (ADR 019).** O pacote não embute o CanvasKit. `criarMotor` insere `<script src="/motor/0.42.0/canvaskit.js">` e o script busca `canvaskit.wasm` da mesma pasta. O app web copia esses dois arquivos para a pasta estática no build; `arquivosDoMotor()` (de `@otto/render/node`) diz a versão e os caminhos de origem. Outro endereço: `criarMotor(canvas, recursos, { enderecoDoMotor })`.

## Garantias, com teste

- Mesmo documento, mesmas fontes, mesma versão do motor: mesmos bytes (duas instâncias, duas sessões).
- Goldens de CPU com tolerância zero (`goldens/*.png` e `goldens/indice.json`), uma cena por recurso e uma peça inteira.
- Os dois cálculos presos à mesma fórmula: os 26 modos de mesclagem e as 9 camadas de ajuste (com qualquer modo), por shader (GPU) e por laço de pixel (CPU), contra a referência, a 1 nível (2 com alfa nos dois). Os filtros de ruído, nitidez e desfoque de movimento, shader contra laço, a 1 ou 2 níveis. Cada cena de golden no cálculo da GPU fica a no máximo 4 níveis do golden.
- O ruído é função da posição na camada e do id dela: mesmo grão sempre, e o grão anda e gira com a camada.
- A ordem de montagem de uma camada é a do Photoshop: conteúdo, filtros (na ordem do documento), máscara, efeitos (a sombra e o brilho contornam o que a máscara deixou), opacidade e modo.
- Cache do editor: imagem em cache idêntica ao render de referência; zero recomposição durante o arraste; ao soltar, só a prancheta que mudou.

O WebGL em si não roda no Node: `navegador.ts` (a tela WebGL) não tem teste automático aqui. Foi conferido à mão no Chrome com a placa de vídeo, pela entrada pública do pacote.

**Prévia em GPU contra a referência, medida no Chrome com placa de vídeo (Radeon RX 5500 XT, 2026-10-01), nas cenas de golden.** Ruído: 1 a 2 níveis (o grão é o mesmo). Desfoque de movimento: até 4. Máscara de sujeito: 3 pixels acima de 8 níveis em 180 mil. Nitidez: até 9 com quantidade 1,5, e até 17 (2,4% dos pixels acima de 8) com quantidade 4, porque ela multiplica a diferença que o desfoque do Skia já tem entre GPU e CPU. Efeitos com desfoque (brilho externo e interno, sombra interna): até 20 a 40 níveis em 1% a 2% dos pixels, na borda, a mesma ordem de diferença da sombra projetada e do filtro de desfoque. É diferença de prévia; o que o agente vê, o lint confere e a exportação grava é sempre a referência em CPU.

## O que o motor desenha

| Recurso do esquema | Estado | O que falta | Tamanho |
|---|---|---|---|
| Prancheta, fundo, cor por token | desenha | — | — |
| Forma: retângulo, elipse, raio, degradê linear e radial, traço interno | desenha | — | — |
| Texto: fonte de arquivo, peso mais próximo, trechos, tracking, entrelinha, alinhamento, caixa alta, versalete sintético (minúsculas em maiúscula a 70% do corpo, como o do Photoshop), kerning ligado ou desligado | desenha | A quebra é a do Skia (parte palavra que não cabe; a POC deixava estourar) e a linha de base cai em pixel inteiro. Conferir contra o Photoshop | — |
| Imagem: cobrir, conter, foco, zoom, recorte, ajuste de cor (brilho, contraste, saturação, duotone) | desenha | — | — |
| Vetor: preenchimento, traço (ponta, junção), regra par-ímpar | desenha | — | — |
| Grupo: atravessar, opacidade, modo, máscara | desenha | — | — |
| Máscara em degradê e de forma (suave, invertida); máscara de recorte | desenha | — | — |
| 26 modos de mesclagem | desenha | Luz suave usa a fórmula do W3C; a do Photoshop espera referência | — |
| Sombra projetada; filtro de desfoque | desenha | O desfoque é o gaussiano do Skia; a POC usava três caixas e, em foto, aplicava na resolução de origem | — |
| Camada de ajuste: curvas, níveis, matiz e saturação, brilho e contraste, vibração, equilíbrio de cor, filtro de foto, preto e branco, mapa de degradê; com máscara, opacidade e recorte | desenha | — | — |
| Camada de ajuste com modo de mesclagem diferente de normal | desenha | Na CPU o ajuste vai para uma cópia, que é mesclada; na GPU, um shader só ajusta e mescla | — |
| Efeitos de camada: sombra interna, brilho externo, brilho interno, sobreposição de cor, sobreposição de degradê | desenha | Só com operações do Skia (desfoque, filtro de cor, modos), o mesmo código na CPU e na GPU. Tamanho do Photoshop = desvio padrão × 2: **conferir no Photoshop** | — |
| Filtro de desfoque de movimento | desenha | Média de até 64 amostras ao longo da reta. No laço de pixel custa de 1 a 3 s por render em camada grande a 1080 px | — |
| Filtro de ruído | desenha | Uniforme, por posição. O ruído do Photoshop é outro: ao reaplicar o filtro lá, o desenho do grão muda | — |
| Filtro de nitidez | desenha | Máscara de nitidez: original + quantidade × (original − desfocado), sem limiar | — |
| Máscara de sujeito (recorte da foto) | desenha | Só em foto; fora dela a camada sai sem máscara e `naoDesenhado` avisa | — |

Em foto, os filtros são aplicados na resolução do documento (a POC aplicava na resolução do arquivo de origem).

`naoDesenhado(doc)` lista o que o documento usa e o motor não desenha. Hoje só um caso: máscara de sujeito em camada que não é foto.

## O que a exportação usa

`renderizarMascara(sessao, doc, prancheta, no)` devolve a máscara do nó como cobertura (um byte por pixel), pelo mesmo código que corta a camada no render. `codificarPng(sessao, render)` grava PNG, e `codificarJpeg(sessao, render)` grava JPEG na variante completa do motor (na padrão devolve `undefined`). `reduzirFoto(sessao, bytes, ladoMaximo)` reduz uma foto para caber no lado pedido, em JPEG (a prévia que o agente vê, a miniatura), também só na variante completa. `alturaDaMaiuscula(bytes)` lê a altura da maiúscula da fonte, que a exportação usa para pôr a caixa de texto onde o Photoshop assenta a primeira linha. `limitesDoNo` é a área que a camada ocupa. `nomePostScript(bytes)` lê o nome que o Photoshop procura, e `escolherFonte(fontes, familia, peso)` é a regra do motor para o arquivo de fonte (peso mais próximo da família; sem a família, nada). `@otto/render/apoio-de-teste` expõe as fontes e imagens de teste para os testes de outros pacotes.

Do motor da POC, não vieram: `tracarCaminho` (SVG, de outra fatia) e as texturas geradas.

## Prévia de gesto: mover, redimensionar e girar

`definirPrevia` mostra as camadas de `ids` deslocadas por `dx` e `dy`, ou, as que têm entrada em `caixas`, com a caixa nova. Nenhuma prancheta é recomposta durante o gesto, com uma camada ou com várias.

- **Mover camadas soltas:** cada uma vira uma imagem em cache, e o quadro só troca a posição delas. Nada é redesenhado.
- **Redimensionar, girar, ou mexer em camada de dentro de grupo isolado ou de um conjunto de recorte:** a unidade tocada (a camada; o grupo; a base com as presas) é redesenhada a cada quadro, já com a caixa nova, e todo o resto fica em cache. **A prévia é exata, não aproximada:** o texto requebra, a foto reenquadra, o canto arredondado mantém o raio e o efeito com desfoque é recalculado, porque é o mesmo desenho que a prancheta terá ao soltar. A caixa da prévia troca `x`, `y`, `largura`, `altura` e `rotacao`, como a operação `alterar` (a máscara de forma fica onde está); o deslocamento age como `mover` (a máscara vai junto). `aplicarPrevia(no, previa)` é essa conta, para quem desenha as alças.
- **Ao soltar:** aplique o lote e chame `definirDocumento` antes de `definirPrevia(null)`. A prancheta é recomposta uma vez e fica idêntica ao render de referência.
- A diferença entre a prévia e o que fica ao soltar é a de sempre entre imagens em cache e render direto: até 8 níveis, só em borda (e mais em borda de camada que cruza a margem da prancheta).

Medido no Chrome com placa de vídeo, 240 quadros por gesto, prancheta de 1080 × 1350, em 2026-10-01 (quadros por segundo; zero composições de prancheta em todos):

| Gesto | Radeon RX 5500 XT, 200 camadas | Intel HD 2000, 200 camadas | Intel HD 2000, 16 camadas |
|---|---|---|---|
| Mover um texto | 60 | 57 | 60 |
| Redimensionar um texto (requebra) | 60 | 60 | 60 |
| Girar um texto | 60 | 60 | 60 |
| Redimensionar forma com sombra, brilho externo e sombra interna | 54 a 56 | 44 a 49 | 60 |
| Redimensionar a foto de fundo, com ruído | 60 | 48 | 60 |
| Redimensionar 10 camadas selecionadas | 60 | 53 | 58 |
| Mover 10 camadas selecionadas | 60 | 60 | 60 |

O primeiro quadro de um gesto com efeito de desfoque engasga uma vez (280 a 500 ms nas duas placas: é a primeira compilação dos shaders do efeito); os números da linha já incluem esse quadro. Mexer na camada de baixo de uma pilha de 200 é o caso caro: tudo o que está acima vira imagens que são desenhadas a cada quadro, e camada de ajuste acima é recalculada a cada quadro.

## O que o editor ainda não tem no motor

- Prévia de edição de texto (digitar): hoje é um lote por alteração.
- Zoom acima de 100% recompondo a região visível na escala nova (hoje a imagem em cache é ampliada).
- Recuperação de contexto WebGL perdido: o motor avisa (`aoPerderContexto`); recriar é do editor.
- Motor dentro de Web Worker.
