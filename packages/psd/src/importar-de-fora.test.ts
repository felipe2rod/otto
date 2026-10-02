// PSDs que o Otto não gravou (recursos-de-teste/psd-de-fora: quase todos gravados pelo Photoshop, ver LEIA.md lá).
// É o mais perto do Photoshop que o CI chega: o arquivo traz a imagem composta que o próprio Photoshop calculou, e o
// render do Otto para o documento importado é comparado com ela.
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { ModoDeMesclagem, No, Prancheta } from '@otto/documento';
import { criarSessao, referenciaDeMesclagem, renderizarPrancheta } from '@otto/render';
import type { CanvasKit } from 'canvaskit-wasm';
import { beforeAll, describe, expect, it } from 'vitest';
import { criarFormatoPsd } from './adaptadores/biblioteca-de-psd';
import { recursosDeTeste } from './apoio-de-teste';
import type { RecursosDaExportacao } from './exportar';
import { fontesDoPsd, importarPsd, type OpcoesDeImportacao, type ResultadoDaImportacao } from './importar';
import { ErroDeImportacao } from './inspecionar';

const PASTA = path.resolve(import.meta.dirname, '../recursos-de-teste/psd-de-fora');
const GOLDENS = path.resolve(import.meta.dirname, '../goldens');
const arquivo = (nome: string): Uint8Array => new Uint8Array(readFileSync(path.join(PASTA, nome)));

let ck: CanvasKit;
let recursos: RecursosDaExportacao;
beforeAll(async () => {
  ({ ck, recursos } = await recursosDeTeste());
});

const importar = (nome: string, opcoes: OpcoesDeImportacao = {}): Promise<ResultadoDaImportacao> => importarPsd(ck, criarFormatoPsd(), arquivo(nome), opcoes);
/** As camadas de cima de uma prancheta do documento importado. */
const camadas = (r: ResultadoDaImportacao, prancheta = 0): No[] => (r.doc.pranchetas[prancheta] as Prancheta).filhos;
const destinos = (r: ResultadoDaImportacao): string[] => r.relatorio.camadas.map((l) => `${l.camada}: ${l.destino} (${l.mapeamento})`);
const perdas = (r: ResultadoDaImportacao, camada: string): string[] => (r.relatorio.camadas.find((l) => l.camada === camada)?.perdas ?? []).map((p) => p.mapeamento);

function renderDoOtto(r: ResultadoDaImportacao, prancheta = 0): { largura: number; altura: number; rgba: Uint8Array } {
  const sessao = criarSessao(ck, {
    fontes: recursos.fontes.map((f) => ({ familia: f.familia, peso: f.peso, bytes: f.bytes })),
    imagens: r.imagens.map((i) => ({ arquivo: i.arquivo, bytes: i.bytes })),
  });
  try {
    return renderizarPrancheta(sessao, r.doc, r.doc.pranchetas[prancheta] as Prancheta);
  } finally {
    sessao.destruir();
  }
}
/** O render do Otto contra a composta que o arquivo traz (sobre branco, onde ela é transparente): média por canal e fração dos pixels a mais de 24 níveis. */
function contraAComposta(nome: string, r: ResultadoDaImportacao): { media: number; acima: number } {
  const composta = criarFormatoPsd().ler?.(arquivo(nome)).composta();
  if (!composta) throw new Error(`${nome} não tem composta`);
  const otto = renderDoOtto(r).rgba;
  let soma = 0;
  let acima = 0;
  for (let i = 0; i < otto.length; i += 4) {
    const a = (composta[i + 3] as number) / 255;
    let maior = 0;
    for (let c = 0; c < 3; c++) {
      const d = Math.abs(Math.round((composta[i + c] as number) * a + 255 * (1 - a)) - (otto[i + c] as number));
      soma += d;
      if (d > maior) maior = d;
    }
    if (maior > 24) acima++;
  }
  return { media: soma / ((otto.length / 4) * 3), acima: acima / (otto.length / 4) };
}

