# 030 — Um motor de renderização só, no navegador e no servidor

Status: proposta
Data: 2026-09-26
Quem decide: Felipe

## Contexto

Três lugares precisam transformar o documento em pixels:

1. **O editor**, no navegador, a 60 quadros por segundo durante a edição.
2. **O agente**, que confere o próprio trabalho sem navegador aberto (ADR 029). O render roda no servidor.
3. **A exportação PSD**, que precisa do pixel de cada camada e da imagem composta (ADR 028). Também roda no servidor.

Se forem motores diferentes, o agente confere uma imagem que o designer não vê, e o PSD mostra outra. O ADR 027 exige determinismo.

## Opções consideradas

1. **Canvas 2D do navegador**, com `node-canvas` ou navegador headless no servidor. Rápido para começar, mas modos de mesclagem, texto e antisserrilhado variam entre implementações. O determinismo não se sustenta.
2. **WebGL próprio.** Controle total e custo de construção enorme. É o caminho de quem já tem produto maduro.
3. **Skia compilado para WebAssembly (CanvasKit)**, o mesmo binário no navegador e no Node. Escolhido.

## Decisão

- **`packages/render` usa CanvasKit** (Skia em WebAssembly) com a mesma versão fixa no navegador e no servidor.
- **Texto com o módulo de parágrafo do Skia** (modelagem por HarfBuzz), com as fontes da conta carregadas explicitamente e nunca fontes do sistema.
- **Modos de mesclagem do Photoshop** implementados com a fórmula do Photoshop. O Skia cobre a maioria; os que faltam viram shader próprio (`SkRuntimeEffect`). A lista está no ADR 028. Cada modo tem teste de pixel contra uma referência exportada do Photoshop.
- **Efeitos** (sombra, brilho, traço, sobreposição) implementados por nós, seguindo os parâmetros do descritor do Photoshop, para que o mesmo número dê o mesmo resultado nos dois lados.
- **Teste de regressão visual no CI**: goldens renderizados no servidor, comparados por diferença perceptual.
- Atrás de porta? **Não.** CanvasKit é tecnologia, não fornecedor (ADR 020, limite 3). Trocar o motor é reescrever `packages/render`, e isso fica escrito.

## Consequências

- O pacote WebAssembly tem alguns MB. O editor carrega o motor sob demanda, fora das páginas públicas (ADR 019).
- A renderização no servidor ocupa CPU. Ela sai da fila (pg-boss, ADR 009) com um limite de concorrência por conta.
- Interface de editor (painéis, camadas, propriedades) continua em React. Só o canvas é Skia.

## Gatilho de revisão

- Se o spike não atingir 60 quadros por segundo num documento de 200 camadas com efeitos, num notebook comum, rever a estratégia de cache de camadas antes de trocar de motor.
- Se o render do servidor e o do navegador divergirem acima do limite perceptual em algum golden, parar e corrigir. Divergência aceita vira bug de produto.
