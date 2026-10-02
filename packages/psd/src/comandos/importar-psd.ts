// Importa um PSD (ou PSB) e grava ao lado o que o Otto fez dele, para a conferência de quem trouxe o arquivo (ADR 028, item 4).
//
//   1. copie o PSD para packages/psd/entrada/ (a pasta fica fora do git) e as fontes dele (.ttf, .otf) para packages/psd/entrada/fontes/
//   2. docker compose run --rm teste pnpm --filter @otto/psd importar:psd -- "entrada/meu arquivo.psd"
//
// Grava em packages/psd/saida/importado/<nome do arquivo>/:
//   - arvore.json: o documento do Otto
//   - relatorio.md e relatorio.json: o que veio editável, o que virou imagem, o que não veio, e as fontes que faltam
//   - "<prancheta>.png": o render do Otto
//   - "<prancheta> (lado a lado).png": à esquerda a imagem composta que o arquivo traz (o que o Photoshop mostrava ao
//     salvar), à direita o render do Otto
//   - "<nome> (de volta).psd": o documento importado, exportado de novo, para abrir no Photoshop
//   - imagens/: as imagens que a importação extraiu
//   - CONFERIR-A-IMPORTACAO.txt: o roteiro
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Prancheta } from '@otto/documento';
import { codificarPng, criarSessao, renderizarPrancheta } from '@otto/render';
import { carregarCanvasKit } from '@otto/render/node';
import { criarFormatoPsd } from '../adaptadores/biblioteca-de-psd';
import { exportarPsd, type FonteDaExportacao, nomeDeArquivo } from '../exportar';
import { fontesDoPsd, importarPsd } from '../importar';
import { ErroDeImportacao } from '../inspecionar';
import { relatorioDeImportacaoEmTexto } from '../relatorio-de-importacao';
import { fontesDaPasta } from './fontes-de-pasta';

const RAIZ = path.resolve(import.meta.dirname, '../../../..');
const PACOTE = path.resolve(import.meta.dirname, '../..');
const megas = (bytes: number): string => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

const ROTEIRO = `Conferência da importação de PSD (ADR 028, item 4)

Abra o PSD original no Photoshop, e ao lado os arquivos desta pasta.

 1. "<prancheta> (lado a lado).png": à esquerda o que o Photoshop mostrava quando o arquivo foi salvo; à direita o que o
    Otto desenha depois de importar. O que está diferente? (Cor geral, um efeito que sumiu, texto fora do lugar.)
    Se a esquerda estiver em branco, o arquivo foi salvo sem "Maximizar compatibilidade": compare com o Photoshop aberto.

 2. relatorio.md, lista de camadas. Para cada camada que NÃO veio editável ("Imagem" ou "Não veio"):
    o motivo escrito faz sentido para quem conhece o arquivo? Alguma delas você esperava editar no Otto?

 3. Texto. Para cada camada de texto que veio editável:
    a) está no mesmo lugar do Photoshop? (Meça o topo da primeira linha e a linha de base.)
    b) a quebra de linha é a mesma? (O Otto requebra com o motor dele: pode mudar.)
    c) a fonte, o tamanho, a cor e o espaçamento estão certos? Os trechos de estilo (palavra em outra cor) vieram?
    Texto que veio como imagem por falta de fonte: ponha o arquivo da fonte em packages/psd/entrada/fontes e rode de novo.

 4. Cor. O relatório diz o perfil de cor do arquivo. Se era Adobe RGB (ou outro RGB), as cores foram convertidas para
    sRGB: a peça parece a mesma do Photoshop, ou ficou lavada, ou saturada demais?

 5. Fotos. Objeto inteligente com foto veio como foto editável (relatório: "foto original do objeto inteligente")?
    O enquadramento é o mesmo? Foto com máscara: o recorte está no lugar?

 6. Formas e logos. Retângulo e elipse vieram como forma, e o logo em caminho veio como vetor? A cor e o contorno batem?

 7. Efeitos e ajustes. O relatório lista o que não veio ou veio aproximado. Na peça, isso aparece muito ou pouco?

 8. Nomes e ordem. As camadas estão na ordem do Photoshop, nos grupos certos, com os nomes do arquivo?
    (Nome repetido na mesma prancheta ganha um número: o relatório diz qual.)

 9. Pranchetas. Arquivo com pranchetas do Photoshop: cada uma virou uma prancheta, com o tamanho e a cor de fundo certos?

10. "<nome> (de volta).psd": é o documento importado, exportado de novo pelo Otto. Abra no Photoshop, ao lado do original.
    O que se perdeu na ida e volta, além do que o relatório já diz?

11. O tempo e a memória da importação estão impressos no terminal. O arquivo é dos grandes que você usa, ou dos pequenos?

Anote o número do item e o que viu. O que falhar muda de linha em docs/tecnico/psd.md.
`;