describe('todo arquivo de fora: ou importa num documento válido, ou é recusado com o motivo', () => {
  for (const nome of readdirSync(PASTA).filter((n) => /\.ps[db]$/.test(n))) {
    it(nome, async () => {
      const resultado = await importar(nome).catch((e: unknown) => e);
      if (nome === 'grayscale.psd') {
        expect(resultado).toBeInstanceOf(ErroDeImportacao);
        expect((resultado as ErroDeImportacao).codigo).toBe('modo-de-cor');
        return;
      }
      const r = resultado as ResultadoDaImportacao;
      expect(r.doc.pranchetas.length).toBeGreaterThan(0);
      // toda imagem que o documento cita veio junto, com a chave que é o sha256 dela
      const citadas = new Set<string>();
      const ver = (n: No): void => {
        if (n.tipo === 'imagem') citadas.add(n.arquivo);
        if (n.mascara?.tipo === 'sujeito') citadas.add(n.mascara.arquivo);
        if (n.tipo === 'grupo') n.filhos.forEach(ver);
      };
      for (const p of r.doc.pranchetas) p.filhos.forEach(ver);
      expect([...citadas].sort()).toEqual(r.imagens.map((i) => i.arquivo).sort());
      // toda linha do relatório aponta um nó que existe, ou diz por que não há nó
      const ids = new Set<string>();
      const juntar = (n: No): void => {
        ids.add(n.id);
        if (n.tipo === 'grupo') n.filhos.forEach(juntar);
      };
      for (const p of r.doc.pranchetas) p.filhos.forEach(juntar);
      for (const l of r.relatorio.camadas) if (l.idDoNo) expect(ids.has(l.idDoNo), `${l.camada}`).toBe(true);
      // e o documento desenha, sem recurso em falta
      expect(renderDoOtto(r).rgba.length).toBeGreaterThan(0);
    });
  }
});

