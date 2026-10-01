// Exporta peças reais (as da POC) em PSD, para a conferência manual no Photoshop que o ADR 028 pede.
// Só LÊ de poc/. Escreve em packages/psd/saida/, que fica fora do git.
//
//   docker compose run --rm teste pnpm --filter @otto/psd exportar:pecas
//   docker compose run --rm teste pnpm --filter @otto/psd exportar:pecas -- <id da peça na POC> [<outro id> ...]
//
// Para cada peça grava: um PSD por prancheta, um PSD com todas as pranchetas (quando há mais de uma), o PNG de cada
// prancheta (o render do Otto, para comparar com o que o Photoshop mostra), o relatório e as fontes para instalar.
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Documento, todasAsCamadas } from '@otto/documento';
import { nomePostScript } from '@otto/render';
import { carregarCanvasKit } from '@otto/render/node';
import { criarFormatoPsd } from '../adaptadores/biblioteca-de-psd';
import { exportarPng, exportarPsd, type FonteDaExportacao, type ImagemDaExportacao, nomeDeArquivo } from '../exportar';
import { relatorioEmTexto } from '../relatorio';

const RAIZ = path.resolve(import.meta.dirname, '../../../..');
const POC = path.resolve(process.env.POC_PASTA ?? path.join(RAIZ, 'poc'));
const SAIDA = path.resolve(process.env.SAIDA_PASTA ?? path.join(RAIZ, 'packages/psd/saida'));
const PESOS = [300, 400, 500, 600, 700];

/** Peças escolhidas para cobrir o mapeamento: texto, forma, foto, vetor, grupo, ajuste, máscara, filtros e efeitos. */
const PADRAO = [
  // foto com máscara do sujeito, texto entre a foto e o sujeito, ajustes, ruído
  'mukclig2i3er25uo',
  // efeitos de camada, vetor, duas pranchetas, fontes fora da biblioteca base
  'muke3an6eafpfmh3',
  // grupos, camadas de ajuste, ruído, duas pranchetas
  'mukclyemcafjfrk6',
  // desfoque de movimento, quatro máscaras de sujeito, sombras
  'mumwjjx1ghzyk5hp',
  // nitidez
  'mun0q9fw4uortna2',
];

/** Família e peso de um arquivo de fonte, lidos dele: tabela "name" (registro 16, ou 1) e OS/2 (usWeightClass). */
function identidadeDaFonte(bytes: Uint8Array): { familia: string; peso: number } | undefined {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  try {
    let familia: string | undefined;
    let preferida: string | undefined;
    let peso: number | undefined;
    for (let i = 0; i < v.getUint16(4); i++) {
      const p = 12 + i * 16;
      const tabela = String.fromCharCode(v.getUint8(p), v.getUint8(p + 1), v.getUint8(p + 2), v.getUint8(p + 3));
      const inicio = v.getUint32(p + 8);
      if (tabela === 'OS/2') peso = v.getUint16(inicio + 4);
      if (tabela !== 'name') continue;
      const textos = inicio + v.getUint16(inicio + 4);
      for (let j = 0; j < v.getUint16(inicio + 2); j++) {
        const r = inicio + 6 + j * 12;
        const id = v.getUint16(r + 6);
        if (id !== 1 && id !== 16) continue;
        const plataforma = v.getUint16(r);
        const tamanho = v.getUint16(r + 8);
        const onde = textos + v.getUint16(r + 10);
        let nome = '';
        if (plataforma === 0 || plataforma === 3) for (let k = 0; k + 1 < tamanho; k += 2) nome += String.fromCharCode(v.getUint16(onde + k));
        else for (let k = 0; k < tamanho; k++) nome += String.fromCharCode(v.getUint8(onde + k));
        if (id === 16) preferida ??= nome;
        else familia ??= nome;
      }
    }
    const nome = preferida ?? familia;
    return nome && peso ? { familia: nome, peso } : undefined;
  } catch {
    return undefined;
  }
}

