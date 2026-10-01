// A exportação de ponta a ponta: o pixel de cada camada e a máscara conferidos pela segunda biblioteca,
// os nomes de arquivo, o PNG por prancheta e os erros de quem chama.
import { aplicarLote, type Documento, documentoVazio } from '@otto/documento';
import { criarSessao, renderizarMascara, renderizarPrancheta } from '@otto/render';
import { FOTO, SUJEITO_DA_FOTO } from '@otto/render/apoio-de-teste';
import Psd from '@webtoon/psd';
import type { CanvasKit } from 'canvaskit-wasm';
import { beforeAll, describe, expect, it } from 'vitest';
import { criarFormatoPsd } from './adaptadores/biblioteca-de-psd';
import { recursosDeTeste } from './apoio-de-teste';
import { cenasDeGolden } from './cenas-de-golden';
import { exportarPng, exportarPsd, nomeDeArquivo, type RecursosDaExportacao, tipoDaImagem } from './exportar';

let ck: CanvasKit;
let recursos: RecursosDaExportacao;
beforeAll(async () => {
  ({ ck, recursos } = await recursosDeTeste());
});

function documento(operacoes: unknown[]): Documento {
  const r = aplicarLote(documentoVazio(), operacoes, { autoria: { tipo: 'designer' }, idDoLote: 'teste-de-exportacao' });
  if (!r.ok) throw new Error(`${r.erro.op} ${r.erro.campo ?? ''}: ${r.erro.mensagem}`);
  return r.doc;
}
const ler = (bytes: Uint8Array): Psd => Psd.parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
const novaSessao = () =>
  criarSessao(ck, { fontes: recursos.fontes.map((f) => ({ familia: f.familia, peso: f.peso, bytes: f.bytes })), imagens: recursos.imagens.map((i) => ({ arquivo: i.arquivo, bytes: i.bytes })) });
const cena = (nome: string) => cenasDeGolden().find((c) => c.nome === nome)?.doc as Documento;

describe('pixel de cada camada', () => {
  it('empilhadas uma sobre a outra, as camadas lidas pela segunda biblioteca refazem a composta', async () => {
    // só camadas opacas em modo normal, sem efeito nem máscara: o que se vê é o pixel de cada camada, e mais nada
    const doc = documento([
      { op: 'criarPrancheta', nome: 'Peça', largura: 300, altura: 200, fundo: '#fafaf9' },
      { op: 'criarNo', prancheta: 'Peça', no: { tipo: 'imagem', nome: 'Foto', arquivo: FOTO, larguraOriginal: 1280, alturaOriginal: 853, x: 10, y: 10, largura: 180, altura: 120 } },
      { op: 'criarNo', prancheta: 'Peça', no: { tipo: 'forma', nome: 'Faixa', forma: 'retangulo', x: 150, y: 90, largura: 140, altura: 60, raio: 16, preenchimento: '#c2410c', rotacao: 8 } },
      { op: 'criarNo', prancheta: 'Peça', no: { tipo: 'texto', nome: 'Título', conteudo: 'Otto', x: 20, y: 130, largura: 200, altura: 60, fonte: 'Anton', peso: 400, tamanho: 48, cor: '#1c1917' } },
      {
        op: 'criarNo',
        prancheta: 'Peça',
        no: {
          tipo: 'vetor',
          nome: 'Marca',
          x: 240,
          y: 10,
          largura: 50,
          altura: 50,
          moldura: [100, 100],
          caminhos: [{ d: 'M50 5C55 30 70 45 95 50C70 55 55 70 50 95C45 70 30 55 5 50C30 45 45 30 50 5Z', preenchimento: '#1d4ed8' }],
        },
      },
    ]);
    const { arquivos } = await exportarPsd(ck, criarFormatoPsd(), doc, recursos, { nome: 'Peça' });
    const psd = ler(arquivos[0]?.bytes as Uint8Array);
    const empilhada = new Float64Array(300 * 200 * 4);
    // psd.layers vem de cima para baixo
    for (const camada of [...psd.layers].reverse()) {
      const pixels = await camada.composite(false, false);
      for (let y = 0; y < camada.height; y++) {
        for (let x = 0; x < camada.width; x++) {
          const px = camada.left + x;
          const py = camada.top + y;
          if (px < 0 || py < 0 || px >= 300 || py >= 200) continue;
          const i = (y * camada.width + x) * 4;
          const j = (py * 300 + px) * 4;
          const a = (pixels[i + 3] as number) / 255;
          for (let c = 0; c < 3; c++) empilhada[j + c] = (pixels[i + c] as number) * a + (empilhada[j + c] as number) * (1 - a);
          empilhada[j + 3] = 255;
        }
      }
    }
    const sessao = novaSessao();
    const esperado = renderizarPrancheta(sessao, doc, doc.pranchetas[0] as Documento['pranchetas'][number]);
    sessao.destruir();
    let maior = 0;
    for (let i = 0; i < esperado.rgba.length; i++) maior = Math.max(maior, Math.abs((esperado.rgba[i] as number) - (empilhada[i] as number)));
    // até 2 níveis, e só em borda suavizada: a cor de um pixel quase transparente perde precisão ao sair do premultiplicado
    expect(maior).toBeLessThanOrEqual(2);
    expect(psd.layers.map((l) => l.name)).toEqual(['Marca · #1d4ed8', 'Título', 'Faixa', 'Foto', 'Fundo']);
  });

  it('o pixel não leva o que fica na camada: opacidade, modo, máscara, sombra, traço e efeitos', async () => {
    const doc = documento([
      { op: 'criarPrancheta', nome: 'Peça', largura: 200, altura: 200, fundo: '#000000' },
      {
        op: 'criarNo',
        prancheta: 'Peça',
        no: {
          tipo: 'forma',
          nome: 'Quadrado',
          forma: 'retangulo',
          x: 50,
          y: 50,
          largura: 100,
          altura: 100,
          preenchimento: '#808080',
          opacidade: 0.3,
          modoDeMesclagem: 'tela',
          traco: { cor: '#ff0000', espessura: 10 },
          sombra: { cor: '#00ff00', opacidade: 1, angulo: 90, distancia: 20, desfoque: 0 },
          efeitos: { sobreposicaoDeCor: { cor: '#0000ff' } },
          mascara: { tipo: 'forma', forma: 'retangulo', x: 50, y: 50, largura: 50, altura: 100 },
        },
      },
    ]);
    const { arquivos } = await exportarPsd(ck, criarFormatoPsd(), doc, recursos, { nome: 'Peça' });
    const camada = ler(arquivos[0]?.bytes as Uint8Array).layers[0];
    if (!camada) throw new Error('sem camada');
    const pixels = await camada.composite(false, false);
    const em = (x: number, y: number) => [...pixels.slice(((y - camada.top) * camada.width + (x - camada.left)) * 4, ((y - camada.top) * camada.width + (x - camada.left)) * 4 + 4)];
    // cinza inteiro e opaco, no meio, na borda (onde estaria o traço) e na metade que a máscara esconde
    expect(em(75, 100)).toEqual([128, 128, 128, 255]);
    expect(em(52, 100)).toEqual([128, 128, 128, 255]);
    expect(em(125, 100)).toEqual([128, 128, 128, 255]);
    // e nada de sombra abaixo dela
    expect(camada.top + camada.height).toBeLessThanOrEqual(153);
  });
});