describe('o que vem de cada tipo de camada do Photoshop', () => {
  it('camadas de pixels, com o fundo: o render do Otto é a composta do Photoshop', async () => {
    for (const nome of ['just-bg.psd', 'layer-larger-than-drawing.psd', 'nested.psd']) expect(contraAComposta(nome, await importar(nome)).media, nome).toBeLessThan(0.05);
    // arquivo salvo achatado: sem camada nenhuma, a imagem é a composta
    const achatado = await importar('just-bg.psd');
    expect(destinos(achatado)).toEqual(['Fundo: imagem (psd:arquivo-achatado)']);
    expect(achatado.relatorio.avisos.map((a) => a.codigo)).not.toContain('fundo-transparente');
  });

  it('grupos dentro de grupos, com modo e opacidade; grupo vazio', async () => {
    const r = await importar('nested.psd');
    let no = r.doc.pranchetas[0]?.filhos[1] as No;
    const nomes: string[] = [];
    while (no?.tipo === 'grupo') {
      nomes.push(`${no.nome}:${no.modoDeMesclagem}`);
      no = no.filhos[0] as No;
    }
    // os grupos deste arquivo estão em modo normal (isolados), não em "atravessar"
    expect(nomes).toEqual(Array.from({ length: 10 }, (_, i) => `Folder${i + 1}:normal`));
    const grupos = await importar('groups.psd');
    expect(destinos(grupos)).toEqual([
      'Layer 0: imagem (psd:camada-de-pixels)',
      'Group 1: editavel (no:grupo)',
      'Group 2: editavel (no:grupo)',
      'Layer 3: imagem (psd:camada-de-pixels)',
      'Layer 1: imagem (psd:camada-de-pixels)',
    ]);
    expect((camadas(grupos)[1] as { filhos: No[] }).filhos[0]).toMatchObject({
      nome: 'Group 2',
      tipo: 'grupo',
      modoDeMesclagem: 'atravessar',
      opacidade: 0.5,
      visivel: false,
      filhos: [],
    });
    expect(contraAComposta('groups.psd', grupos).media).toBeLessThan(3);
  });

  it('pranchetas do Photoshop: três pranchetas, com o tamanho, a cor de fundo e as camadas na coordenada de cada uma', async () => {
    const r = await importar('artboards.psd');
    expect(r.doc.pranchetas.map((p) => [p.nome, p.largura, p.altura, p.fundo, p.filhos.length])).toEqual([
      ['white board', 1082, 722, '#ffffff', 1],
      ['transparent board', 1082, 722, '#ffffff', 1],
      ['custom board', 598, 458, '#d97575', 0],
    ]);
    // a camada da segunda prancheta está em x = 121 do arquivo... que é fora dela: a coordenada passa a ser a da prancheta
    expect(r.doc.pranchetas[0]?.filhos[0]).toMatchObject({ nome: 'Layer 1', x: 95, y: 241 });
    expect((camadas(r, 1)[0] as { filhos: No[] }).filhos[1]).toMatchObject({ nome: 'Layer 3', x: 1886 - 1182, y: 365 });
    expect(r.relatorio.arquivo.conversaoDeCor).toBe('sem-perfil');
    expect(r.relatorio.avisos.map((a) => a.codigo)).toEqual(expect.arrayContaining(['sem-perfil-de-cor', 'fundo-transparente']));
  });

  it('forma: elipse e retângulo vêm como forma; polígono e caminho livre, como vetor; o render bate com o do Photoshop', async () => {
    const elipse = await importar('round.psd');
    expect(elipse.doc.pranchetas[0]?.filhos[1]).toMatchObject({ tipo: 'forma', forma: 'elipse', x: 17, y: 23, largura: 166, altura: 166 });
    expect(contraAComposta('round.psd', elipse).media).toBeLessThan(0.5);
    const retangulo = await importar('vector-layer.psd');
    expect(retangulo.doc.pranchetas[0]?.filhos[0]).toMatchObject({ tipo: 'forma', forma: 'retangulo', x: 38, y: 53, largura: 123, altura: 80, raio: 0, preenchimento: '#ba4141' });
    expect(contraAComposta('vector-layer.psd', retangulo).media).toBeLessThan(0.05);
    const poligono = await importar('key-origin-shape-bbox.psd');
    expect(destinos(poligono)[1]).toBe('多边形 1: editavel (psd:forma-livre)');
    expect(poligono.doc.pranchetas[0]?.filhos[1]).toMatchObject({ tipo: 'vetor', nome: '多边形 1' });
    expect(contraAComposta('key-origin-shape-bbox.psd', poligono).media).toBeLessThan(0.1);
    // regra par-ímpar: o furo do caminho continua furo
    const furado = await importar('winding-even-odd.psd');
    expect((camadas(furado)[0] as { caminhos: { regra: string }[] }).caminhos[0]?.regra).toBe('par-impar');
    expect(contraAComposta('winding-even-odd.psd', furado).acima).toBeLessThan(0.04);
  });

  it('forma com o que o Otto não tem (degradê com escala, traçado tracejado): imagem, e o render continua batendo', async () => {
    const degrade = await importar('gradient.psd');
    expect(destinos(degrade)[1]).toBe('Rectangle 1: imagem (psd:preenchimento)');
    expect(contraAComposta('gradient.psd', degrade).media).toBeLessThan(0.2);
    const tracejado = await importar('vector-complex.psd');
    expect(destinos(tracejado)).toEqual(['Shape 1: imagem (psd:traco-vetorial)']);
    expect(contraAComposta('vector-complex.psd', tracejado).media).toBeLessThan(0.3);
  });

  it('máscara de camada pintada à mão: aplicada no pixel, e o render bate', async () => {
    const r = await importar('layer-mask.psd');
    expect(r.relatorio.camadas[0]).toMatchObject({ destino: 'imagem', mapeamento: 'psd:camada-de-pixels' });
    expect(r.relatorio.camadas[0]?.observacao).toContain('máscara de camada aplicada no pixel');
    expect(contraAComposta('layer-mask.psd', r).media).toBeLessThan(0.5);
  });

  it('objeto inteligente: foto embutida vem como foto, com o arquivo original; com escala diferente nos dois eixos, ou com filtro que o Otto não tem, vem o pixel', async () => {
    const r = await importar('smart-object.psd');
    expect(destinos(r)).toEqual(['picture: imagem (psd:objeto-inteligente-deformado)', 'kitty: editavel (no:imagem)']);
    expect(r.doc.pranchetas[0]?.filhos[1]).toMatchObject({ tipo: 'imagem', x: 178, y: 171, largura: 100, altura: 111, larguraOriginal: 100, alturaOriginal: 111, ajuste: 'cobrir', zoom: 1 });
    expect(r.imagens.map((i) => [i.origem, i.tipo])).toEqual([
      ['camada', 'image/png'],
      ['foto-embutida', 'image/jpeg'],
    ]);
    const png = await importar('smart-object-png.psd');
    expect(png.doc.pranchetas[0]?.filhos[0]).toMatchObject({ tipo: 'imagem', larguraOriginal: 32, alturaOriginal: 32, largura: 54, altura: 54 });
    expect(png.imagens[0]).toMatchObject({ origem: 'foto-embutida', tipo: 'image/png' });
    const filtro = await importar('smart-filter.psd');
    expect(destinos(filtro)[1]).toBe('temmie: imagem (psd:filtro-inteligente)');
  });

  it('camadas de ajuste: as nove que o Otto tem vêm; as que não tem ficam de fora, uma a uma, no relatório', async () => {
    const r = await importar('adjustment-layers.psd');
    expect(r.doc.pranchetas[0]?.filhos.map((n) => (n.tipo === 'ajuste' ? n.ajuste.tipo : n.tipo))).toEqual([
      'imagem',
      'brilho-contraste',
      'niveis',
      'curvas',
      'vibracao',
      'matiz-saturacao',
      'equilibrio-de-cor',
      'preto-e-branco',
      'mapa-de-degrade',
    ]);
    expect(r.relatorio.camadas.filter((l) => l.destino === 'ignorado').map((l) => l.camada)).toEqual([
      'Exposure 1',
      'Photo Filter 1',
      'Channel Mixer 1',
      'Color Lookup 1',
      'Invert 1',
      'Posterize 1',
      'Threshold 1',
      'Selective Color 1',
    ]);
    expect(perdas(r, 'Black & White 1')).toEqual(['psd:ajuste-parcial', 'psd:ajuste-parcial']);
    expect(r.relatorio.avisos.map((a) => a.codigo)).toEqual(expect.arrayContaining(['camada-ignorada', 'aparencia-pode-diferir']));
  });

  it('efeitos de camada: os do Otto vêm, com a nota do que é aproximado; chanfro, acetinado e degradê fora do modelo não vêm', async () => {
    const r = await importar('effects.psd');
    const por = Object.fromEntries((r.doc.pranchetas[0]?.filhos ?? []).map((n) => [n.nome, n as No & { sombra?: unknown; efeitos?: Record<string, unknown> }]));
    expect(por['drop shadow']?.sombra).toMatchObject({ cor: '#903a3a', angulo: expect.any(Number), desfoque: expect.any(Number) });
    expect(Object.keys(por['inner outer glow']?.efeitos ?? {})).toEqual(['brilhoExterno', 'brilhoInterno']);
    expect(Object.keys(por['inner shadow']?.efeitos ?? {})).toEqual(['sombraInterna']);
    expect(por.bevel?.efeitos).toBeUndefined();
    expect(perdas(r, 'bevel')).toEqual(['psd:efeito-desconhecido']);
    expect(perdas(r, 'other')).toEqual(['psd:efeito-desconhecido', 'psd:efeito-desconhecido']);
    expect(perdas(r, 'drop shadow')).toContain('psd:efeito-parcial');
    // efeito desligado na camada não vem nem vira nota
    expect(perdas(r, 'solid fill')).toEqual([]);
    expect(por['solid fill']?.efeitos).toBeUndefined();
  });

  it('mapa de degradê com a interpolação perceptual do Photoshop: vem aproximado, com paradas a mais, e perto da composta', async () => {
    const r = await importar('gradient-overlay-2.psd');
    const mapa = r.doc.pranchetas[0]?.filhos.find((n) => n.tipo === 'ajuste') as No & { ajuste: { paradas: unknown[] } };
    expect(mapa.ajuste.paradas).toHaveLength(6);
    expect(perdas(r, 'Gradient Map 1')).toEqual(['psd:degrade-aproximado']);
    // sem as paradas a mais, a diferença era de 15 níveis
    expect(contraAComposta('gradient-overlay-2.psd', r).media).toBeLessThan(7);
  });

  it('PSB (documento grande) lê igual', async () => {
    const r = await importar('psb.psb');
    expect(r.relatorio.arquivo.formato).toBe('psb');
    expect(destinos(r)).toEqual(['Rectangle 1: editavel (no:forma)', 'Layer 1: imagem (psd:camada-de-pixels)']);
  });
});