/** As fontes da POC: as da biblioteca base (poc/fontes) e as que ela baixou (poc/fontes/google). */
async function fontesDaPoc(familias: ReadonlySet<string>): Promise<FonteDaExportacao[]> {
  const fontes: FonteDaExportacao[] = [];
  const pasta = path.join(POC, 'fontes');
  for (const arquivo of (await readdir(pasta)).filter((n) => n.endsWith('.ttf')).sort()) {
    const bytes = new Uint8Array(await readFile(path.join(pasta, arquivo)));
    const identidade = identidadeDaFonte(bytes);
    if (identidade && familias.has(identidade.familia)) fontes.push({ ...identidade, bytes, arquivo });
  }
  for (const familia of familias) {
    if (fontes.some((f) => f.familia === familia)) continue;
    for (const peso of PESOS) {
      // a regra de nome da POC: família sem espaço, traço, peso
      const arquivo = `${familia.replace(/[^\w]+/g, '')}-${peso}.ttf`;
      const conteudo = await readFile(path.join(pasta, 'google', arquivo)).catch(() => undefined);
      if (conteudo && nomePostScript(new Uint8Array(conteudo))) fontes.push({ familia, peso, bytes: new Uint8Array(conteudo), arquivo });
    }
  }
  return fontes;
}

async function imagensDaPoc(doc: Documento): Promise<ImagemDaExportacao[]> {
  const chaves = new Set<string>();
  for (const p of doc.pranchetas) {
    for (const n of todasAsCamadas(p.filhos)) {
      if (n.tipo === 'imagem') chaves.add(n.arquivo);
      if (n.mascara?.tipo === 'sujeito') chaves.add(n.mascara.arquivo);
    }
  }
  const imagens: ImagemDaExportacao[] = [];
  for (const arquivo of chaves) {
    const bytes = await readFile(path.join(POC, 'dados/arquivos', arquivo)).catch(() => undefined);
    if (bytes) imagens.push({ arquivo, bytes: new Uint8Array(bytes) });
  }
  return imagens;
}

const megas = (bytes: number): string => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

const CONFERENCIA = `Conferência no Photoshop (ADR 028, item 6)

Para cada peça há: um PSD por prancheta, um PSD com todas as pranchetas, o PNG de cada prancheta (o que o Otto
renderiza) e o relatório. Instale antes as fontes da pasta "fontes" de cada peça.

Ao abrir
 1. O arquivo abre sem erro? Se o Photoshop mostrar algum aviso, qual é o texto dele?
 2. Aparece o pedido de atualizar as camadas de texto? Escolha "Atualizar" e veja se o texto muda de lugar ou de quebra de linha.
 3. O Photoshop reclama de fonte ausente mesmo com as fontes da pasta instaladas? Qual?
 4. Pergunta sobre perfil de cor? (O arquivo sai sem perfil embutido; o Otto trabalha em sRGB.)

Aparência
 5. Antes de mexer em qualquer coisa, compare com o PNG da prancheta. O que está diferente?
 6. Desligue e ligue uma camada com efeito (sombra, brilho, traço): a aparência volta igual? O tamanho da sombra e do brilho
    bate com o do PNG?
 7. Camadas com modo de mesclagem e camadas de ajuste: a cor bate com o PNG?

Texto
 8. Dê dois cliques num texto: ele entra em edição sem pular? Mudou a quebra de linha, a entrelinha ou o espaçamento?
 9. A fonte, o tamanho e a cor estão certos no painel Caractere? Em texto com trechos (preço em destaque), cada trecho tem o estilo dele?

Forma e vetor
10. A forma é camada de forma (ícone de forma no painel Camadas, cor trocável com dois cliques na miniatura)?
11. Com a seta branca, os pontos do caminho aparecem? O canto arredondado está redondo?
12. Vetor (logo, ícone): é um grupo com uma camada de forma por caminho? O traçado aparece no painel Propriedades?

Foto
13. A foto é objeto inteligente (ícone no canto da miniatura)? Dois cliques abrem a foto original inteira?
14. O corte da foto é uma máscara vetorial (segunda miniatura, cinza)?
15. Os filtros aparecem como filtros inteligentes embaixo da camada (desfoque, ruído, nitidez, desfoque de movimento)? Dois cliques
    abrem o filtro com o valor certo? Ao reaplicar, a aparência muda muito?
16. A mesma foto usada em duas camadas (fundo e sujeito): as duas são o mesmo objeto inteligente?
17. A máscara do sujeito aparece como máscara de camada, no lugar certo?

Estrutura
18. Os grupos estão no lugar, com os nomes das camadas do Otto? A máscara de recorte (seta para baixo) está nas camadas certas?
19. No PSD com todas as pranchetas: cada prancheta é uma prancheta do Photoshop, com o nome e o tamanho certos?

Anote, por peça, o número do item e o que viu. O que falhar muda de linha em docs/tecnico/psd.md.
`;

