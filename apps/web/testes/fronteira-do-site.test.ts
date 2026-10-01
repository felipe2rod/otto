// ADR 019, guarda 2: o visitante do site público não baixa o editor nem o motor de render.
// Esta é a guarda pelo código-fonte (rápida, roda em todo `pnpm test`). A guarda pelo que o build
// de fato gerou é scripts/conferir-pacote-publico.ts.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { arquivosDeCodigo } from '../../../testes/fronteira/varredura';
import { violacoesDoSitePublico } from './fronteiraDoSite';

const WEB = path.resolve(import.meta.dirname, '..');

/** Sistema de arquivos de mentira: caminho → conteúdo. */
const em = (arquivos: Record<string, string>) => ({ ler: (a: string) => arquivos[a] ?? '', existe: (a: string) => a in arquivos });

describe('fronteira do site público: a regra', () => {
  it('página pública que só importa texto e estilo passa', () => {
    const fs = em({
      '/w/src/app/(site)/page.tsx': "import { site } from '../../textos/site';\nimport estilos from './pagina.module.css';",
      '/w/src/textos/site.ts': 'export const site = {};',
    });
    expect(violacoesDoSitePublico(['/w/src/app/(site)/page.tsx'], '/w/src', fs)).toEqual([]);
  });

  it('acusa import direto do editor', () => {
    const fs = em({ '/w/src/app/(site)/page.tsx': "import { Editor } from '../../editor/Editor';", '/w/src/editor/Editor.tsx': '' });
    expect(violacoesDoSitePublico(['/w/src/app/(site)/page.tsx'], '/w/src', fs)).toEqual(['src/app/(site)/page.tsx alcança o editor: src/editor/Editor.tsx']);
  });

  it('acusa o editor alcançado por um arquivo no meio do caminho, e import() dinâmico também', () => {
    const fs = em({
      '/w/src/app/layout.tsx': "import './../ui/Topo';",
      '/w/src/ui/Topo.tsx': "const E = () => import('../editor/canvas/motor');",
      '/w/src/editor/canvas/motor.ts': '',
    });
    expect(violacoesDoSitePublico(['/w/src/app/layout.tsx'], '/w/src', fs)).toEqual(['src/ui/Topo.tsx alcança o editor: src/editor/canvas/motor.ts']);
  });

  it('acusa o motor de render, o CanvasKit e qualquer .wasm', () => {
    const fs = em({ '/w/src/app/(site)/page.tsx': "import '@otto/render';\nimport ck from 'canvaskit-wasm';\nimport w from './motor.wasm';" });
    expect(violacoesDoSitePublico(['/w/src/app/(site)/page.tsx'], '/w/src', fs)).toEqual([
      'src/app/(site)/page.tsx importa @otto/render',
      'src/app/(site)/page.tsx importa canvaskit-wasm',
      'src/app/(site)/page.tsx importa ./motor.wasm',
    ]);
  });
});

describe('fronteira do site público: o web de verdade', () => {
  const app = path.join(WEB, 'src/app');
  // tudo o que o Next monta fora do segmento /editor: o layout raiz, o grupo (site), robots e sitemap
  const entradas = arquivosDeCodigo(app).filter((a) => !a.startsWith(path.join(app, 'editor') + path.sep) && !/\.test\.tsx?$/.test(a));

  it('há páginas públicas para conferir', () => {
    expect(entradas.some((a) => a.includes(`${path.sep}(site)${path.sep}`))).toBe(true);
    expect(entradas).toContain(path.join(app, 'layout.tsx'));
  });

  it('nenhuma página pública alcança o editor, o motor ou um .wasm', () => {
    expect(violacoesDoSitePublico(entradas, path.join(WEB, 'src'), { ler: (a) => readFileSync(a, 'utf8'), existe: existsSync })).toEqual([]);
  });

  it('o layout do site quebra o build se uma página pública virar dinâmica', () => {
    expect(readFileSync(path.join(app, '(site)/layout.tsx'), 'utf8')).toMatch(/export const dynamic = 'error'/);
  });

  it('o layout do editor é dinâmico e fora dos buscadores', () => {
    const layout = readFileSync(path.join(app, 'editor/layout.tsx'), 'utf8');
    expect(layout).toMatch(/export const dynamic = 'force-dynamic'/);
    expect(layout).toMatch(/index: false/);
  });
});

describe('rota só de desenvolvimento', () => {
  const app = path.join(WEB, 'src/app');
  const daBancada = arquivosDeCodigo(path.join(app, 'editor/bancada')).map((a) => path.basename(a));

  it('a bancada só existe como página ".dev.tsx": o build de produção não a enxerga', () => {
    expect(daBancada).toEqual(['page.dev.tsx']);
  });

  it('o next.config só aceita ".dev.tsx" como página em desenvolvimento', () => {
    const config = readFileSync(path.join(WEB, 'next.config.ts'), 'utf8');
    expect(config).toContain("pageExtensions: process.env.NODE_ENV === 'development' ? [EXTENSAO_SO_DE_DESENVOLVIMENTO, 'tsx', 'ts'] : ['tsx', 'ts']");
  });

  it('só a página de desenvolvimento importa a bancada', () => {
    const src = path.join(WEB, 'src');
    const quemImporta = arquivosDeCodigo(src)
      .filter((a) => !a.startsWith(path.join(src, 'editor/bancada') + path.sep) && !/\.test\.tsx?$/.test(a))
      .filter((a) => /from '[^']*\/bancada\//.test(readFileSync(a, 'utf8')))
      .map((a) => path.relative(src, a));
    expect(quemImporta).toEqual(['app/editor/bancada/page.dev.tsx']);
  });
});