describe('texto gravado pelo Photoshop', () => {
  it('fontesDoPsd diz que fontes o arquivo pede; sem elas, o texto vem como imagem, e o render bate com o do Photoshop', async () => {
    expect(fontesDoPsd(criarFormatoPsd(), arquivo('text-paragraph-align.psd'))).toEqual(['ArialMT']);
    expect(fontesDoPsd(criarFormatoPsd(), arquivo('text-complex.psd')).length).toBeGreaterThan(1);
    for (const nome of ['text-simple.psd', 'text-simple2.psd', 'text-complex.psd', 'text-path.psd', 'text-carriage-return.psd']) {
      const r = await importar(nome);
      expect(
        r.relatorio.camadas.filter((l) => l.destino === 'editavel' && l.tipo === 'texto'),
        nome,
      ).toEqual([]);
      if (nome !== 'text-carriage-return.psd') expect(contraAComposta(nome, r).acima, nome).toBeLessThan(0.02);
    }
    const semFonte = await importar('text-simple.psd');
    expect(semFonte.relatorio.emFalta.fontes).toEqual([{ postScript: 'AdobeInvisFont', camadas: ['Prancheta 1 / Hello'] }]);
  });

  it('texto em caminho e texto deformado vêm como imagem mesmo com a fonte: o Otto não os tem', async () => {
    const trocar = { fontes: recursos.fontes, substituir: () => 'IBMPlexSans' };
    expect(destinos(await importar('text-path.psd', trocar))[1]).toBe('some text: imagem (psd:texto-em-caminho)');
    expect(destinos(await importar('text-complex.psd', trocar))[1]).toBe('Test text aaaa xxxxx  OMG !: imagem (psd:texto-deformado)');
  });

  it('texto em caixa, com outra fonte no lugar: editável, e a primeira linha assenta onde o Photoshop a pôs (a maiúscula no topo da caixa)', async () => {
    const r = await importar('text-paragraph-align.psd', { fontes: recursos.fontes, substituir: () => 'IBMPlexSans' });
    const texto = r.doc.pranchetas[0]?.filhos[1] as No & { y: number; x: number; largura: number };
    expect(texto).toMatchObject({ tipo: 'texto', fonte: 'IBM Plex Sans', peso: 400, tamanho: 18, x: 11, largura: 178 });
    expect(r.relatorio.substituicoes).toEqual([
      { camada: `Prancheta 1 / ${r.relatorio.camadas[1]?.camada}`, pedida: 'ArialMT', usada: { familia: 'IBM Plex Sans', peso: 400, postScript: 'IBMPlexSans' } },
    ]);
    // texto justificado: o Otto não tem; vem alinhado, e o relatório diz
    expect(perdas(r, r.relatorio.camadas[1]?.camada as string)).toContain('psd:paragrafo-de-texto');
    // no arquivo, a tinta do texto começa em y = 11, o topo da caixa. No Otto, com outra fonte, a maiúscula da primeira
    // linha também começa ali (as letras altas da IBM Plex passam um pouco da maiúscula)
    const { rgba, largura, altura } = renderDoOtto(r);
    let primeira = -1;
    // (o texto é bege claro: vale qualquer pixel que não seja o branco do fundo)
    for (let y = 0; y < altura && primeira < 0; y++) for (let x = 0; x < largura; x++) if ((rgba[(y * largura + x) * 4 + 2] as number) < 225) primeira = y;
    expect(Math.abs(primeira - 11)).toBeLessThanOrEqual(2);
  });

  it('texto de ponto, com outra fonte no lugar: a linha de base cai onde estava (a tinta termina na mesma linha do arquivo)', async () => {
    const r = await importar('text-simple.psd', { fontes: recursos.fontes, substituir: () => 'IBMPlexSans' });
    expect(r.doc.pranchetas[0]?.filhos[0]).toMatchObject({ tipo: 'texto', conteudo: 'Hello', tamanho: 60, x: 34 });
    // o pixel gravado do texto vai de y = 27 a y = 70: "Hello" não tem letra que desce, e 70 é a linha de base
    const { rgba, largura, altura } = renderDoOtto(r);
    let ultima = -1;
    for (let y = 0; y < altura; y++) for (let x = 0; x < largura; x++) if ((rgba[(y * largura + x) * 4 + 1] as number) < 128) ultima = y;
    expect(Math.abs(ultima + 1 - 70)).toBeLessThanOrEqual(1);
  });
});

