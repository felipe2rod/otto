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
});
