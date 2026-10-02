// A inspeção do PSD antes de entregá-lo à biblioteca: PSD é entrada de terceiro. Aqui os arquivos hostis são montados
// byte a byte, e os arquivos bons são os goldens da exportação.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { type CamadaDeTeste, psdDeTeste } from './apoio-de-psd';
import { type CodigoDeErroDeImportacao, ErroDeImportacao, inspecionarPsd, LIMITES_DE_IMPORTACAO } from './inspecionar';

const GOLDENS = path.resolve(import.meta.dirname, '../goldens');
const golden = (nome: string): Uint8Array => new Uint8Array(readFileSync(path.join(GOLDENS, nome)));

function erroDe(f: () => unknown): ErroDeImportacao {
  try {
    f();
  } catch (e) {
    if (e instanceof ErroDeImportacao) return e;
    throw e;
  }
  throw new Error('deveria ter recusado');
}
const codigoDe = (bytes: Uint8Array, limites = {}): CodigoDeErroDeImportacao => erroDe(() => inspecionarPsd(bytes, limites)).codigo;

describe('o que a inspeção lê, sem decodificar pixel', () => {
  it('um PSD exportado pelo Otto: tamanho, 8 bits, RGB, camadas, o maior pixel de camada e o perfil de cor embutido', () => {
    const lido = inspecionarPsd(golden('grupo-e-ajuste.psd'));
    expect(lido).toMatchObject({ formato: 'psd', largura: 400, altura: 300, bits: 8, modoDeCor: 'rgb', profundidadeDeGrupo: 1 });
    // os registros de camada do arquivo, com os dois marcadores de cada grupo
    expect(lido.camadas).toBe(16);
    expect(lido.maiorCamada).toBe(400 * 300);
    expect(lido.pixelsDasCamadas).toBeGreaterThan(400 * 300);
    expect(lido.perfilDeCor?.length).toBeGreaterThan(400);
  });

  it('arquivo com todas as pranchetas: os grupos de prancheta contam na profundidade', () => {
    expect(inspecionarPsd(golden('peca.psd'))).toMatchObject({ largura: 646, altura: 384, profundidadeDeGrupo: 2 });
  });

  it('o arquivo montado à mão passa, em PSD e em PSB', () => {
    const camadas: CamadaDeTeste[] = [{ area: [0, 0, 2, 3] }, { area: [1, 1, 4, 4], mascara: [0, 0, 4, 4] }];
    expect(inspecionarPsd(psdDeTeste({ camadas }))).toMatchObject({ formato: 'psd', largura: 4, altura: 4, camadas: 2, maiorCamada: 16, pixelsDasCamadas: 6 + 9 + 16, profundidadeDeGrupo: 0 });
    expect(inspecionarPsd(psdDeTeste({ versao: 2, camadas }))).toMatchObject({ formato: 'psb', camadas: 2, pixelsDasCamadas: 31 });
  });

  it('contagem de camadas negativa é a mesma contagem (o sinal só diz que há canal de transparência na composta)', () => {
    expect(inspecionarPsd(psdDeTeste({ camadas: [{ area: [0, 0, 1, 1] }], contagem: 0xffff })).camadas).toBe(1);
  });
});