describe('as fórmulas de mesclagem do motor contra o Photoshop de verdade', () => {
  // 2026-blend-modes.psd foi gravado pelo Photoshop 27.7: um fundo cinza e um quadrado por modo de mesclagem, cada um
  // com uma sobreposição de cor no mesmo modo. A composta do arquivo é o que o Photoshop calculou.
  it('camada no modo e sobreposição de cor no modo, uma depois da outra sobre o fundo: os 27 modos dão o que o Photoshop deu', () => {
    const lido = criarFormatoPsd().ler?.(arquivo('2026-blend-modes.psd'));
    if (!lido) throw new Error('sem leitura');
    const composta = lido.composta() as Uint8Array;
    const cinza = lido.camadas[1]?.decodificar().pixels?.rgba as Uint8Array;
    const em = (rgba: Uint8Array, largura: number, x: number, y: number): Uint8Array => rgba.slice((y * largura + x) * 4, (y * largura + x) * 4 + 4);
    const diferencas: Record<string, number> = {};
    for (const c of lido.camadas.slice(2)) {
      const p = c.decodificar().pixels;
      const s = c.efeitos?.sobreposicaoDeCor;
      if (!p || !s) throw new Error(`"${c.nome}" sem pixel ou sem sobreposição`);
      const x = p.x + 40;
      const y = p.y + 40;
      const camada = em(p.rgba, p.largura, 40, 40);
      // o Photoshop mescla a camada com o que está abaixo, e depois a sobreposição com o resultado (efeito interno fora de grupo)
      const comACamada = referenciaDeMesclagem(em(cinza, 600, x, y), camada, c.modo as ModoDeMesclagem, c.opacidade);
      const resultado = referenciaDeMesclagem(comACamada, new Uint8Array([s.cor.r, s.cor.g, s.cor.b, camada[3] as number]), s.modo as ModoDeMesclagem, s.opacidade);
      const doPhotoshop = em(composta, 600, x, y);
      diferencas[c.nome] = Math.max(...[0, 1, 2].map((k) => Math.abs((resultado[k] as number) - (doPhotoshop[k] as number))));
    }
    expect(Object.keys(diferencas)).toHaveLength(27);
    // dois modos passam de 1 nível: luz intensa e luz linear. O resto bate.
    const { 'vivid light': intensa, 'linear light': linear, ...resto } = diferencas;
    expect(Math.max(...Object.values(resto))).toBeLessThanOrEqual(1);
    expect(intensa).toBeLessThanOrEqual(4);
    expect(linear).toBeLessThanOrEqual(2);
  });

  it.todo(
    'o motor desenha a sobreposição de cor dentro da camada e só depois aplica o modo da camada: com os dois modos diferentes de normal, o resultado não é o do Photoshop (ver docs/tecnico/psd.md)',
  );
});

