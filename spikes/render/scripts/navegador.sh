#!/usr/bin/env bash
# Abre o Chrome sem janela numa página do spike e espera ela avisar o servidor de que terminou.
# Roda no host (o navegador é o da máquina; o servidor é o contêiner).
# Uso: scripts/navegador.sh <caminho-da-página> <nome-da-execução> [opções do Chrome...]
set -euo pipefail
CHROME="${CHROME:-google-chrome}"
BASE="${BASE:-http://127.0.0.1:8137}"
pagina="$1"; nome="$2"; shift 2
raiz="$(cd "$(dirname "$0")/.." && pwd)"
rm -rf "$raiz/saida/navegador/$nome"
perfil="$(mktemp -d)"
"$CHROME" --headless=new --user-data-dir="$perfil" --no-first-run --no-default-browser-check \
  --disable-extensions --disable-background-timer-throttling --disable-renderer-backgrounding \
  --window-size="${JANELA:-1600,900}" "$@" "$BASE/$pagina" >"$perfil/chrome.log" 2>&1 &
pid=$!
terminou=nao
for _ in $(seq 1 "${ESPERA:-1200}"); do
  if curl -fsS "$BASE/estado" 2>/dev/null | grep -q "\"$nome\""; then terminou=sim; break; fi
  sleep 0.5
done
kill "$pid" 2>/dev/null || true
wait "$pid" 2>/dev/null || true
if [ "$terminou" != sim ]; then echo "A página não terminou: $pagina" >&2; tail -20 "$perfil/chrome.log" >&2; rm -rf "$perfil" 2>/dev/null || true; exit 1; fi
rm -rf "$perfil" 2>/dev/null || true
echo "ok: $nome"