describe('o que a inspeção recusa, com o motivo', () => {
  it('não é PSD: vazio, curto, outra assinatura, outra versão', () => {
    expect(codigoDe(new Uint8Array(0))).toBe('nao-e-psd');
    expect(codigoDe(new Uint8Array(20))).toBe('nao-e-psd');
    expect(codigoDe(psdDeTeste({ assinatura: '8BPX' }))).toBe('nao-e-psd');
    expect(codigoDe(new Uint8Array([0x89, 0x50, 0x4e, 0x47, ...new Array<number>(60).fill(0)]))).toBe('nao-e-psd');
    expect(codigoDe(psdDeTeste({ versao: 3 }))).toBe('nao-e-psd');
  });

  it('arquivo maior que o teto', () => {
    const e = erroDe(() => inspecionarPsd(psdDeTeste(), { bytesDoArquivo: 20 }));
    expect(e.codigo).toBe('arquivo-grande-demais');
    expect(e.message).toContain('20 bytes');
  });

  it('modo de cor que a v1 não tem: CMYK, tons de cinza, Lab, indexado, bitmap. Recusa, não converte', () => {
    for (const modo of [0, 1, 2, 4, 7, 8, 9]) expect(codigoDe(psdDeTeste({ modo, bits: modo === 0 ? 1 : 8 })), `modo ${modo}`).toBe('modo-de-cor');
    expect(erroDe(() => inspecionarPsd(psdDeTeste({ modo: 4, canais: 4 }))).message).toContain('CMYK');
  });

  it('16 e 32 bits por canal: recusa, não converte', () => {
    expect(codigoDe(psdDeTeste({ bits: 16 }))).toBe('profundidade');
    expect(codigoDe(psdDeTeste({ bits: 32 }))).toBe('profundidade');
    expect(erroDe(() => inspecionarPsd(psdDeTeste({ bits: 16 }))).message).toContain('16 bits');
  });

  it('dimensões: lado acima de 30.000 px, área acima do teto, e zero', () => {
    expect(codigoDe(psdDeTeste({ versao: 2, largura: 30_001, altura: 10, semComposta: true }))).toBe('dimensoes-grandes-demais');
    expect(codigoDe(psdDeTeste({ largura: 20_000, altura: 20_000, semComposta: true }))).toBe('dimensoes-grandes-demais');
    expect(codigoDe(psdDeTeste({ largura: 0 }))).toBe('arquivo-malformado');
    // o teto de área é configurável
    expect(codigoDe(psdDeTeste({ largura: 100, altura: 100, semComposta: true }), { pixelsDoDocumento: 9_999 })).toBe('dimensoes-grandes-demais');
  });

  it('camadas demais', () => {
    const camadas = Array.from({ length: 6 }, (): CamadaDeTeste => ({ area: [0, 0, 1, 1] }));
    expect(codigoDe(psdDeTeste({ camadas }), { camadas: 5 })).toBe('camadas-demais');
    expect(inspecionarPsd(psdDeTeste({ camadas }), { camadas: 6 }).camadas).toBe(6);
    // o arquivo diz ter 30 mil camadas e não as tem: recusa pela contagem, antes de procurar por elas
    expect(codigoDe(psdDeTeste({ camadas, contagem: 30_000 }))).toBe('camadas-demais');
  });

  it('grupos fundos demais', () => {
    const fundo = (n: number): CamadaDeTeste[] => [
      ...Array.from({ length: n }, (): CamadaDeTeste => ({ area: [0, 0, 0, 0], divisor: 3 })),
      { area: [0, 0, 1, 1] },
      ...Array.from({ length: n }, (): CamadaDeTeste => ({ area: [0, 0, 0, 0], divisor: 1 })),
    ];
    expect(inspecionarPsd(psdDeTeste({ camadas: fundo(10) })).profundidadeDeGrupo).toBe(10);
    expect(codigoDe(psdDeTeste({ camadas: fundo(11) }))).toBe('grupos-fundos-demais');
  });

  it('pixel demais: uma camada que diz ser enorme com poucos bytes (bomba de descompressão), e a soma de todas', () => {
    const enorme: CamadaDeTeste = { area: [0, 0, 30_000, 30_000] };
    expect(codigoDe(psdDeTeste({ camadas: [enorme] }))).toBe('pixels-demais');
    const medias = Array.from({ length: 10 }, (): CamadaDeTeste => ({ area: [0, 0, 100, 100] }));
    expect(codigoDe(psdDeTeste({ camadas: medias }), { pixelsDeTodasAsCamadas: 99_999 })).toBe('pixels-demais');
    expect(inspecionarPsd(psdDeTeste({ camadas: medias }), { pixelsDeTodasAsCamadas: 100_000 }).pixelsDasCamadas).toBe(100_000);
    // a máscara conta
    expect(codigoDe(psdDeTeste({ camadas: [{ area: [0, 0, 1, 1], mascara: [0, 0, 30_000, 30_000] }] }))).toBe('pixels-demais');
    // área de camada negativa não vira número negativo na soma
    expect(codigoDe(psdDeTeste({ camadas: [{ area: [10, 10, 0, 0] }] }))).toBe('arquivo-malformado');
  });

  it('arquivo truncado: cortado no meio do cabeçalho, das camadas ou da composta', () => {
    const inteiro = golden('forma.psd');
    for (const corte of [30, 200, Math.floor(inteiro.length / 2), inteiro.length - 10]) expect(codigoDe(inteiro.subarray(0, corte)), `cortado em ${corte}`).toBe('arquivo-truncado');
  });

  it('arquivo que mente sobre os tamanhos: seção de camadas maior que o arquivo, canal maior que a seção', () => {
    expect(codigoDe(psdDeTeste({ camadas: [{ area: [0, 0, 1, 1] }], tamanhoDaSecao: 1_000_000 }))).toBe('arquivo-truncado');
    expect(codigoDe(psdDeTeste({ camadas: [{ area: [0, 0, 1, 1], canais: [2, 2, 2, 4_000_000] }] }))).toBe('arquivo-truncado');
  });

  it('os tetos padrão são os documentados', () => {
    expect(LIMITES_DE_IMPORTACAO).toEqual({
      bytesDoArquivo: 300 * 1024 * 1024,
      lado: 30_000,
      pixelsDoDocumento: 100_000_000,
      camadas: 1_000,
      profundidadeDeGrupo: 10,
      pixelsDaMaiorCamada: 64_000_000,
      pixelsDeTodasAsCamadas: 400_000_000,
    });
  });

  it('qualquer byte trocado num arquivo bom: ou lê, ou recusa com ErroDeImportacao; nunca outro erro, nunca trava', () => {
    const bom = golden('vetor.psd');
    let recusados = 0;
    // um gerador fixo, para o teste ser sempre o mesmo
    let semente = 12345;
    const sorteio = (): number => {
      semente = (Math.imul(semente, 1103515245) + 12345) >>> 0;
      return semente;
    };
    for (let i = 0; i < 400; i++) {
      const copia = bom.slice();
      // os primeiros 2000 bytes são cabeçalho, recursos e registros de camada: é onde um byte errado muda a estrutura
      for (let k = 0; k < 3; k++) copia[sorteio() % 2000] = sorteio() & 255;
      try {
        inspecionarPsd(copia);
      } catch (e) {
        expect(e, `rodada ${i}`).toBeInstanceOf(ErroDeImportacao);
        recusados++;
      }
    }
    expect(recusados).toBeGreaterThan(20);
  });
});
