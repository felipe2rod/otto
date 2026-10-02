// O motor de importação de verdade (@otto/psd sobre o CanvasKit), no próprio laço.
import { createHash } from 'node:crypto';
import { Documento } from '@otto/documento';
import { ErroDeImportacao } from '@otto/psd';
import { describe, expect, it } from 'vitest';
import { anton, deFora, golden, plexBold } from './apoio-de-teste';
import { MotorDeImportacaoComRender } from './motor-de-importacao-com-render';

const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const nos = (doc: Documento) => doc.pranchetas.flatMap((p) => p.filhos);

describe('MotorDeImportacaoComRender', { timeout: 60_000 }, () => {
  const motor = new MotorDeImportacaoComRender();

  it('PSD exportado pelo Otto, com a fonte: o texto volta editável, a árvore é válida e cada imagem tem a chave do próprio conteúdo', async () => {
    const r = await motor.importar(golden('peca'), { fontes: [anton(), plexBold()], substituicoes: {} });
    expect(Documento.safeParse(r.doc).success).toBe(true);
    expect(r.doc.pranchetas.map((p) => p.nome)).toEqual(['Feed', 'Story']);
    expect(r.relatorio.emFalta.fontes).toEqual([]);
    expect(r.relatorio.camadas.some((c) => c.tipo === 'texto' && c.destino === 'editavel')).toBe(true);
    for (const imagem of r.imagens) expect(sha256(imagem.bytes)).toBe(imagem.arquivo);
    expect(motor.cargasDoMotor).toBe(1);
  });

  it('sem a fonte, o texto vem como imagem e o relatório diz qual fonte faltou', async () => {
    const r = await motor.importar(golden('texto'), { fontes: [], substituicoes: {} });
    expect(r.relatorio.emFalta.fontes.map((f) => f.postScript)).toContain('Anton-Regular');
    expect(r.relatorio.avisos.map((a) => a.codigo)).toContain('fonte-em-falta');
    expect(nos(r.doc).some((n) => n.tipo === 'texto')).toBe(false);
  });

  it('PSD de fora, com texto em fonte que o Otto não tem: a troca pedida deixa o texto editável e vai para o relatório', async () => {
    const bytes = deFora('text-simple.psd');
    const semTroca = await motor.importar(Uint8Array.from(bytes), { fontes: [anton()], substituicoes: {} });
    const pedidas = semTroca.relatorio.emFalta.fontes.map((f) => f.postScript);
    expect(pedidas.length).toBeGreaterThan(0);
    const comTroca = await motor.importar(Uint8Array.from(bytes), { fontes: [anton()], substituicoes: Object.fromEntries(pedidas.map((p) => [p, 'Anton-Regular'])) });
    expect(comTroca.relatorio.emFalta.fontes).toEqual([]);
    expect(comTroca.relatorio.substituicoes.map((s) => s.usada.postScript)).toContain('Anton-Regular');
    expect(nos(comTroca.doc).some((n) => n.tipo === 'texto')).toBe(true);
  });

  it('nome de fonte hostil não alcança o protótipo do objeto de trocas', async () => {
    const r = await motor.importar(deFora('text-simple.psd'), { fontes: [anton()], substituicoes: JSON.parse('{"__proto__":{"x":"Anton-Regular"}}') as Record<string, string> });
    expect(r.relatorio.substituicoes).toEqual([]);
  });

  it('o mesmo arquivo dá a mesma árvore, id por id', async () => {
    const [a, b] = [await motor.importar(deFora('groups.psd'), { fontes: [], substituicoes: {} }), await motor.importar(deFora('groups.psd'), { fontes: [], substituicoes: {} })];
    expect(a.doc).toEqual(b.doc);
  });

  it('arquivo que a v1 não aceita, arquivo cortado e arquivo acima do teto lançam ErroDeImportacao, com o código', async () => {
    await expect(motor.importar(deFora('grayscale.psd'), { fontes: [], substituicoes: {} })).rejects.toMatchObject({ name: 'ErroDeImportacao', codigo: 'modo-de-cor' });
    await expect(motor.importar(deFora('groups.psd').subarray(0, 5000), { fontes: [], substituicoes: {} })).rejects.toBeInstanceOf(ErroDeImportacao);
    await expect(motor.importar(deFora('groups.psd'), { fontes: [], substituicoes: {}, limites: { camadas: 2 } })).rejects.toMatchObject({ codigo: 'camadas-demais' });
    await expect(motor.importar(new TextEncoder().encode('<svg/>'), { fontes: [], substituicoes: {} })).rejects.toMatchObject({ codigo: 'nao-e-psd' });
  });
});