async function exportarPeca(ck: Awaited<ReturnType<typeof carregarCanvasKit>>, id: string): Promise<string[]> {
  const registro = JSON.parse(await readFile(path.join(POC, 'dados/documentos', `${id}.json`), 'utf8')) as { doc?: { nome?: unknown } };
  const lida = Documento.safeParse(registro.doc);
  if (!lida.success) return [`${id}: fora do esquema do documento (${lida.error.issues[0]?.path.join('.')}): pulada`];
  const doc = lida.data;
  const nome = nomeDeArquivo(typeof registro.doc?.nome === 'string' ? registro.doc.nome.slice(0, 60) : id);
  const familias = new Set<string>();
  for (const p of doc.pranchetas)
    for (const n of todasAsCamadas(p.filhos))
      if (n.tipo === 'texto') {
        familias.add(n.fonte);
        for (const t of n.trechos ?? []) if (t.fonte) familias.add(t.fonte);
      }
  const recursos = { fontes: await fontesDaPoc(familias), imagens: await imagensDaPoc(doc) };
  const pasta = path.join(SAIDA, nome);
  await rm(pasta, { recursive: true, force: true });
  await mkdir(path.join(pasta, 'fontes'), { recursive: true });

  const formato = criarFormatoPsd();
  const inicio = performance.now();
  const porPrancheta = await exportarPsd(ck, formato, doc, recursos, { nome });
  const tempoDoPsd = performance.now() - inicio;
  const juntas = doc.pranchetas.length > 1 ? await exportarPsd(ck, formato, doc, recursos, { nome, arquivos: 'juntas' }) : undefined;
  const png = await exportarPng(ck, doc, recursos, { nome });
  const arquivos = [...porPrancheta.arquivos, ...(juntas?.arquivos ?? []), ...png.arquivos];
  for (const a of arquivos) await writeFile(path.join(pasta, a.nome), a.bytes);
  await writeFile(path.join(pasta, 'relatorio.md'), relatorioEmTexto(nome, porPrancheta.relatorio));
  await writeFile(path.join(pasta, 'relatorio.json'), `${JSON.stringify(porPrancheta.relatorio, null, 2)}\n`);
  for (const f of porPrancheta.relatorio.fontes) {
    const fonte = recursos.fontes.find((x) => x.arquivo === f.arquivo);
    if (fonte?.arquivo) await writeFile(path.join(pasta, 'fontes', fonte.arquivo), fonte.bytes);
  }
  const rel = porPrancheta.relatorio;
  const contagem = (destino: string): number => rel.camadas.filter((c) => c.destino === destino).length;
  return [
    `${nome} (${id})`,
    `  pranchetas: ${doc.pranchetas.map((p) => `${p.nome} ${p.largura} × ${p.altura}`).join(', ')}`,
    `  camadas: ${contagem('nativo-editavel')} editáveis, ${contagem('nativo-pixel')} só pixel, ${contagem('raster-com-aviso')} viraram pixel com aviso`,
    ...rel.camadas.filter((c) => c.destino === 'raster-com-aviso').map((c) => `    - ${c.prancheta} / ${c.camada}: ${c.observacao ?? ''}`),
    ...(rel.emFalta.fontes.length ? [`  fontes não encontradas: ${rel.emFalta.fontes.map((f) => f.familia).join(', ')}`] : []),
    ...(rel.emFalta.imagens.length ? [`  imagens não encontradas: ${rel.emFalta.imagens.length}`] : []),
    `  PSD por prancheta: ${Math.round(tempoDoPsd)} ms; arquivos: ${arquivos.map((a) => `${a.nome} (${megas(a.bytes.length)})`).join(', ')}`,
  ];
}

const ids = process.argv.slice(2).filter((a) => a !== '--');
const ck = await carregarCanvasKit();
await mkdir(SAIDA, { recursive: true });
const linhas: string[] = [];
for (const id of ids.length > 0 ? ids : PADRAO) {
  try {
    linhas.push(...(await exportarPeca(ck, id)));
  } catch (erro) {
    linhas.push(`${id}: não exportada (${erro instanceof Error ? erro.message : String(erro)})`);
  }
}
await writeFile(path.join(SAIDA, 'CONFERIR-NO-PHOTOSHOP.txt'), CONFERENCIA);
const uso = process.resourceUsage();
process.stdout.write(`${linhas.join('\n')}\n\nMemória no pico do processo: ${megas(uso.maxRSS * 1024)}\nArquivos em ${SAIDA}\nO que conferir: ${path.join(SAIDA, 'CONFERIR-NO-PHOTOSHOP.txt')}\n`);