const caminho = process.argv.slice(2).find((a) => a !== '--');
if (!caminho) {
  process.stderr.write('Uso: pnpm --filter @otto/psd importar:psd -- "entrada/arquivo.psd"\n');
  process.exit(2);
}
const arquivo = path.resolve(PACOTE, caminho);
const bytes = new Uint8Array(await readFile(arquivo));
const nome = nomeDeArquivo(path.basename(arquivo).replace(/\.ps[db]$/i, ''));
const saida = path.join(PACOTE, 'saida/importado', nome);
const formato = criarFormatoPsd();

// as fontes: as que vieram com o arquivo, as de teste do motor e as da biblioteca da POC
const pastas = [
  path.join(path.dirname(arquivo), 'fontes'),
  path.join(PACOTE, 'entrada/fontes'),
  path.join(RAIZ, 'packages/render/recursos-de-teste/fontes'),
  path.join(RAIZ, 'poc/fontes'),
  path.join(RAIZ, 'poc/fontes/google'),
];
const disponiveis = new Map<string, FonteDaExportacao>();
for (const pasta of pastas) for (const f of await fontesDaPasta(pasta)) if (f.postScript && !disponiveis.has(f.postScript)) disponiveis.set(f.postScript, f);

try {
  const pedidas = fontesDoPsd(formato, bytes);
  const fontes = pedidas.flatMap((n) => disponiveis.get(n) ?? []);
  // o motor escolhe o arquivo pela família e pelo peso: as outras fontes da mesma família entram junto
  const familias = new Set(fontes.map((f) => f.familia));
  const todas = [...disponiveis.values()].filter((f) => familias.has(f.familia));
  const ck = await carregarCanvasKit('completa');
  const antes = process.memoryUsage().rss;
  const inicio = performance.now();
  const r = await importarPsd(ck, formato, bytes, { fontes: todas, nomeDaPrancheta: nome });
  const tempo = performance.now() - inicio;
  const pico = process.resourceUsage().maxRSS * 1024;

  await rm(saida, { recursive: true, force: true });
  await mkdir(path.join(saida, 'imagens'), { recursive: true });
  await writeFile(path.join(saida, 'arvore.json'), `${JSON.stringify(r.doc, null, 2)}\n`);
  await writeFile(path.join(saida, 'relatorio.json'), `${JSON.stringify(r.relatorio, null, 2)}\n`);
  await writeFile(path.join(saida, 'relatorio.md'), relatorioDeImportacaoEmTexto(nome, r.relatorio));
  await writeFile(path.join(saida, 'CONFERIR-A-IMPORTACAO.txt'), ROTEIRO);
  for (const i of r.imagens) await writeFile(path.join(saida, 'imagens', `${i.arquivo.slice(0, 16)}.${i.tipo === 'image/png' ? 'png' : 'jpg'}`), i.bytes);

  // o render do Otto, e ao lado a composta que o arquivo traz
  const lido = formato.ler?.(bytes);
  const composta = lido?.composta();
  const origens = lido?.camadas.some((c) => c.prancheta) ? (lido?.camadas.filter((c) => c.prancheta).map((c) => c.prancheta as { x: number; y: number }) ?? []) : [{ x: 0, y: 0 }];
  const recursos = { fontes: todas, imagens: r.imagens.map((i) => ({ arquivo: i.arquivo, bytes: i.bytes })) };
  const sessao = criarSessao(ck, { fontes: todas.map((f) => ({ familia: f.familia, peso: f.peso, bytes: f.bytes })), imagens: recursos.imagens });
  try {
    for (const [indice, p] of r.doc.pranchetas.entries()) {
      const otto = renderizarPrancheta(sessao, r.doc, p as Prancheta);
      const base = nomeDeArquivo(r.doc.pranchetas.length === 1 ? nome : `${nome} - ${p.nome}`);
      await writeFile(path.join(saida, `${base}.png`), codificarPng(sessao, otto));
      const origem = origens[indice];
      if (!composta || !lido || !origem) continue;
      const lado = new Uint8Array(p.largura * 2 * p.altura * 4).fill(255);
      for (let y = 0; y < p.altura; y++)
        for (let x = 0; x < p.largura; x++) {
          const destino = (y * p.largura * 2 + x) * 4;
          const fx = origem.x + x;
          const fy = origem.y + y;
          if (fx >= 0 && fy >= 0 && fx < lido.largura && fy < lido.altura) {
            const o = (fy * lido.largura + fx) * 4;
            const a = (composta[o + 3] as number) / 255;
            for (let c = 0; c < 3; c++) lado[destino + c] = Math.round((composta[o + c] as number) * a + 255 * (1 - a));
          }
          lado.set(otto.rgba.subarray((y * p.largura + x) * 4, (y * p.largura + x) * 4 + 4), destino + p.largura * 4);
        }
      await writeFile(path.join(saida, `${base} (lado a lado).png`), codificarPng(sessao, { largura: p.largura * 2, altura: p.altura, rgba: lado }));
    }
  } finally {
    sessao.destruir();
  }
  // de volta para PSD, para abrir no Photoshop ao lado do original
  const deVolta = await exportarPsd(ck, formato, r.doc, recursos, { nome: `${nome} (de volta)`, arquivos: r.doc.pranchetas.length > 1 ? 'juntas' : 'por-prancheta' });
  for (const a of deVolta.arquivos) await writeFile(path.join(saida, a.nome), a.bytes);

  const c = r.relatorio.camadas;
  const quantas = (destino: string): number => c.filter((l) => l.destino === destino).length;
  process.stdout.write(
    [
      `${path.basename(arquivo)}: ${megas(bytes.length)}, ${r.relatorio.arquivo.largura} × ${r.relatorio.arquivo.altura} px, ${r.relatorio.arquivo.camadas} registros de camada, perfil ${r.relatorio.arquivo.perfilDeCor ?? 'nenhum'} (${r.relatorio.arquivo.conversaoDeCor})`,
      `  pranchetas: ${r.doc.pranchetas.map((p) => `${p.nome} ${p.largura} × ${p.altura}`).join(', ')}`,
      `  camadas: ${quantas('editavel')} editáveis, ${quantas('imagem')} como imagem, ${quantas('ignorado')} não vieram; ${c.filter((l) => l.perdas?.length).length} com algo que não veio ou veio aproximado`,
      ...c.filter((l) => l.destino !== 'editavel' && l.mapeamento !== 'psd:camada-de-pixels').map((l) => `    - ${l.prancheta} / ${l.camada}: ${l.observacao ?? ''}`),
      `  fontes pedidas: ${pedidas.join(', ') || 'nenhuma'}`,
      ...(r.relatorio.emFalta.fontes.length
        ? [`  FONTES QUE FALTAM (ponha o arquivo em packages/psd/entrada/fontes e rode de novo): ${r.relatorio.emFalta.fontes.map((f) => f.postScript).join(', ')}`]
        : []),
      `  imagens extraídas: ${r.imagens.length} (${megas(r.imagens.reduce((s, i) => s + i.bytes.length, 0))})`,
      `  tempo da importação: ${Math.round(tempo)} ms; memória do processo: ${megas(antes)} antes, pico de ${megas(pico)}`,
      `  avisos: ${r.relatorio.avisos.map((a) => a.codigo).join(', ') || 'nenhum'}`,
      `Arquivos em ${saida}`,
      `O que conferir: ${path.join(saida, 'CONFERIR-A-IMPORTACAO.txt')}`,
      '',
    ].join('\n'),
  );
} catch (erro) {
  if (!(erro instanceof ErroDeImportacao)) throw erro;
  process.stdout.write(`${path.basename(arquivo)}: NÃO IMPORTADO (${erro.codigo})\n  ${erro.message}\n`);
  process.exit(1);
}
