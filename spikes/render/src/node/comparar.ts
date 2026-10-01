// Compara, pixel a pixel, o que o navegador renderizou com o que o Node renderizou.
// Uso: node src/node/comparar.ts            compara todas as execuções em saida/navegador
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { comparar, type Diferenca } from '../motor/diferenca.ts';
import { canvasKit, RAIZ } from './carregar.ts';

if (import.meta.main) {
  const ck = await canvasKit();
  const pastaDoNode = path.join(RAIZ, 'saida/node');
  const pastaDoNavegador = path.join(RAIZ, 'saida/navegador');
  const pastaDosMapas = path.join(RAIZ, 'saida/diferenca');
  const referencia = JSON.parse(await readFile(path.join(pastaDoNode, 'fim.json'), 'utf8')) as { cenas: Record<string, { largura: number; altura: number; ms: number }> };
  const resultado: Record<string, unknown> = { node: referencia };
  for (const execucao of (await readdir(pastaDoNavegador, { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => e.name).sort()) {
    const fim = JSON.parse(await readFile(path.join(pastaDoNavegador, execucao, 'fim.json'), 'utf8').catch(() => '{}')) as Record<string, unknown>;
    // só as execuções da página de paridade têm cenas; bancada e causas ficam de fora
    if (!fim['cenas']) continue;
    const cenas: Record<string, Diferenca | { erro: string }> = {};
    console.log(`\n== ${execucao} (${(fim['gpu'] as { renderizador?: string } | undefined)?.renderizador ?? ''})`);
    console.log('cena'.padEnd(20), 'tamanho'.padEnd(12), 'máx'.padStart(4), 'diferentes'.padStart(11), '%'.padStart(8), '>2'.padStart(8), '>8'.padStart(8), '>32'.padStart(8), 'média'.padStart(8));
    for (const [nome, info] of Object.entries(referencia.cenas)) {
      const a = new Uint8Array(await readFile(path.join(pastaDoNode, `${nome}.rgba`)));
      const b = await readFile(path.join(pastaDoNavegador, execucao, `${nome}.rgba`)).then((x) => new Uint8Array(x)).catch(() => undefined);
      if (!b || b.length !== a.length) {
        cenas[nome] = { erro: b ? `tamanho diferente: ${b.length} bytes contra ${a.length}` : 'não renderizada' };
        console.log(nome.padEnd(20), cenas[nome]);
        continue;
      }
      const { d, mapa } = comparar(a, b, info.largura, info.altura);
      cenas[nome] = d;
      console.log(nome.padEnd(20), `${d.largura}×${d.altura}`.padEnd(12), String(d.maxima).padStart(4), String(d.diferentes).padStart(11), d.porcentagemDiferente.toFixed(3).padStart(8), String(d.acimaDe2).padStart(8), String(d.acimaDe8).padStart(8), String(d.acimaDe32).padStart(8), d.media.toFixed(4).padStart(8));
      if (d.diferentes > 0) {
        await mkdir(path.join(pastaDosMapas, execucao), { recursive: true });
        const img = ck.MakeImage({ width: d.largura, height: d.altura, colorType: ck.ColorType.RGBA_8888, alphaType: ck.AlphaType.Unpremul, colorSpace: ck.ColorSpace.SRGB }, mapa, d.largura * 4)!;
        await writeFile(path.join(pastaDosMapas, execucao, `${nome}.png`), img.encodeToBytes(ck.ImageFormat.PNG, 100)!);
        img.delete();
      }
    }
    resultado[execucao] = { ...fim, diferencaContraONode: cenas };
  }
  await writeFile(path.join(RAIZ, 'resultados/paridade.json'), JSON.stringify(resultado, null, 2));
  console.log('\ngravado em resultados/paridade.json; mapas de diferença em saida/diferenca/');
}
