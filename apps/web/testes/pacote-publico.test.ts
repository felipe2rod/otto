// A regra do teste de pacote (ADR 019, guarda 2), sobre um build de mentira. O mesmo código roda de
// verdade depois de `next build`, por scripts/conferir-pacote-publico.ts.
import { describe, expect, it } from 'vitest';
import { conferirPacotePublico, type LeitorDoBuild } from '../scripts/pacotePublico';

const SENTINELA = 'marca-do-editor';

function build(arquivos: Record<string, string>): LeitorDoBuild {
  return { ler: (caminho) => arquivos[caminho], listar: (pasta) => Object.keys(arquivos).filter((a) => a.startsWith(`${pasta}/`)) };
}

const pagina = (...scripts: string[]) => `<html><body>${scripts.map((s) => `<script src="/_next/static/chunks/${s}" async=""></script>`).join('')}</body></html>`;
const conferir = (arquivos: Record<string, string>) => conferirPacotePublico(build(arquivos), { rotas: ['/'], proibidos: [SENTINELA] });

/** Um build são: a página pública carrega `publico.js`; o editor mora em `editor.js`, que ela não alcança. */
const SAO = {
  'server/app/index.html': pagina('publico.js', 'runtime.js'),
  'static/chunks/publico.js': 'console.log("site")',
  'static/chunks/runtime.js': 'carregar("static/chunks/publico.js")',
  'static/chunks/entrada-do-editor.js': 'import("static/chunks/editor.js")',
  'static/chunks/editor.js': `raiz.dataset.otto="${SENTINELA}"`,
};

describe('teste de pacote público', () => {
  it('passa quando nenhum script da página pública alcança o editor', () => {
    const r = conferir(SAO);
    expect(r.violacoes).toEqual([]);
    expect(r.conferido).toEqual({ paginas: 1, scripts: 2 });
  });

  it('acusa a sentinela num script que a página carrega direto', () => {
    const r = conferir({ ...SAO, 'static/chunks/publico.js': `x="${SENTINELA}"` });
    expect(r.violacoes).toEqual([`/ carrega código do editor: "${SENTINELA}" em static/chunks/publico.js`]);
  });

  it('acusa a sentinela num script alcançado por outro (import dinâmico a partir do site)', () => {
    const r = conferir({ ...SAO, 'static/chunks/publico.js': 'import("static/chunks/entrada-do-editor.js")' });
    expect(r.violacoes).toEqual([`/ carrega código do editor: "${SENTINELA}" em static/chunks/editor.js`]);
  });

  it('acusa .wasm citado por script público ou pelo próprio HTML', () => {
    expect(conferir({ ...SAO, 'static/chunks/publico.js': 'fetch("/_next/static/media/motor.wasm")' }).violacoes).toEqual(['/ cita um .wasm em static/chunks/publico.js']);
    expect(conferir({ ...SAO, 'server/app/index.html': `${pagina('publico.js')}<link rel="preload" href="/motor.wasm">` }).violacoes).toEqual(['/ cita um .wasm em server/app/index.html']);
  });

  it('acusa a sentinela escrita no próprio HTML (componente de servidor que importou do editor)', () => {
    const r = conferir({ ...SAO, 'server/app/index.html': `${pagina('publico.js')}<div data-otto="${SENTINELA}"></div>` });
    expect(r.violacoes).toEqual([`/ carrega código do editor: "${SENTINELA}" em server/app/index.html`]);
  });

  it('com duas sentinelas (editor e motor), acusa a que aparecer no script público', () => {
    const comMotor = { ...SAO, 'static/chunks/motor.js': 'sentinela="marca-do-motor"' };
    const opcoes = { rotas: ['/'], proibidos: [SENTINELA, 'marca-do-motor'] };
    expect(conferirPacotePublico(build(comMotor), opcoes).violacoes).toEqual([]);

    const vazou = conferirPacotePublico(build({ ...comMotor, 'static/chunks/publico.js': 'x="MARCA-DO-MOTOR"' }), opcoes);
    expect(vazou.violacoes).toEqual(['/ carrega código do editor: "marca-do-motor" em static/chunks/publico.js']);
  });

  it('falha se a sentinela do motor não está em pacote nenhum (o motor deixou de ser empacotado, ou a marca mudou)', () => {
    const r = conferirPacotePublico(build(SAO), { rotas: ['/'], proibidos: [SENTINELA, 'marca-do-motor'] });
    expect(r.violacoes).toEqual(['a sentinela "marca-do-motor" não está em nenhum script do build: o teste não prova nada']);
  });

  it('falha se a sentinela não está em pacote nenhum: sem ela o teste não prova nada', () => {
    const r = conferir({ ...SAO, 'static/chunks/editor.js': 'sem marca' });
    expect(r.violacoes).toEqual([`a sentinela "${SENTINELA}" não está em nenhum script do build: o teste não prova nada`]);
  });

  it('falha se a página pública não foi gerada como estática', () => {
    const { 'server/app/index.html': _fora, ...semPagina } = SAO;
    expect(conferir(semPagina).violacoes).toEqual(['/ não foi gerada como página estática (falta server/app/index.html)']);
  });

  it('falha se a página não cita script nenhum: o formato do build mudou e o teste não está olhando nada', () => {
    const r = conferir({ ...SAO, 'server/app/index.html': '<html></html>' });
    expect(r.violacoes).toEqual(['/ não cita nenhum script de static/: o formato do build mudou?']);
  });

  it('falha se uma rota só de desenvolvimento aparece no build', () => {
    const opcoes = { rotas: ['/'], proibidos: [SENTINELA], rotasQueNaoPodemExistir: ['/editor/bancada'] };
    expect(conferirPacotePublico(build(SAO), opcoes).violacoes).toEqual([]);

    const comBancada = { ...SAO, 'server/app/editor/bancada/page.js': 'module.exports = {}' };
    expect(conferirPacotePublico(build(comBancada), opcoes).violacoes).toEqual(['/editor/bancada é rota só de desenvolvimento e está no build (server/app/editor/bancada/page.js)']);
  });

  it('rota com nome vira o arquivo de mesmo nome', () => {
    const r = conferirPacotePublico(build({ ...SAO, 'server/app/precos.html': pagina('publico.js') }), { rotas: ['/', '/precos'], proibidos: [SENTINELA] });
    expect(r.violacoes).toEqual([]);
    expect(r.conferido.paginas).toBe(2);
  });
});
