// O relatório da API vira o que a tela mostra. As frases são as de textos/, escolhidas por código:
// as de @otto/psd não passaram pelo guardião e falam do Photoshop, que ninguém conferiu ainda.
import type { RelatorioDeExportacao } from '@otto/shared';
import { describe, expect, it } from 'vitest';
import { exportar as textos } from '../../textos/exportar';
import { lerRelatorio } from './relatorio';

const t = textos.relatorio;
const vazio: RelatorioDeExportacao = { arquivos: [], camadas: [], tokens: [], fontes: [], substituicoes: [], emFalta: { fontes: [], imagens: [] }, imagens: [], avisos: [] };
const linha = (camada: string, tipo: string, destino: RelatorioDeExportacao['camadas'][number]['destino'], mapeamento: string, observacao = 'FRASE DO PACOTE, com Photoshop') => ({
  prancheta: 'Feed',
  camada,
  tipo,
  destino,
  mapeamento,
  observacao,
});

describe('ler o relatório', () => {
  it('conta o que vai com os dados de edição e lista o que vai em pixel, com o motivo da tela', () => {
    const r = lerRelatorio({
      ...vazio,
      camadas: [
        linha('Fundo', 'prancheta', 'nativo-editavel', 'fundo-da-prancheta'),
        linha('Título', 'texto', 'nativo-editavel', 'no:texto'),
        linha('Selo', 'forma', 'raster-com-aviso', 'filtro-fora-de-foto'),
        linha('Foto', 'imagem', 'nativo-pixel', 'no:imagem'),
        linha('Novidade', 'vetor', 'raster-com-aviso', 'mapeamento-que-ainda-nao-existe'),
      ],
    });

    expect(r.comEdicao).toBe(2);
    expect(r.emPixel).toEqual([
      { onde: 'Feed / Selo', motivo: t.emPixel.motivos['filtro-fora-de-foto'] },
      { onde: 'Feed / Foto', motivo: t.emPixel.semOriginal },
      { onde: 'Feed / Novidade', motivo: t.emPixel.generico },
    ]);
    expect(r.resumo).toBe(t.resumo(2, 3, 0));
  });

  it('nenhuma frase do pacote de PSD chega à tela', () => {
    const r = lerRelatorio({
      ...vazio,
      camadas: [linha('Selo', 'forma', 'raster-com-aviso', 'filtro-fora-de-foto'), linha('Título', 'texto', 'nativo-editavel', 'no:texto')],
      avisos: [
        { codigo: 'atualizar-texto', texto: 'Ao abrir, o Photoshop pode avisar…' },
        { codigo: 'sem-perfil-de-cor', texto: 'se o Photoshop perguntar, escolha sRGB' },
        { codigo: 'codigo-novo', texto: 'frase nova do pacote' },
      ],
    });
    const tudo = JSON.stringify(r);
    expect(tudo).not.toContain('FRASE DO PACOTE');
    expect(tudo).not.toContain('frase nova do pacote');
    expect(tudo).not.toMatch(/Photoshop/i);
    // o aviso com frase própria aparece; o que fala do que ninguém conferiu, e o desconhecido, não
    expect(r.observacoes).toEqual([t.observacoes.doCodigo['sem-perfil-de-cor']]);
  });

  it('fontes saem uma por família e peso, com o nome do peso', () => {
    const r = lerRelatorio({
      ...vazio,
      fontes: [
        { familia: 'IBM Plex Sans', peso: 700, postScript: 'IBMPlexSans-Bold' },
        { familia: 'Fonte Rara', peso: 950, postScript: 'Rara' },
      ],
    });
    expect(r.fontes).toEqual(['IBM Plex Sans Negrito (700)', 'Fonte Rara 950']);
  });

  it('peso trocado diz o pedido e o usado', () => {
    const r = lerRelatorio({ ...vazio, substituicoes: [{ camada: 'Feed / Título', pedida: { familia: 'Poppins', peso: 800 }, usada: { familia: 'Poppins', peso: 700, postScript: 'Poppins-Bold' } }] });
    expect(r.pesosTrocados).toEqual(['Feed / Título: pedido Poppins 800, usando 700']);
  });

  it('o que está em falta diz a consequência no arquivo', () => {
    const r = lerRelatorio({ ...vazio, emFalta: { fontes: [{ familia: 'Didot', camadas: ['Feed / Título', 'Story / Título'] }], imagens: [{ arquivo: 'a'.repeat(64), camadas: ['Feed / Foto'] }] } });
    expect(r.emFalta).toEqual([t.emFalta.fonte('Didot', ['Feed / Título', 'Story / Título']), t.emFalta.imagem(['Feed / Foto'])]);
    expect(r.emFalta[0]).toContain('vão sem o texto');
    expect(r.emFalta[1]).toContain('retângulo cinza');
  });

  it('imagens trazem crédito, licença e o endereço da página; endereço que não é http não vira link', () => {
    const r = lerRelatorio({
      ...vazio,
      imagens: [
        { camada: 'Feed / Foto', banco: 'Banco de exemplo', autor: 'alguém', licenca: 'Licença livre', url: 'https://exemplo.test/foto' },
        { camada: 'Story / Foto', banco: 'Banco de exemplo', autor: 'alguém', licenca: 'Licença livre', url: 'javascript:alert(1)' },
      ],
    });
    expect(r.imagens).toEqual([
      { texto: t.imagens.item('Feed / Foto', 'Banco de exemplo', 'alguém', 'Licença livre'), pagina: 'https://exemplo.test/foto' },
      { texto: t.imagens.item('Story / Foto', 'Banco de exemplo', 'alguém', 'Licença livre') },
    ]);
  });

  it('a tabela de todas as camadas traz tipo e destino com palavras da tela', () => {
    const r = lerRelatorio({ ...vazio, camadas: [linha('Fundo', 'prancheta', 'nativo-editavel', 'fundo-da-prancheta'), linha('Selo', 'forma', 'raster-com-aviso', 'filtro-fora-de-foto')] });
    expect(r.camadas).toEqual([
      { onde: 'Feed / Fundo', tipo: t.todas.fundoDaPrancheta, comoVai: t.todas.destinos['nativo-editavel'] },
      { onde: 'Feed / Selo', tipo: 'forma', comoVai: t.todas.destinos['raster-com-aviso'] },
    ]);
  });

  it('relatório de PNG (sem camadas) não inventa resumo', () => {
    expect(lerRelatorio(vazio)).toMatchObject({ temCamadas: false, comEdicao: 0, emPixel: [] });
  });

  it('SVG e PDF: o que fica de fora do arquivo tem lista própria, separada do que vai como imagem', () => {
    const r = lerRelatorio(
      {
        ...vazio,
        camadas: [
          linha('Título', 'texto', 'nativo-editavel', 'no:texto'),
          linha('Selo', 'forma', 'raster-com-aviso', 'efeito:sombraInterna'),
          linha('Foto', 'imagem', 'raster-com-aviso', 'mascara:degrade'),
          linha('Curvas', 'ajuste', 'omitido-com-aviso', 'ajuste:curvas'),
        ],
        avisos: [
          { codigo: 'ficou-de-fora', texto: 'As camadas de ajuste não vão…' },
          { codigo: 'modo-de-mesclagem-trocado', texto: 'Há camada com modo…' },
          { codigo: 'texto-em-linhas', texto: 'No Illustrator ele não requebra sozinho…' },
          { codigo: 'virou-imagem', texto: 'Algumas camadas saíram como imagem…' },
        ],
      },
      'svg',
    );

    expect(r.emPixel).toEqual([
      { onde: 'Feed / Selo', motivo: t.emPixel.porPrefixo.efeito },
      { onde: 'Feed / Foto', motivo: t.emPixel.porPrefixo.mascara },
    ]);
    expect(r.deFora).toEqual([{ onde: 'Feed / Curvas', motivo: t.deFora.ajuste }]);
    expect(r.modoTrocado).toBe(true);
    expect(r.resumo).toBe(t.resumo(1, 2, 0, 1));
    // o que tem seção própria não se repete nas observações; o texto em linhas tem frase da tela
    expect(r.observacoes).toEqual([t.observacoes.doCodigo['texto-em-linhas']]);
    expect(JSON.stringify(r)).not.toMatch(/Illustrator|Photoshop/i);
    // na tabela, a camada de fora diz que fica de fora
    expect(r.camadas.at(-1)).toEqual({ onde: 'Feed / Curvas', tipo: 'camada de ajuste', comoVai: t.todas.destinos['omitido-com-aviso'] });
  });

  it('no PSD nada fica de fora, e o título do que perdeu a edição fala em pixel; no vetor, em imagem', () => {
    const camadas = [linha('Selo', 'forma', 'raster-com-aviso' as const, 'filtro-fora-de-foto')];
    expect(lerRelatorio({ ...vazio, camadas }).tituloDoEmPixel).toBe(t.emPixel.titulo(1));
    expect(lerRelatorio({ ...vazio, camadas }, 'pdf').tituloDoEmPixel).toBe(t.emPixel.tituloNoVetor(1));
    expect(lerRelatorio({ ...vazio, camadas }).deFora).toEqual([]);
  });

  it('o mesmo motivo tem frase do vetor no SVG e no PDF: "só continua ajustável em foto" é coisa do PSD', () => {
    const camadas = [linha('Grão', 'forma', 'raster-com-aviso' as const, 'filtro-fora-de-foto')];
    expect(lerRelatorio({ ...vazio, camadas }).emPixel[0]?.motivo).toBe(t.emPixel.motivos['filtro-fora-de-foto']);
    expect(lerRelatorio({ ...vazio, camadas }, 'svg').emPixel[0]?.motivo).toBe(t.emPixel.porPrefixo.filtro);
  });

  it('pacote: diz quais fontes vão no .zip e quais não, com o motivo, sem inventar onde baixar', () => {
    const fonte = (familia: string, extra: Record<string, unknown>) => ({ familia, peso: 700, postScript: `${familia}-Bold`, licenca: null, incluida: false, ...extra });
    const r = lerRelatorio({
      ...vazio,
      pacote: {
        fontes: [
          fonte('Fraunces', { incluida: true, licenca: 'SIL Open Font License', arquivo: 'Fontes/Fraunces-Bold.ttf' }),
          fonte('Didot', { licenca: 'Licença comercial da fundição', motivo: 'licenca_nao_permite' }),
          fonte('Rara', { motivo: 'licenca_desconhecida' }),
        ],
      },
    });
    expect(r.pacote).toEqual({
      vao: ['Fraunces Negrito (700)'],
      naoVao: [
        t.pacote.naoVai('Didot Negrito (700)', t.pacote.motivos.licenca_nao_permite('Licença comercial da fundição')),
        t.pacote.naoVai('Rara Negrito (700)', t.pacote.motivos.licenca_desconhecida),
      ],
    });
    expect(JSON.stringify(r.pacote)).not.toMatch(/baixe em/i);
  });

  it('sem pedido de pacote, não há lista de fontes do pacote', () => {
    expect(lerRelatorio(vazio).pacote).toBeUndefined();
  });
});