describe('máscara de camada', () => {
  it('a máscara gravada é a cobertura que o motor usa, do tamanho da prancheta', async () => {
    const doc = cena('imagem');
    const p = doc.pranchetas[0] as Documento['pranchetas'][number];
    const { arquivos } = await exportarPsd(ck, criarFormatoPsd(), doc, recursos, { nome: 'imagem' });
    const camada = ler(arquivos[0]?.bytes as Uint8Array).layers.find((l) => l.name === 'Sujeito');
    const lida = await camada?.userMask();
    const sessao = novaSessao();
    const esperada = renderizarMascara(sessao, doc, p, p.filhos.find((n) => n.nome === 'Sujeito') as Documento['pranchetas'][number]['filhos'][number]);
    sessao.destruir();
    expect([camada?.maskData.left, camada?.maskData.top, camada?.maskData.right, camada?.maskData.bottom]).toEqual([0, 0, 400, 300]);
    // a segunda biblioteca devolve a máscara como RGBA cinza: basta um canal
    expect(lida?.length).toBe(400 * 300 * 4);
    const cinza = Uint8Array.from({ length: 400 * 300 }, (_, i) => lida?.[i * 4] as number);
    expect(Buffer.compare(Buffer.from(cinza), Buffer.from(esperada?.cobertura as Uint8Array))).toBe(0);
    // dentro do sujeito mostra, fora esconde
    expect(Math.max(...cinza)).toBe(255);
    expect(cinza[5 * 400 + 5]).toBe(0);
    // e a máscara de sujeito entrou como recurso, não como arquivo embutido
    expect(recursos.imagens.some((i) => i.arquivo === SUJEITO_DA_FOTO)).toBe(true);
  });
});

