// O relatório de exportação: o que cada camada virou e por quê. Sai sem renderizar, e é o mesmo que a exportação devolve.
import { aplicarLote, type Documento } from '@otto/documento';
import { FOTO } from '@otto/render/apoio-de-teste';
import type { CanvasKit } from 'canvaskit-wasm';
import { beforeAll, describe, expect, it } from 'vitest';
import { criarFormatoPsd } from './adaptadores/biblioteca-de-psd';
import { recursosDeTeste } from './apoio-de-teste';
import { cenasDeGolden } from './cenas-de-golden';
import { exportarPsd, type RecursosConhecidos, type RecursosDaExportacao, relatorioDeExportacao } from './exportar';
import { MAPEAMENTO } from './mapeamento';
import { relatorioEmTexto } from './relatorio';

let ck: CanvasKit;
let recursos: RecursosDaExportacao;
let conhecidos: RecursosConhecidos;
beforeAll(async () => {
  ({ ck, recursos, conhecidos } = await recursosDeTeste());
});

const cena = (nome: string): Documento => {
  const achada = cenasDeGolden().find((c) => c.nome === nome);
  if (!achada) throw new Error(`sem cena ${nome}`);
  return achada.doc;
};
const linhas = (doc: Documento, r = conhecidos) => Object.fromEntries(relatorioDeExportacao(doc, r).camadas.map((l) => [l.camada, l]));

describe('relatório sem renderizar', () => {
  it('é o mesmo relatório que a exportação devolve, fora a lista de arquivos', async () => {
    for (const c of cenasDeGolden()) {
      const previsto = relatorioDeExportacao(c.doc, conhecidos, c.arquivos ? { arquivos: c.arquivos } : {});
      const { relatorio } = await exportarPsd(ck, criarFormatoPsd(), c.doc, recursos, { nome: c.nome, ...(c.arquivos ? { arquivos: c.arquivos } : {}) });
      expect(relatorio.arquivos.length).toBeGreaterThan(0);
      expect({ ...relatorio, arquivos: [] }, c.nome).toEqual(previsto);
    }
  });

  it('toda linha aponta para uma linha do mapeamento, com destino coerente', () => {
    for (const c of cenasDeGolden()) {
      for (const l of relatorioDeExportacao(c.doc, conhecidos).camadas) {
        const m = MAPEAMENTO[l.mapeamento];
        expect(m, `${c.nome}/${l.camada}`).toBeDefined();
        expect(m.destino).toBe(l.destino === 'raster-com-aviso' ? 'Raster' : 'Nativo');
      }
    }
  });
});

