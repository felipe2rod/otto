// Exporta peças reais (as da POC) em PSD, SVG e PDF, para a conferência manual no Photoshop (ADR 028) e no Illustrator (ADR 034).
// Só LÊ de poc/. Escreve em packages/psd/saida/, que fica fora do git.
//
//   docker compose run --rm teste pnpm --filter @otto/psd exportar:pecas
//   docker compose run --rm teste pnpm --filter @otto/psd exportar:pecas -- <id da peça na POC> [<outro id> ...]
//
// Para cada peça grava: um PSD por prancheta, um PSD com todas as pranchetas (quando há mais de uma), o PNG de cada
// prancheta (o render do Otto, para comparar com o que o Photoshop e o Illustrator mostram), o relatório e as fontes para
// instalar; e, na pasta "illustrator", um SVG e um PDF por prancheta e o relatório deles. Peça com filtro de nitidez
// ganha também o PNG de cada prancheta sem esse filtro, para a conferência separar o filtro da reamostragem da foto.
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Documento, todasAsCamadas } from '@otto/documento';
import { nomePostScript } from '@otto/render';
import { carregarCanvasKit } from '@otto/render/node';
import { criarFormatoPdf } from '../adaptadores/biblioteca-de-pdf';
import { criarFormatoPsd } from '../adaptadores/biblioteca-de-psd';
import { criarFormatoSvg } from '../adaptadores/svg';
import { exportarPng, exportarPsd, type FonteDaExportacao, type ImagemDaExportacao, nomeDeArquivo } from '../exportar';
import { exportarVetorial } from '../exportar-vetorial';
import { relatorioEmTexto } from '../relatorio';

const RAIZ = path.resolve(import.meta.dirname, '../../../..');
const POC = path.resolve(process.env.POC_PASTA ?? path.join(RAIZ, 'poc'));
const SAIDA = path.resolve(process.env.SAIDA_PASTA ?? path.join(RAIZ, 'packages/psd/saida'));
const PESOS = [300, 400, 500, 600, 700];

/**
 * Peças escolhidas para cobrir o mapeamento: texto, forma, foto, vetor, grupo, ajuste, máscara, filtros e efeitos.
 * A pasta leva o nome que a peça tem no registro da POC, a menos que haja `nome` aqui.
 */