describe('entrada hostil, com a biblioteca de verdade', () => {
  it('arquivo cortado em qualquer ponto: ErroDeImportacao, nunca outro erro', async () => {
    const inteiro = new Uint8Array(readFileSync(path.join(GOLDENS, 'grupo-e-ajuste.psd')));
    for (let i = 1; i <= 40; i++) {
      const corte = Math.floor((inteiro.length * i) / 41);
      const erro = await importarPsd(ck, criarFormatoPsd(), inteiro.subarray(0, corte)).catch((e: unknown) => e);
      expect(erro, `cortado em ${corte}`).toBeInstanceOf(ErroDeImportacao);
    }
  });

  it('bytes trocados ao acaso: ou importa, ou recusa com ErroDeImportacao; sempre termina, e rápido', async () => {
    const bons = ['texto.psd', 'vetor.psd', 'imagem.psd'].map((n) => new Uint8Array(readFileSync(path.join(GOLDENS, n))));
    let semente = 20261002;
    const sorteio = (): number => {
      semente = (Math.imul(semente, 1103515245) + 12345) >>> 0;
      return semente;
    };
    let recusados = 0;
    let importados = 0;
    const inicio = performance.now();
    for (let rodada = 0; rodada < 240; rodada++) {
      const copia = (bons[rodada % bons.length] as Uint8Array).slice();
      // metade das rodadas mexe no começo (cabeçalho, recursos, registros de camada), metade no arquivo inteiro
      const alcance = rodada % 2 ? copia.length : Math.min(copia.length, 6000);
      for (let k = 0; k < 1 + (rodada % 4); k++) copia[sorteio() % alcance] = sorteio() & 255;
      try {
        await importarPsd(ck, criarFormatoPsd(), copia, { fontes: recursos.fontes });
        importados++;
      } catch (e) {
        expect(e, `rodada ${rodada}: ${e instanceof Error ? e.message : e}`).toBeInstanceOf(ErroDeImportacao);
        recusados++;
      }
    }
    expect(recusados).toBeGreaterThan(10);
    expect(importados).toBeGreaterThan(10);
    // 240 importações de arquivos de 400 × 300: se alguma travar ou explodir em memória, este tempo estoura
    expect(performance.now() - inicio).toBeLessThan(120_000);
  }, 180_000);
});
