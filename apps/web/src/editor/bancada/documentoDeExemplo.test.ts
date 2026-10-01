import { Documento, todasAsCamadas } from '@otto/documento';
import { describe, expect, it } from 'vitest';
import { FONTES_DE_EXEMPLO, montarDocumentoDeExemplo } from './documentoDeExemplo';

const imagem = { hash: 'a'.repeat(64), largura: 1200, altura: 800 };

describe('documento de exemplo da bancada', () => {
  it('é um documento válido pelo esquema de @otto/documento', () => {
    expect(Documento.safeParse(montarDocumentoDeExemplo(imagem)).success).toBe(true);
  });

  it('tem texto, forma e imagem, em mais de uma prancheta (uma delas story, para as guias)', () => {
    const doc = montarDocumentoDeExemplo(imagem);
    const tipos = new Set(doc.pranchetas.flatMap((p) => todasAsCamadas(p.filhos).map((n) => n.tipo)));

    expect([...tipos].sort()).toEqual(expect.arrayContaining(['forma', 'imagem', 'texto']));
    expect(doc.pranchetas.length).toBeGreaterThanOrEqual(2);
    expect(doc.pranchetas.some((p) => p.largura === 1080 && p.altura === 1920)).toBe(true);
  });

  it('a imagem aponta para o arquivo que a bancada gerou', () => {
    const doc = montarDocumentoDeExemplo(imagem);
    const fotos = doc.pranchetas.flatMap((p) => todasAsCamadas(p.filhos)).filter((n) => n.tipo === 'imagem');
    expect(fotos.map((f) => f.arquivo)).toEqual([imagem.hash]);
  });

  it('é montado por operações do catálogo, com id de lote fixo: duas montagens dão os mesmos ids', () => {
    const ids = (d: Documento) => d.pranchetas.flatMap((p) => [p.id, ...todasAsCamadas(p.filhos).map((n) => n.id)]);
    expect(ids(montarDocumentoDeExemplo(imagem))).toEqual(ids(montarDocumentoDeExemplo(imagem)));
  });

  it('só usa fonte que a bancada sabe entregar', () => {
    const doc = montarDocumentoDeExemplo(imagem);
    const usadas = doc.pranchetas.flatMap((p) => todasAsCamadas(p.filhos)).flatMap((n) => (n.tipo === 'texto' ? [`${n.fonte}#${n.peso}`] : []));
    const entregues = new Set(FONTES_DE_EXEMPLO.map((f) => `${f.familia}#${f.peso}`));
    expect(usadas.length).toBeGreaterThan(0);
    expect(usadas.filter((f) => !entregues.has(f))).toEqual([]);
  });
});