describe('arquivos', () => {
  it('um arquivo por prancheta, com o nome da peça e o da prancheta; ou todas num arquivo só', async () => {
    const doc = cena('peca');
    const porPrancheta = await exportarPsd(ck, criarFormatoPsd(), doc, recursos, { nome: 'Festival: jazz/2026' });
    expect(porPrancheta.arquivos.map((a) => a.nome)).toEqual(['Festival- jazz-2026 - Feed.psd', 'Festival- jazz-2026 - Story.psd']);
    expect(porPrancheta.relatorio.arquivos).toEqual(porPrancheta.arquivos.map((a) => a.nome));
    expect(porPrancheta.arquivos.map((a) => [ler(a.bytes).width, ler(a.bytes).height])).toEqual([
      [270, 338],
      [216, 384],
    ]);
    const story = doc.pranchetas[1]?.id as string;
    const so = await exportarPsd(ck, criarFormatoPsd(), doc, recursos, { nome: 'Festival', pranchetas: [story] });
    expect(so.arquivos.map((a) => a.nome)).toEqual(['Festival.psd']);
    expect(so.relatorio.camadas.every((l) => l.prancheta === 'Story')).toBe(true);
    const juntas = await exportarPsd(ck, criarFormatoPsd(), doc, recursos, { nome: 'Festival', arquivos: 'juntas' });
    expect(juntas.arquivos.map((a) => a.nome)).toEqual(['Festival (todas as pranchetas).psd']);
  });

  it('cede a vez entre as etapas, para o processo que exporta continuar respondendo', async () => {
    let vezes = 0;
    await exportarPsd(ck, criarFormatoPsd(), cena('peca'), recursos, {
      nome: 'Festival',
      entreEtapas: async () => {
        vezes++;
        await new Promise((ok) => setImmediate(ok));
      },
    });
    // duas pranchetas: antes de montar cada uma e antes de compor cada uma
    expect(vezes).toBe(4);
  });

  it('nome de arquivo sem caractere que algum sistema recusa', () => {
    expect(nomeDeArquivo('  Café Aurora: promoção 50% / "verão"  ')).toBe('Café Aurora- promoção 50% - -verão-');
    expect(nomeDeArquivo('///')).toBe('---');
    expect(nomeDeArquivo('   ')).toBe('sem nome');
  });

  it('reconhece PNG, JPEG e WebP pelos primeiros bytes', () => {
    expect(recursos.imagens.map((i) => tipoDaImagem(i.bytes))).toEqual(['image/jpeg', 'image/png', 'image/png']);
    expect(tipoDaImagem(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]))).toBe('image/webp');
    expect(tipoDaImagem(new Uint8Array([1, 2, 3]))).toBeUndefined();
  });

  it('erro de quem chama diz o quê: prancheta que não existe, imagem que não é imagem', async () => {
    await expect(exportarPsd(ck, criarFormatoPsd(), cena('peca'), recursos, { nome: 'x', pranchetas: ['nao-existe'] })).rejects.toThrow(/prancheta "nao-existe" não existe/);
    await expect(exportarPsd(ck, criarFormatoPsd(), cena('forma'), { ...recursos, imagens: [{ arquivo: 'a'.repeat(64), bytes: new Uint8Array([1, 2, 3, 4]) }] }, { nome: 'x' })).rejects.toThrow(
      /não foi reconhecida|não é PNG/,
    );
  });
});

describe('PNG por prancheta', () => {
  it('um PNG por prancheta, igual ao render de referência; com escala e sem fundo', async () => {
    const doc = cena('peca');
    const { arquivos } = await exportarPng(ck, doc, recursos, { nome: 'Festival' });
    expect(arquivos.map((a) => a.nome)).toEqual(['Festival - Feed.png', 'Festival - Story.png']);
    const sessao = novaSessao();
    const esperado = renderizarPrancheta(sessao, doc, doc.pranchetas[0] as Documento['pranchetas'][number]);
    sessao.destruir();
    const img = ck.MakeImageFromEncoded(arquivos[0]?.bytes as Uint8Array);
    expect([img?.width(), img?.height()]).toEqual([270, 338]);
    const lido = img?.readPixels(0, 0, { width: 270, height: 338, colorType: ck.ColorType.RGBA_8888, alphaType: ck.AlphaType.Unpremul, colorSpace: ck.ColorSpace.SRGB }) as Uint8Array;
    img?.delete();
    expect(Buffer.compare(Buffer.from(lido), Buffer.from(esperado.rgba))).toBe(0);

    const story = doc.pranchetas[1]?.id as string;
    const dobro = await exportarPng(ck, doc, recursos, { nome: 'Festival', pranchetas: [story], escala: 2, semFundo: true });
    expect(dobro.arquivos.map((a) => a.nome)).toEqual(['Festival.png']);
    const grande = ck.MakeImageFromEncoded(dobro.arquivos[0]?.bytes as Uint8Array);
    expect([grande?.width(), grande?.height()]).toEqual([432, 768]);
    grande?.delete();
  });
});
