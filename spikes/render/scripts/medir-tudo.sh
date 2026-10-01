#!/usr/bin/env bash
# Roda o spike inteiro: testes, render no Node, paridade no Chrome, bancada e custos no Node.
# Roda no host. Precisa de Docker e do Google Chrome (variável CHROME para outro executável).
# A bancada de GPU usa a placa da máquina; INTEL=pci-0000_00_02_0 (por exemplo) acrescenta uma segunda placa via DRI_PRIME.
set -euo pipefail
cd "$(dirname "$0")/.."
GPU="--enable-gpu --ignore-gpu-blocklist --use-angle=gl"

docker compose up -d --build
docker compose exec -T spike npm install --no-audit --no-fund
docker compose exec -T spike npx tsc --noEmit
docker compose exec -T spike npx vitest run
docker compose exec -T spike node scripts/empacotar.ts
docker compose exec -T spike node src/node/renderizar-cenas.ts

# paridade: o mesmo render no Chrome, em raster de CPU e em WebGL
bash scripts/navegador.sh "paridade.html?motor=cpu" cpu
bash scripts/navegador.sh "paridade.html?motor=gpu&nome=gpu-placa" gpu-placa $GPU
bash scripts/navegador.sh "paridade.html?motor=gpu&nome=gpu-swiftshader" gpu-swiftshader
bash scripts/navegador.sh "paridade.html?motor=causas&nome=causas-placa" causas-placa $GPU
bash scripts/navegador.sh "paridade.html?motor=causas&nome=causas-swiftshader" causas-swiftshader
if [ -n "${INTEL:-}" ]; then DRI_PRIME="$INTEL" bash scripts/navegador.sh "paridade.html?motor=gpu&nome=gpu-integrada" gpu-integrada $GPU; fi
docker compose exec -T spike node src/node/comparar.ts

# bancada: 200 camadas
ESPERA=900 bash scripts/navegador.sh "bancada.html?motor=gpu&auto=1&densidade=1&nome=bancada-gpu-placa" bancada-gpu-placa $GPU
ESPERA=900 bash scripts/navegador.sh "bancada.html?motor=gpu&auto=1&densidade=1&sujo=1&nome=bancada-gpu-placa-regiao-suja" bancada-gpu-placa-regiao-suja $GPU
ESPERA=900 bash scripts/navegador.sh "bancada.html?motor=gpu&auto=1&densidade=2&nome=bancada-gpu-placa-densidade2" bancada-gpu-placa-densidade2 $GPU
ESPERA=900 bash scripts/navegador.sh "bancada.html?motor=hibrido&auto=1&densidade=1&nome=bancada-hibrido-placa" bancada-hibrido-placa $GPU
ESPERA=900 bash scripts/navegador.sh "bancada.html?motor=gpu&auto=1&densidade=1&quadros=90&nome=bancada-gpu-swiftshader" bancada-gpu-swiftshader
ESPERA=900 bash scripts/navegador.sh "bancada.html?motor=gpu&auto=1&densidade=1&sujo=1&quadros=90&nome=bancada-gpu-swiftshader-regiao-suja" bancada-gpu-swiftshader-regiao-suja
ESPERA=900 bash scripts/navegador.sh "bancada.html?motor=cpu&auto=1&densidade=1&quadros=40&cenarios=camera-mover,camera-zoom,arrastar-topo&nome=bancada-cpu" bancada-cpu
if [ -n "${INTEL:-}" ]; then
  DRI_PRIME="$INTEL" ESPERA=900 bash scripts/navegador.sh "bancada.html?motor=gpu&auto=1&densidade=1&nome=bancada-gpu-integrada" bancada-gpu-integrada $GPU
  DRI_PRIME="$INTEL" ESPERA=900 bash scripts/navegador.sh "bancada.html?motor=gpu&auto=1&densidade=1&sujo=1&nome=bancada-gpu-integrada-regiao-suja" bancada-gpu-integrada-regiao-suja $GPU
fi
python3 scripts/resumir-bancada.py --gravar

# custos no Node (alguns minutos: inclui pranchetas de até 93 megapixels)
docker compose exec -T spike node --expose-gc src/node/medir.ts

for f in saida/navegador/causas-*/fim.json; do cp "$f" "resultados/$(basename "$(dirname "$f")").json"; done
echo "Resultados em resultados/. Página de conferência: http://127.0.0.1:8137/bancada.html"
