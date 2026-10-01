# Spike de render (ADR 030)

Responde à pergunta do `CLAUDE.md`: **render idêntico no navegador e no Node, 60 quadros por segundo com 200 camadas**, com CanvasKit (Skia em WebAssembly), mesma versão nos dois lados.

O resultado, os números e a proposta da porta `MotorDeRender` estão em [`docs/tecnico/spike-render.md`](../../docs/tecnico/spike-render.md). Este arquivo só diz como rodar.

É um spike: não é `packages/render`, não tem zod nem catálogo de operações, e não altera `poc/`. As fontes vêm de `poc/fontes/`, montadas só para leitura.

## Rodar

O disco do repositório (exFAT) recusa link simbólico, então tudo roda em contêiner, com `node_modules` em volume nomeado. O host não tem `node_modules`.

```bash
cd spikes/render
docker compose up -d --build                        # sobe o servidor em http://127.0.0.1:8137
docker compose exec spike npm install               # só na primeira vez
docker compose exec spike node scripts/empacotar.ts # empacota as páginas (o CanvasKit fica fora do pacote)
```

**Página de conferência, com contador de quadros:** abra <http://127.0.0.1:8137/bancada.html> no seu navegador.

- O seletor troca o cenário: mover a câmera, zoom, arrastar a camada do topo, do meio ou do fundo, e os dois cenários sem cache.
- "Rodar a bateria de medição" mede todos e mostra a tabela.
- `?motor=gpu` (padrão), `?motor=hibrido`, `?motor=cpu`; `&sujo=1` liga a região suja; `&densidade=2` simula tela de alta densidade.
- A primeira linha do painel é o número que interessa. O navegador limita a 60 (ou à taxa do monitor); o que mostra folga é "com GPU", na tabela da bateria.

Testes, tipos e medições:

```bash
docker compose exec spike npx vitest run                 # 204 testes
docker compose exec spike npx tsc --noEmit
docker compose exec spike node src/node/renderizar-cenas.ts   # cenas de paridade no Node → saida/node/*.png
bash scripts/navegador.sh "paridade.html?motor=cpu" cpu       # as mesmas cenas no Chrome sem janela
docker compose exec spike node src/node/comparar.ts           # diferença pixel a pixel → resultados/paridade.json
docker compose exec spike node --expose-gc src/node/medir.ts  # tamanho, carga, memória, ladrilhos, worker
bash scripts/medir-tudo.sh                                    # tudo acima, na ordem (uns 15 minutos)
docker compose down                                           # para o servidor (o volume de node_modules fica)
```

`scripts/navegador.sh` roda no host, porque o navegador é o da máquina (com a placa de vídeo dela) e o servidor é o contêiner. Para usar a placa de vídeo no Chrome sem janela: `--enable-gpu --ignore-gpu-blocklist --use-angle=gl`. Sem essas opções o Chrome sem janela cai no SwiftShader, que é render por software.

## O que tem aqui

| Pasta | Conteúdo |
|---|---|
| `src/motor/` | O motor, puro: só recebe a instância do CanvasKit e bytes. `compositor.ts` (prancheta → canvas), `texto.ts` (parágrafo e medida pela tinta), `mesclagem.ts` (26 modos: 16 nativos, 10 por shader, e a fórmula de referência), `ajustes.ts` (camadas de ajuste), `pixel.ts` (laço de pixel do raster de CPU), `editor.ts` (cache do editor: imagem por prancheta e três partes ao arrastar), `sessao.ts`, `opentype.ts`, `diferenca.ts` |
| `src/cenas/` | Cenas de paridade, cenas de causa (um recurso por cena) e o documento sintético de 200 camadas |
| `src/node/` | Borda do Node: carregar o motor e os arquivos, renderizar, comparar, medir, worker |
| `src/web/` | Borda do navegador: página de paridade e bancada |
| `testes/` | Vitest. Roda em Node, com o mesmo WebAssembly do navegador |
| `recursos/` | Três imagens sintéticas geradas por `scripts/gerar-imagens.ts` (nenhuma foto de banco ou de cliente) |
| `resultados/` | Os números desta rodada, em JSON (versionados) |
| `saida/` | PNGs, pixels crus e mapas de diferença (fora do git) |

Porta 8137, só em `127.0.0.1`. As portas 80, 3030, 3306, 5433 e 7070 do host estão ocupadas.
