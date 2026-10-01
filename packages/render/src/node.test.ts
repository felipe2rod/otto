import { existsSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { forma, peca, pixel } from './apoio-de-teste';
import { renderizarPrancheta } from './compositor';
import { arquivosDoMotor, carregarCanvasKit } from './node';
import { criarSessao } from './sessao';
import { VERSAO_DO_CANVASKIT } from './versao';

describe('carga do motor no Node', () => {
  it('cada chamada cria uma instância própria, pronta para renderizar', async () => {
    const [a, b] = await Promise.all([carregarCanvasKit(), carregarCanvasKit()]);
    expect(a).not.toBe(b);
    const sessao = criarSessao(a, { fontes: [], imagens: [] });
    const { doc, p } = peca([forma('a', 0, 0, 10, 10, '#ff0000')], { largura: 10, altura: 10 });
    expect(pixel(renderizarPrancheta(sessao, doc, p).rgba, 10, 5, 5)).toEqual([255, 0, 0, 255]);
    sessao.destruir();
  });

  it('a variante completa codifica JPEG; a padrão, só PNG', async () => {
    const codifica = async (variante: 'padrao' | 'completa'): Promise<boolean> => {
      const ck = await carregarCanvasKit(variante);
      const s = ck.MakeSurface(8, 8);
      const img = s?.makeImageSnapshot();
      const bytes = img?.encodeToBytes(ck.ImageFormat.JPEG, 80);
      img?.delete();
      s?.delete();
      return Boolean(bytes?.length);
    };
    expect(await codifica('padrao')).toBe(false);
    expect(await codifica('completa')).toBe(true);
  });

  it('diz ao app web quais arquivos servir, e eles existem', () => {
    const { versao, arquivos } = arquivosDoMotor();
    expect(versao).toBe(VERSAO_DO_CANVASKIT);
    expect(arquivos.map((a) => a.nome)).toEqual(['canvaskit.js', 'canvaskit.wasm']);
    for (const a of arquivos) expect(existsSync(a.caminho)).toBe(true);
    expect(statSync((arquivos[1] as { caminho: string }).caminho).size).toBeGreaterThan(5_000_000);
  });
});