const PADRAO: { id: string; nome?: string }[] = [
  // foto com máscara do sujeito, texto entre a foto e o sujeito, ajustes, ruído
  { id: 'mukclig2i3er25uo' },
  // efeitos de camada, vetor, duas pranchetas, fontes fora da biblioteca base
  { id: 'muke3an6eafpfmh3' },
  // grupos, camadas de ajuste, ruído, duas pranchetas
  { id: 'mukclyemcafjfrk6' },
  // desfoque de movimento, quatro máscaras de sujeito, sombras. No registro da POC esta peça (o anúncio do tênis) está
  // gravada com o nome de outra ("Festival Jazz na Praça 2026 (v9, receitas)"): o nome daqui é o que ela é
  { id: 'mumwjjx1ghzyk5hp', nome: 'Tênis - Corra mais leve' },
  // nitidez
  { id: 'mun0q9fw4uortna2' },
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

const CONFERENCIA = `Segunda conferência no Photoshop (ADR 028, item 6)

Só o que falhou na conferência de 02/10/2026 (respostas em docs/tecnico/conferencias/2026-10-02). As peças foram geradas
de novo com as correções. As fontes são as mesmas: se já estão instaladas, não precisa reinstalar.
A pasta "Tênis - Corra mais leve" é a que se chamava "Festival Jazz na Praça 2026 (v9, receitas)": o nome errado vinha
do registro da POC, e o conteúdo é o mesmo.

Esperado ao abrir, e que não é defeito:
 - "Perfil não correspondente incorporado": o arquivo sai com o perfil sRGB embutido, e o espaço de trabalho desse
   Photoshop é Adobe RGB. Escolha "Usar o perfil incorporado".
 - O pedido de atualizar as camadas de texto continua aparecendo. A biblioteca que grava o PSD não grava a parte do
   texto que o Photoshop usa para pular essa pergunta. Não tem correção sem trocar de biblioteca.

 1. Erro ao abrir (Tênis e Padaria)
    Antes: "Foi encontrado um problema ao ler a camada ... porque as configurações no arquivo não eram válidas."
    Agora: os dois abrem sem esse aviso, inclusive o PSD com todas as pranchetas do Tênis.
    Na Padaria, "Selo marca" tem os dois efeitos: sombra projetada e traço interno, e a borda do selo bate com o PNG.

 2. Texto ao atualizar (todas as peças)
    Antes: com "Atualizar", o texto subia (149 px no "JAZZ" da Capa, 41 px no Título do Tênis).
    Agora: escolha "Atualizar". O texto não muda de lugar na vertical (até 1 px). O mesmo ao entrar em edição sem ter
    atualizado. Meça o Título da Capa e o do Tênis.
    Não foi mexido: o deslocamento de 3 px para o lado nos títulos em Anton. Se continuar, anote o valor.

 3. Degradê (Capa: "Película"; Tênis: "Luz lateral quente"; Padaria: "Película degradê"; Recursos avançados: "Faixa")
    Antes: escala gravada como 10000%, e a camada virava uma faixa lisa ou uma mancha.
    Agora: a escala é 100% (no preenchimento em degradê e na sobreposição de degradê) e a camada bate com o PNG.

 4. Ajuste de cor da foto (Tênis: "Tênis rajada" e "Tênis herói"; Padaria: "Foto pão"; Recursos avançados: a foto)
    Antes: as camadas de Brilho/Contraste e Matiz/Saturação presas à foto davam um resultado mais fraco (preto 4,0,0
    aparecia como 21,15,12; "Tênis rajada" com diferença média de 12).
    Agora: presas à foto há uma camada de Níveis ("...: brilho e contraste") e uma de Misturador de canais
    ("...: saturação"). Compare a foto com o PNG: a diferença deve cair para perto do que as outras camadas têm (até 3).

 5. Versalete (Padaria: "Marca texto"; Recursos avançados: "Subtítulo")
    Antes: depois de atualizar, o texto ficava mais estreito que no PNG (6 px e 37 px).
    Agora: o motor desenha o versalete a 70% do corpo, como o Photoshop. A largura deve bater com o PNG.

 6. Nitidez (Padaria: "Foto pão")
    Antes: reaplicar o filtro inteligente mudava a aparência (média 1,5; pior pixel 40). A causa não foi determinada.
    Na pasta da peça há agora um PNG a mais, "... (sem nitidez).png": a peça sem o filtro de nitidez.
    a) Desligue o filtro inteligente de "Foto pão" e compare com o PNG "sem nitidez". Se já difere aqui, a diferença
       vem de como cada programa reduz a foto, e não do filtro.
    b) Religue o filtro, reaplique com os mesmos valores e compare com o PNG normal.
    Anote a diferença média e o pior pixel de (a) e de (b), na área da foto acima de y=550.

 7. Sombra interna e brilho externo (Recursos avançados: "Selo")
    Antes: diferença média de 8,5 na metade de cima do selo.
    Agora: todos os parâmetros vão escritos (contorno linear, retração e expansão 0, ruído 0, técnica "Mais suave").
    Meça de novo. Se continuar perto de 8,5, a diferença está na conta do desfoque, e não no arquivo.

 8. Formas vivas (Tênis: "Botão CTA"; Lançamento: "Botão"; Capa: "Película")
    Antes: o painel Propriedades só mostrava o caminho.
    Agora: retângulo, retângulo arredondado e elipse sem rotação levam os dados de forma viva. Selecione a camada: o
    painel Propriedades mostra largura, altura e o raio dos cantos (32 no "Botão CTA")? Forma girada continua caminho.

Anote, por peça, o número do item e o que viu. O que falhar muda de linha em docs/tecnico/psd.md.
`;

const NO_ILLUSTRATOR = `Segunda conferência no Illustrator (ADR 034)

Só o que falhou na conferência de 02/10/2026 (respostas em docs/tecnico/conferencias/2026-10-02). As peças foram geradas
de novo. Na pasta "illustrator" de cada peça há agora um SVG e um PDF por prancheta, e o relatório de cada formato.
A pasta "Tênis - Corra mais leve" é a que se chamava "Festival Jazz na Praça 2026 (v9, receitas)".

 1. Modo de mesclagem no SVG (Capa e Lançamento: "Grão"; Recursos avançados: "Papel"; Padaria: "Textura grão";
    Tênis: "Luz atmosfera")
    Antes: a camada abria em modo normal, como um véu por cima da peça.
    Agora: a camada chega como uma imagem em modo normal, calculada para dar a mesma cor sobre o que está abaixo dela.
    O SVG aberto bate com o PNG? As camadas abaixo continuam editáveis (texto como texto)?
    No PDF nada mudou: o modo de mesclagem continua na camada.

 2. Opacidade de texto no SVG (Tênis: "Rodapé", 75%; Padaria: "Apoio", 92%)
    Antes: o texto chegava a 100%.
    Agora: a opacidade vai num grupo em volta do texto, com o nome da camada. No painel Transparência, selecionando o
    grupo, aparece 75% e 92%? O texto parece o do PNG?

 3. Aviso ao abrir o SVG
    Antes: "O recorte será perdido no percurso de ida e volta para Tiny".
    Agora: o arquivo se declara SVG 1.1 completo. O aviso ainda aparece? Se aparecer, qual é o texto?

 4. PDF: nomes e grupos de recorte
    Não tem correção: o Illustrator não lê as camadas do PDF, e tudo continua em "Camada 1", sem nomes. Para os nomes,
    abra o SVG.
    O que mudou: imagem, texto ou caminho com opacidade não vai mais dentro de um grupo próprio. Cada foto deve estar
    dentro de UM grupo de recorte (o corte da caixa), e não de três. Quantos há em volta de uma foto? E os grupos do
    Otto (o botão, o logo) continuam sem aparecer como grupos?

 5. PDF: texto em contorno (Padaria e Recursos avançados, textos em Fraunces)
    Antes: parte do texto chegava convertida em contorno, em pedaços, e em alguns o espaçamento vinha letra por letra.
    Agora: o texto vai com um glifo por letra, sem os desenhos alternativos da fonte. Todo o texto é texto editável,
    com a fonte Fraunces? Ainda há objeto de texto partido letra por letra?

 6. Texto em pedaços (SVG e PDF)
    O limite, que não muda: um objeto de texto por linha e por mudança de estilo dentro da linha. Nenhum dos dois
    formatos guarda parágrafo. O versalete conta como mudança de estilo: as letras menores são outro corpo, e chegam
    como outro objeto ("Marca texto" da Padaria, "Subtítulo" dos Recursos avançados). Elas agora estão a 70% do corpo.
    Um teste à parte, para decidir se dá para melhorar: abra "TESTE - versalete no SVG.svg" (na raiz da pasta, usa a
    Work Sans da Padaria). A primeira linha usa o versalete do próprio SVG; a segunda, o jeito atual.
    a) A primeira linha aparece em versalete, ou em maiúsculas e minúsculas comuns?
    b) Ela é um objeto de texto só? No painel Caractere, o botão de versalete aparece ligado?
    c) As duas linhas têm a mesma largura?

 7. PDF de várias páginas
    Antes: um PDF com uma página por prancheta, e o Illustrator abria só a primeira.
    Agora: um PDF por prancheta. Cada um abre direto, sem a janela de escolha de página?

 8. Tamanho e tempo (Padaria)
    Antes: SVG de 12 MB, 36 s para abrir.
    Agora: o tamanho de cada arquivo está no resumo que o comando imprime. Quanto tempo o SVG da Padaria leva para abrir?

 9. Clique com a ferramenta Texto cria texto novo (Capa, Recursos avançados)
    Não mudou no arquivo: a imagem do tamanho da prancheta por cima do texto recebe o clique. O relatório agora avisa.
    Com essa imagem travada (Objeto > Bloquear > Seleção), o clique entra no texto?

10. Camada de ajuste (decisão: achatar)
    Ajuste preso a uma foto (o duotone da Capa): só a foto e o ajuste viram uma imagem, e o resto continua em camadas.
    A cor bate com o PNG?
    Ajuste solto: o Lançamento tem o "Filtro dourado" por cima de tudo, menos do "Grão". Por isso a peça inteira chega
    como uma imagem só, "Fundo (achatado)", com o "Grão" por cima, no SVG e no PDF: sem texto nem forma editável.
    A cor bate com o PNG? É isso que você quer para uma peça assim? (A outra saída possível está na resposta da rodada.)

Anote, por peça e por formato (SVG ou PDF), o número do item e o que viu. O que falhar muda de linha em docs/tecnico/psd.md.
`;

/** Para a segunda conferência: o versalete do próprio SVG (`font-variant`) ao lado do jeito que a exportação usa, para ver qual o Illustrator abre melhor. */
const TESTE_DO_VERSALETE = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">
<svg version="1.1" baseProfile="full" xmlns="http://www.w3.org/2000/svg" width="600" height="200" viewBox="0 0 600 200">
<title>Teste do versalete</title>
<path id="Fundo" d="M0 0H600V200H0Z" fill="#f4efe6"/>
<g id="Versalete_do_SVG"><text font-family="'Work Sans', 'WorkSans-SemiBold'" font-weight="600" font-size="40" fill="#5c3a21" font-variant="small-caps" xml:space="preserve"><tspan x="30" y="80">Fermento Vivo</tspan></text></g>
<g id="Versalete_por_corpo"><text font-family="'Work Sans', 'WorkSans-SemiBold'" font-weight="600" font-size="40" fill="#5c3a21" xml:space="preserve"><tspan x="30" y="150">F</tspan><tspan font-size="28">ERMENTO</tspan><tspan> V</tspan><tspan font-size="28">IVO</tspan></text></g>
</svg>
`;

/** O documento sem os filtros de nitidez, para o PNG de diagnóstico. Undefined se não há nenhum. */
function semNitidez(doc: Documento): Documento | undefined {
  let tirou = false;
  const limpar = (nos: Documento['pranchetas'][number]['filhos']): Documento['pranchetas'][number]['filhos'] =>
    nos.map((n) => {
      if (n.tipo === 'grupo') return { ...n, filhos: limpar(n.filhos) };
      if (n.tipo === 'ajuste' || !n.filtros?.some((f) => f.tipo === 'nitidez')) return n;
      tirou = true;
      return { ...n, filtros: n.filtros.filter((f) => f.tipo !== 'nitidez') };
    });
  const pranchetas = doc.pranchetas.map((p) => ({ ...p, filhos: limpar(p.filhos) }));
  return tirou ? { ...doc, pranchetas } : undefined;
}

async function exportarPeca(ck: Awaited<ReturnType<typeof carregarCanvasKit>>, id: string, apelido?: string): Promise<string[]> {
  const registro = JSON.parse(await readFile(path.join(POC, 'dados/documentos', `${id}.json`), 'utf8')) as { doc?: { nome?: unknown } };
  const lida = Documento.safeParse(registro.doc);
  if (!lida.success) return [`${id}: fora do esquema do documento (${lida.error.issues[0]?.path.join('.')}): pulada`];
  const doc = lida.data;
  const nome = nomeDeArquivo(apelido ?? (typeof registro.doc?.nome === 'string' ? registro.doc.nome.slice(0, 60) : id));
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
  const docSemNitidez = semNitidez(doc);
  const pngSemNitidez = docSemNitidez ? await exportarPng(ck, docSemNitidez, recursos, { nome: `${nome} (sem nitidez)` }) : undefined;
  // a saída para o Illustrator: SVG e PDF, com o relatório dela
  const inicioDoVetorial = performance.now();
  const svg = await exportarVetorial(ck, criarFormatoSvg(), doc, recursos, { nome });
  const tempoDoSvg = performance.now() - inicioDoVetorial;
  const pdf = await exportarVetorial(ck, criarFormatoPdf(), doc, recursos, { nome });
  const tempoDoPdf = performance.now() - inicioDoVetorial - tempoDoSvg;
  await mkdir(path.join(pasta, 'illustrator'), { recursive: true });
  for (const a of [...svg.arquivos, ...pdf.arquivos]) await writeFile(path.join(pasta, 'illustrator', a.nome), a.bytes);
  await writeFile(path.join(pasta, 'illustrator', 'relatorio-do-svg.md'), relatorioEmTexto(nome, svg.relatorio));
  await writeFile(path.join(pasta, 'illustrator', 'relatorio-do-pdf.md'), relatorioEmTexto(nome, pdf.relatorio));
  const arquivos = [...porPrancheta.arquivos, ...(juntas?.arquivos ?? []), ...png.arquivos, ...(pngSemNitidez?.arquivos ?? [])];
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
    `  SVG: ${Math.round(tempoDoSvg)} ms, ${svg.arquivos.map((a) => megas(a.bytes.length)).join(' + ')}; PDF: ${Math.round(tempoDoPdf)} ms, ${pdf.arquivos.map((a) => megas(a.bytes.length)).join(' + ')}`,
    ...(['svg', 'pdf'] as const).map((formato) => {
      const r = formato === 'svg' ? svg.relatorio : pdf.relatorio;
      const quantas = (destino: string): number => r.camadas.filter((c) => c.destino === destino).length;
      return `  no ${formato.toUpperCase()}: ${quantas('nativo-editavel')} em vetor, ${quantas('raster-com-aviso')} viraram imagem; avisos: ${r.avisos.map((a) => a.codigo).join(', ')}`;
    }),
  ];
}

const ids = process.argv.slice(2).filter((a) => a !== '--');
// a variante completa do motor também codifica JPEG: as imagens sem transparência da saída vetorial ficam muito menores
const ck = await carregarCanvasKit('completa');
await mkdir(SAIDA, { recursive: true });
const linhas: string[] = [];
for (const { id, nome } of ids.length > 0 ? ids.map((x) => ({ id: x, nome: PADRAO.find((q) => q.id === x)?.nome })) : PADRAO) {
  try {
    linhas.push(...(await exportarPeca(ck, id, nome)));
  } catch (erro) {
    linhas.push(`${id}: não exportada (${erro instanceof Error ? (process.env.DEPURAR ? erro.stack : erro.message) : String(erro)})`);
  }
}
await writeFile(path.join(SAIDA, 'CONFERIR-NO-PHOTOSHOP.txt'), CONFERENCIA);
await writeFile(path.join(SAIDA, 'CONFERIR-NO-ILLUSTRATOR.txt'), NO_ILLUSTRATOR);
await writeFile(path.join(SAIDA, 'TESTE - versalete no SVG.svg'), TESTE_DO_VERSALETE);
const uso = process.resourceUsage();
process.stdout.write(
  `${linhas.join('\n')}\n\nMemória no pico do processo: ${megas(uso.maxRSS * 1024)}\nArquivos em ${SAIDA}\nO que conferir: ${path.join(SAIDA, 'CONFERIR-NO-PHOTOSHOP.txt')} e ${path.join(SAIDA, 'CONFERIR-NO-ILLUSTRATOR.txt')}\n`,
);
