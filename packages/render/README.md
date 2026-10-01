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
```

**Carga do WebAssembly (ADR 019).** O pacote não embute o CanvasKit. `criarMotor` insere `<script src="/motor/0.42.0/canvaskit.js">` e o script busca `canvaskit.wasm` da mesma pasta. O app web copia esses dois arquivos para a pasta estática no build; `arquivosDoMotor()` (de `@otto/render/node`) diz a versão e os caminhos de origem. Outro endereço: `criarMotor(canvas, recursos, { enderecoDoMotor })`.

## Garantias, com teste

- Mesmo documento, mesmas fontes, mesma versão do motor: mesmos bytes (duas instâncias, duas sessões).
- Goldens de CPU com tolerância zero (`goldens/*.png` e `goldens/indice.json`), uma cena por recurso e uma peça inteira.
- Os dois cálculos presos à mesma fórmula: os 26 modos de mesclagem e as 9 camadas de ajuste, por shader (GPU) e por laço de pixel (CPU), contra a referência, a 1 nível (2 com alfa nos dois). Cada cena de golden no cálculo da GPU fica a no máximo 4 níveis do golden.
- Cache do editor: imagem em cache idêntica ao render de referência; zero recomposição durante o arraste; ao soltar, só a prancheta que mudou.

O WebGL em si não roda no Node: `navegador.ts` (a tela WebGL) não tem teste automático aqui. Foi conferido à mão no Chrome com a placa de vídeo, pela entrada pública do pacote.

## O que o motor desenha, e o que falta para alcançar o da POC

| Recurso do esquema | Estado | O que falta | Tamanho |
|---|---|---|---|
| Prancheta, fundo, cor por token | desenha | — | — |
| Forma: retângulo, elipse, raio, degradê linear e radial, traço interno | desenha | — | — |
| Texto: fonte de arquivo, peso mais próximo, trechos, tracking, entrelinha, alinhamento, caixa alta, versalete sintético, kerning ligado ou desligado | desenha | A quebra é a do Skia (parte palavra que não cabe; a POC deixava estourar) e a linha de base cai em pixel inteiro. Conferir contra o Photoshop | — |
| Imagem: cobrir, conter, foco, zoom, recorte, ajuste de cor (brilho, contraste, saturação, duotone) | desenha | — | — |
| Vetor: preenchimento, traço (ponta, junção), regra par-ímpar | desenha | — | — |
| Grupo: atravessar, opacidade, modo, máscara | desenha | — | — |
| Máscara em degradê e de forma (suave, invertida); máscara de recorte | desenha | — | — |
| 26 modos de mesclagem | desenha | Luz suave usa a fórmula do W3C; a do Photoshop espera referência | — |
| Sombra projetada; filtro de desfoque | desenha | O desfoque é o gaussiano do Skia; a POC usava três caixas e, em foto, aplicava na resolução de origem | — |
| Camada de ajuste: curvas, níveis, matiz e saturação, brilho e contraste, vibração, equilíbrio de cor, filtro de foto, preto e branco, mapa de degradê; com máscara, opacidade e recorte | desenha | — | — |
| Camada de ajuste com modo de mesclagem diferente de normal | **não** | Aplicar o ajuste numa cópia e mesclar; na GPU precisa copiar o fundo | médio |
| Efeitos de camada: sombra interna, brilho externo, brilho interno, sobreposição de cor, sobreposição de degradê | **não** | Cinco efeitos, com os parâmetros do descritor do Photoshop, em shader e em laço | grande |
| Filtro de desfoque de movimento | **não** | Não há filtro pronto no Skia: shader e laço | médio |
| Filtro de ruído | **não** | Ruído por posição, igual em shader e em laço (o da POC é sequencial e não serve à GPU) | médio |
| Filtro de nitidez | **não** | Desfoque e diferença: shader e laço | médio |
| Máscara de sujeito (recorte da foto) | **não** | Desenhar a imagem da máscara com o enquadramento da foto | pequeno |

`naoDesenhado(doc)` devolve essa lista para um documento dado: a camada sai sem o recurso, e quem chama pode avisar.

Do motor da POC, não vieram por serem de outras fatias: `mascaraEmAlfa` e `cantosDaFoto` (PSD), `tracarCaminho` (SVG), as texturas geradas, e a biblioteca de fontes com nome PostScript.

## O que o editor ainda não tem no motor

- Prévia de redimensionar, girar e editar texto: só "mover" tem prévia. Fora das três partes (camada dentro de grupo isolado, várias camadas), a prancheta é redesenhada ao vivo a cada quadro.
- Zoom acima de 100% recompondo a região visível na escala nova (hoje a imagem em cache é ampliada).
- Recuperação de contexto WebGL perdido: o motor avisa (`aoPerderContexto`); recriar é do editor.
- Motor dentro de Web Worker.