describe('destino de cada camada', () => {
  it('forma: vetorial e editável; com filtro, vira pixel com aviso', () => {
    const l = linhas(cena('forma'));
    expect(l.Fundo).toMatchObject({ tipo: 'prancheta', destino: 'nativo-editavel', mapeamento: 'fundo-da-prancheta' });
    expect(l.Arredondado).toMatchObject({ destino: 'nativo-editavel', mapeamento: 'no:forma' });
    expect(l.Arredondado?.observacao).toContain('raio 18');
    expect(l['Com traço e sombra']?.observacao).toContain('sombra projetada, traço interno como efeito de camada');
    expect(l.Girada?.observacao).toContain('girada 12°');
    expect(l['Com filtro']).toMatchObject({ destino: 'raster-com-aviso', mapeamento: 'filtro-fora-de-foto' });
    expect(l['Com filtro']?.observacao).toContain('desfoque');
  });

  it('texto: editável, com a fonte pelo nome PostScript; peso que não existe sai com o mais próximo, e isso fica registrado', () => {
    const rel = relatorioDeExportacao(cena('texto'), conhecidos);
    const l = Object.fromEntries(rel.camadas.map((x) => [x.camada, x]));
    expect(l.Título).toMatchObject({ destino: 'nativo-editavel', mapeamento: 'no:texto' });
    expect(l.Título?.observacao).toContain('Anton-Regular');
    expect(l.Parágrafo?.observacao).toContain('trechos de estilo');
    expect(rel.fontes.map((f) => f.postScript).sort()).toEqual(['Anton-Regular', 'DMSerifDisplay-Regular', 'IBMPlexSans', 'IBMPlexSans-Bold']);
    expect(rel.fontes.find((f) => f.postScript === 'Anton-Regular')).toEqual({ familia: 'Anton', peso: 400, postScript: 'Anton-Regular', arquivo: 'Anton-Regular.ttf' });
    expect(rel.substituicoes).toEqual([
      { camada: 'Peça / Peso trocado', pedida: { familia: 'IBM Plex Sans', peso: 600 }, usada: { familia: 'IBM Plex Sans', peso: 700, postScript: 'IBMPlexSans-Bold' } },
    ]);
    expect(rel.avisos.map((a) => a.codigo)).toEqual(['atualizar-texto', 'instalar-fontes', 'fonte-substituida', 'recalculo-do-photoshop']);
  });

  it('texto com fonte que não foi entregue: sai como pixel vazio, e o relatório diz qual fonte falta', () => {
    const semAnton: RecursosConhecidos = { ...conhecidos, fontes: conhecidos.fontes.filter((f) => f.familia !== 'Anton') };
    const rel = relatorioDeExportacao(cena('texto'), semAnton);
    const titulo = rel.camadas.find((x) => x.camada === 'Título');
    expect(titulo).toMatchObject({ destino: 'raster-com-aviso', mapeamento: 'texto-sem-fonte' });
    expect(rel.emFalta.fontes).toEqual([{ familia: 'Anton', camadas: ['Peça / Título', 'Peça / Girado'] }]);
    expect(rel.avisos.map((a) => a.codigo)).toContain('fonte-em-falta');
    expect(rel.fontes.map((f) => f.familia)).not.toContain('Anton');
  });

  it('foto: objeto inteligente com o original embutido; filtros inteligentes; ajuste de cor em camadas presas', () => {
    const rel = relatorioDeExportacao(cena('imagem'), conhecidos);
    const l = Object.fromEntries(rel.camadas.map((x) => [x.camada, x]));
    expect(l.Cobrir).toMatchObject({ destino: 'nativo-editavel', mapeamento: 'no:imagem' });
    expect(l['Com filtros']?.observacao).toContain('filtros inteligentes: desfoque, ruído');
    expect(l['Recorte em elipse']?.observacao).toContain('(elipse)');
    expect(l['Com ajuste de cor: brilho e contraste']).toMatchObject({ tipo: 'ajuste', destino: 'nativo-editavel', mapeamento: 'ajuste-de-cor-da-foto' });
    expect(l['Com ajuste de cor: saturação']).toBeDefined();
    expect(l['Com ajuste de cor: brilho e contraste']?.idDoNo).toBeUndefined();
    expect(l.Sujeito?.observacao).toContain('máscara do sujeito');
    expect(rel.avisos.map((a) => a.codigo)).toContain('objeto-inteligente');
  });

  it('foto cujo arquivo não foi entregue, em WebP, ou presa por recorte e com ajuste de cor', () => {
    const doc = cena('imagem');
    const semFoto = relatorioDeExportacao(doc, { ...conhecidos, imagens: conhecidos.imagens.filter((i) => i.arquivo !== FOTO) });
    expect(semFoto.camadas.find((x) => x.camada === 'Cobrir')).toMatchObject({ destino: 'nativo-pixel', mapeamento: 'no:imagem' });
    expect(semFoto.emFalta.imagens[0]?.arquivo).toBe(FOTO);
    expect(semFoto.emFalta.imagens[0]?.camadas).toContain('Peça / Cobrir');
    expect(semFoto.avisos.map((a) => a.codigo)).toContain('imagem-em-falta');
    // sem a foto, a máscara de sujeito não tem como valer
    expect(semFoto.camadas.find((x) => x.camada === 'Sujeito')?.observacao).toContain('máscara do sujeito não aplicada');

    const emWebp = relatorioDeExportacao(doc, { ...conhecidos, imagens: conhecidos.imagens.map((i) => (i.arquivo === FOTO ? { ...i, tipo: 'image/webp' as const } : i)) });
    expect(emWebp.camadas.find((x) => x.camada === 'Cobrir')).toMatchObject({ destino: 'raster-com-aviso', mapeamento: 'foto-em-webp' });

    const r = aplicarLote(doc, [{ op: 'alterar', alvo: 'Peça/Com ajuste de cor', props: { recortadaNaDeBaixo: true } }], { autoria: { tipo: 'designer' }, idDoLote: 'prender' });
    if (!r.ok) throw new Error(r.erro.mensagem);
    const presa = relatorioDeExportacao(r.doc, conhecidos);
    expect(presa.camadas.find((x) => x.camada === 'Com ajuste de cor')).toMatchObject({ destino: 'raster-com-aviso', mapeamento: 'foto-recortada-com-ajuste-de-cor' });
    expect(presa.camadas.some((x) => x.camada.startsWith('Com ajuste de cor:'))).toBe(false);
  });

  it('vetor: grupo de camadas de forma; grupo, ajuste, máscara, recorte e modo aparecem na observação', () => {
    const v = linhas(cena('vetor'));
    expect(v.Logo).toMatchObject({ destino: 'nativo-editavel', mapeamento: 'no:vetor' });
    expect(v.Logo?.observacao).toContain('grupo com 2 camadas de forma, 1 com traçado vetorial');
    const g = linhas(cena('grupo-e-ajuste'));
    expect(g.Luzes).toMatchObject({ tipo: 'grupo', mapeamento: 'no:grupo' });
    expect(g.Luzes?.observacao).toContain('máscara em degradê (90°)');
    expect(g['Preto e branco no texto']).toMatchObject({ mapeamento: 'ajuste:preto-e-branco' });
    expect(g['Preto e branco no texto']?.observacao).toContain('presa à camada de baixo');
    expect(g['Níveis em sobrepor']?.observacao).toContain('modo sobrepor');
    expect(g['Níveis em sobrepor']?.observacao).toContain('invertida');
  });
});

