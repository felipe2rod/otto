// O adaptador do catálogo contra respostas gravadas em 2026-10-02 (gravacoes/). Sem rede.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { contratoDoCatalogoDeFontes } from '../../../application/catalogo-de-fontes.contrato';
import { CatalogoGoogleFonts, type CatalogoGuardado } from './catalogo-google-fonts';

const aqui = (arquivo: string) => path.join(import.meta.dirname, 'gravacoes', arquivo);
// a resposta de verdade pode vir com um prefixo antes do JSON
const CATALOGO = `)]}'\n${readFileSync(aqui('metadata-fonts.json'), 'utf8')}`;
const FOLHA = readFileSync(aqui('css2-playfair-display-500.css'), 'utf8');
const ANTON = new Uint8Array(readFileSync(path.resolve(import.meta.dirname, '../../../../../../../packages/render/recursos-de-teste/fontes/Anton-Regular.ttf')));

function redeGravada(extra: { catalogo?: string; folha?: string; catalogoFora?: boolean; guardado?: CatalogoGuardado; agora?: () => number } = {}) {
  const idas: string[] = [];
  const buscar = async (endereco: string, init: { redirect: 'error' }) => {
    idas.push(endereco);
    expect(init.redirect).toBe('error');
    if (endereco === 'https://fonts.google.com/metadata/fonts') return extra.catalogoFora ? new Response('', { status: 503 }) : new Response(extra.catalogo ?? CATALOGO, { status: 200 });
    if (endereco.startsWith('https://fonts.googleapis.com/css2?')) return new Response(extra.folha ?? FOLHA, { status: 200 });
    if (endereco.startsWith('https://fonts.gstatic.com/')) return new Response(ANTON, { status: 200, headers: { 'content-type': 'font/ttf' } });
    return new Response('', { status: 404 });
  };
  return { idas, catalogo: new CatalogoGoogleFonts({ buscar, ...(extra.guardado ? { guardado: extra.guardado } : {}), ...(extra.agora ? { agora: extra.agora } : {}) }) };
}

contratoDoCatalogoDeFontes('Google Fonts (respostas gravadas)', () => {
  const { idas, catalogo } = redeGravada();
  return { catalogo, existe: { familia: 'Playfair Display', peso: 500 }, idas: () => idas.length };
});

describe('CatalogoGoogleFonts', () => {
  it('lê o catálogo gravado: categoria em português, só os pesos retos, só o que tem alfabeto latino, da mais usada para a menos', async () => {
    const familias = await redeGravada().catalogo.familias();
    expect(familias.map((f) => f.familia).sort()).toEqual(['Caveat', 'Lilita One', 'Noto Sans JP', 'Noto Sans Thai', 'Playfair Display', 'Poppins', 'Roboto Mono']);
    expect(familias[0]?.familia).toBe('Poppins');
    expect(familias.find((f) => f.familia === 'Poppins')).toMatchObject({ categoria: 'sem serifa', pesos: [100, 200, 300, 400, 500, 600, 700, 800, 900] });
    expect(familias.find((f) => f.familia === 'Playfair Display')).toMatchObject({ categoria: 'serifada', pesos: [400, 500, 600, 700, 800, 900] });
    expect(familias.find((f) => f.familia === 'Caveat')?.categoria).toBe('manuscrita');
    expect(familias.find((f) => f.familia === 'Roboto Mono')?.categoria).toBe('monoespaçada');
  });

  it('pede a folha de estilo da família e do peso, e baixa o arquivo que ela aponta', async () => {
    const { idas, catalogo } = redeGravada();
    await catalogo.baixar('Playfair Display', 500);
    expect(idas).toEqual([
      'https://fonts.google.com/metadata/fonts',
      'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@500',
      'https://fonts.gstatic.com/s/playfairdisplay/v40/nuFvD-vYSZviVYUb_rj3ij__anPXJzDwcbmjWBN2PKd3vUDQ.ttf',
    ]);
  });

  it('família fora do catálogo não gera pedido nenhum: o nome de quem pediu nunca vira endereço', async () => {
    const { idas, catalogo } = redeGravada();
    expect(await catalogo.baixar('../../etc/passwd', 400)).toBeUndefined();
    expect(await catalogo.baixar('Playfair Display&text=x', 400)).toBeUndefined();
    expect(idas).toEqual(['https://fonts.google.com/metadata/fonts']);
  });

  it.each([
    ['http://fonts.gstatic.com/s/x.ttf', 'resposta'],
    ['https://atacante.exemplo.com/x.ttf', 'endereco'],
    ['https://fonts.gstatic.com.atacante.exemplo.com/x.ttf', 'endereco'],
    ['https://169.254.169.254/x.ttf', 'endereco'],
  ])('folha de estilo que aponta para %s é recusada, e o arquivo não é baixado', async (endereco, motivo) => {
    const { idas, catalogo } = redeGravada({ folha: `@font-face { src: url(${endereco}) format('truetype'); }` });
    await expect(catalogo.baixar('Playfair Display', 500)).rejects.toMatchObject({ motivo });
    expect(idas).toHaveLength(2);
  });

  it('catálogo que não é o esperado, ou fora do ar, vira "indisponível"; a chamada seguinte tenta de novo', async () => {
    await expect(redeGravada({ catalogo: '<html>mudou</html>' }).catalogo.familias()).rejects.toMatchObject({ motivo: 'resposta' });
    const fora = redeGravada({ catalogoFora: true });
    await expect(fora.catalogo.familias()).rejects.toMatchObject({ motivo: 'rede' });
    await expect(fora.catalogo.familias()).rejects.toMatchObject({ motivo: 'rede' });
    expect(fora.idas).toHaveLength(2);
  });

  it('o catálogo fica guardado: outro processo, dentro de 7 dias, não vai à rede; depois de 7 dias, vai', async () => {
    let conteudo: Uint8Array | undefined;
    const guardado: CatalogoGuardado = {
      ler: async () => conteudo,
      guardar: async (c) => {
        conteudo = c;
      },
    };
    let agora = Date.parse('2026-10-04T12:00:00.000Z');
    const primeiro = redeGravada({ guardado, agora: () => agora });
    const familias = await primeiro.catalogo.familias();
    expect(conteudo).toBeDefined();
    const segundo = redeGravada({ guardado, agora: () => agora });
    expect(await segundo.catalogo.familias()).toEqual(familias);
    expect(segundo.idas).toEqual([]);
    agora += 8 * 24 * 3_600_000;
    const terceiro = redeGravada({ guardado, agora: () => agora });
    await terceiro.catalogo.familias();
    expect(terceiro.idas).toEqual(['https://fonts.google.com/metadata/fonts']);
    // vencido e com a rede fora: o guardado ainda serve
    const quarto = redeGravada({ guardado: { ler: async () => conteudo, guardar: async () => undefined }, agora: () => agora + 30 * 24 * 3_600_000, catalogoFora: true });
    expect(await quarto.catalogo.familias()).toEqual(familias);
  });
});
