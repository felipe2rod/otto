#!/usr/bin/env python3
"""Resume, em texto, os resultados da bancada gravados em saida/navegador/bancada-*/fim.json."""
import glob, json, os, sys
raiz = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
todos = {}
for caminho in sorted(glob.glob(os.path.join(raiz, 'saida/navegador/bancada-*/fim.json'))):
    nome = os.path.basename(os.path.dirname(caminho))
    d = json.load(open(caminho))
    (d.get('memoria') or {}).pop('texturasMB', None)  # execuções antigas gravavam um valor que o CanvasKit não informa
    todos[nome] = d
    if 'erro' in d:
        print(f"\n== {nome}: ERRO {d['erro']}")
        continue
    print(f"\n== {nome}: {d['motor']['raster']} · {(d.get('gpu') or {}).get('renderizador', 'sem WebGL')} · canvas {d['canvas']['largura']}×{d['canvas']['altura']} · cache ×{d['escalaDoCache']}{' · região suja' if d.get('regiaoSuja') else ''}")
    print('   carga', d['carga'], '· composição inicial', ' | '.join(f"{c['prancheta']} {c['ms']} ms" for c in d['composicao']), '· soltar', d['recomporAoSoltarMs'], 'ms · memória', d['memoria'])
    for m in d['medicoes']:
        print(f"   {m['cenario']:20} {m['quadrosPorSegundo']:>6} q/s  intervalo p50 {m['intervalo']['p50']:>6} p95 {m['intervalo']['p95']:>6} máx {m['intervalo']['maxima']:>7}  perdidos {m['quadrosPerdidos']:>3}/{m['intervalo']['n']:<3}  JS p50 {m['javascript']['p50']:>7} p95 {m['javascript']['p95']:>7}  com GPU p50 {m['sincronizado']['p50']:>7} p95 {m['sincronizado']['p95']:>7} máx {m['sincronizado']['maxima']:>7}  preparo {m['preparoMs']:>7} ms  itens {m['itens']}")
if '--gravar' in sys.argv:
    json.dump(todos, open(os.path.join(raiz, 'resultados/bancada.json'), 'w'), indent=2, ensure_ascii=False)
    print('\ngravado em resultados/bancada.json')