describe('tokens, imagens e avisos', () => {
  it('lista só os tokens que o que está sendo exportado usa, com onde, e a origem e licença de cada imagem de banco', () => {
    const doc = cena('peca');
    const rel = relatorioDeExportacao(doc, conhecidos, { arquivos: 'juntas' });
    expect(rel.tokens.map((t) => t.nome).sort()).toEqual(['claro', 'fundo', 'marca']);
    expect(rel.tokens.find((t) => t.nome === 'marca')).toEqual({ nome: 'marca', valor: '#ea580c', usadoEm: ['Feed / Fundo do botão'] });
    expect(rel.tokens.find((t) => t.nome === 'fundo')?.usadoEm).toEqual(['Feed / Fundo', 'Feed / Película', 'Story / Fundo']);
    expect(rel.imagens).toEqual([{ camada: 'Feed / Foto', banco: 'Banco de teste', autor: 'Autora de teste', licenca: 'Licença de teste', url: 'https://exemplo.test/foto/1' }]);
    expect(rel.avisos.map((a) => a.codigo)).toContain('tokens-viram-valor');
    // só uma prancheta: os tokens são os dela
    const story = doc.pranchetas[1]?.id as string;
    expect(
      relatorioDeExportacao(doc, conhecidos, { pranchetas: [story] })
        .tokens.map((t) => t.nome)
        .sort(),
    ).toEqual(['claro', 'fundo']);
  });

  it('prancheta que não existe é erro que diz qual', () => {
    expect(() => relatorioDeExportacao(cena('peca'), conhecidos, { pranchetas: ['nao-existe'] })).toThrow(/"nao-existe" não existe/);
  });

  it('em texto, para acompanhar o arquivo', () => {
    const rel = relatorioDeExportacao(cena('texto'), conhecidos);
    const texto = relatorioEmTexto('Cartaz', { ...rel, arquivos: ['Cartaz.psd'] });
    expect(texto).toContain('# Relatório de exportação: Cartaz');
    expect(texto).toContain('| Peça | Título | texto | Editável |');
    expect(texto).toContain('- IBM Plex Sans 700 (IBMPlexSans-Bold), arquivo IBMPlexSans-Bold.ttf');
    expect(texto).toContain('- Peça / Peso trocado: pediu IBM Plex Sans 600, saiu com IBM Plex Sans 700');
  });
});
