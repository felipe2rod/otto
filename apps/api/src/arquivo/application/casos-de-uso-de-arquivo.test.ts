import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { CODIGOS_DE_ERRO, lerContaId } from '@otto/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { ErroDaAplicacao } from '../../plataforma/erros/erro-da-aplicacao';
import { EscopoDaConta } from '../../plataforma/escopo/escopo-da-conta';
import { ArmazenamentoEmMemoria } from '../infrastructure/adaptadores/memoria/armazenamento-em-memoria';
import { RepositorioDeArquivosEmMemoria } from '../infrastructure/memoria/repositorio-de-arquivos-em-memoria';
import { CasosDeUsoDeArquivo } from './casos-de-uso-de-arquivo';
import { chaveDeArquivoDaConta } from './chave-de-objeto';

const contaA = EscopoDaConta.abrir(lerContaId('01990000-0000-7000-8000-00000000000a'));
const contaB = EscopoDaConta.abrir(lerContaId('01990000-0000-7000-8000-00000000000b'));
const IMAGENS = path.resolve(import.meta.dirname, '../../../../../packages/render/recursos-de-teste/imagens');
const PNG = readFileSync(path.join(IMAGENS, 'recorte-com-alfa.png'));
const JPEG = readFileSync(path.join(IMAGENS, 'foto-paisagem.jpg'));
const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');

function pngDe(largura: number, altura: number): Buffer {
  const b = Buffer.alloc(64);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8);
  b.write('IHDR', 12, 'latin1');
  b.writeUInt32BE(largura, 16);
  b.writeUInt32BE(altura, 20);
  return b;
}

let armazenamento: ArmazenamentoEmMemoria;
let arquivos: CasosDeUsoDeArquivo;

beforeEach(() => {
  armazenamento = new ArmazenamentoEmMemoria();
  arquivos = new CasosDeUsoDeArquivo(new RepositorioDeArquivosEmMemoria(), armazenamento, randomUUID, { bytesPorArquivo: 2 * 1024 * 1024, ladoMaximoDeImagem: 12_000, megapixelsNoMaximo: 80 });
});

async function erroDe(promessa: Promise<unknown>): Promise<ErroDaAplicacao> {
  try {
    await promessa;
  } catch (e) {
    if (e instanceof ErroDaAplicacao) return e;
    throw e;
  }
  throw new Error('esperava ErroDaAplicacao');
}

describe('enviar imagem', () => {
  it('guarda pelo hash do conteúdo, com tipo e medidas lidos do arquivo', async () => {
    const r = await arquivos.enviarImagem(contaA, PNG);
    expect(r).toEqual({ sha256: sha(PNG), tipo: 'image/png', largura: 600, altura: 800, bytes: PNG.byteLength });
    expect(await armazenamento.existe(contaA, chaveDeArquivoDaConta(contaA, sha(PNG)))).toBe(true);
  });

  it('o tipo vem do conteúdo, não do que o cliente declarou', async () => {
    expect((await arquivos.enviarImagem(contaA, JPEG, { tipoDeclarado: 'image/png' })).tipo).toBe('image/jpeg');
  });

  it('enviar o mesmo conteúdo de novo devolve o mesmo registro', async () => {
    const um = await arquivos.enviarImagem(contaA, PNG);
    expect(await arquivos.enviarImagem(contaA, PNG, { nome: 'outro nome.png' })).toEqual(um);
  });

  it('recusa o que não é imagem aceita, e não guarda nada', async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    expect((await erroDe(arquivos.enviarImagem(contaA, svg, { tipoDeclarado: 'image/png' }))).codigo).toBe(CODIGOS_DE_ERRO.tipoNaoAceito);
    expect(await armazenamento.existe(contaA, chaveDeArquivoDaConta(contaA, sha(svg)))).toBe(false);
    expect((await erroDe(arquivos.enviarImagem(contaA, new Uint8Array()))).codigo).toBe(CODIGOS_DE_ERRO.tipoNaoAceito);
  });

  it('recusa imagem com cabeçalho ilegível', async () => {
    expect((await erroDe(arquivos.enviarImagem(contaA, PNG.subarray(0, 18)))).codigo).toBe(CODIGOS_DE_ERRO.imagemIlegivel);
  });

  it('recusa arquivo acima do limite de bytes', async () => {
    const grande = Buffer.concat([JPEG, Buffer.alloc(2 * 1024 * 1024)]);
    expect(await erroDe(arquivos.enviarImagem(contaA, grande))).toMatchObject({ codigo: CODIGOS_DE_ERRO.arquivoGrandeDemais, detalhe: { limiteEmBytes: 2 * 1024 * 1024 } });
  });

  it('recusa pelo cabeçalho, sem decodificar, a imagem de poucos bytes que declara medida gigante', async () => {
    const bomba = pngDe(50_000, 50_000);
    expect(await erroDe(arquivos.enviarImagem(contaA, bomba))).toMatchObject({ codigo: CODIGOS_DE_ERRO.imagemGrandeDemais, detalhe: { ladoMaximo: 12_000, megapixelsNoMaximo: 80 } });
    expect(await armazenamento.existe(contaA, chaveDeArquivoDaConta(contaA, sha(bomba)))).toBe(false);
    // dentro do lado máximo, mas acima da área máxima
    expect((await erroDe(arquivos.enviarImagem(contaA, pngDe(11_000, 11_000)))).codigo).toBe(CODIGOS_DE_ERRO.imagemGrandeDemais);
  });
});

describe('ler arquivo', () => {
  it('devolve os bytes e o tipo guardado', async () => {
    const { sha256 } = await arquivos.enviarImagem(contaA, PNG);
    const lido = await arquivos.ler(contaA, sha256);
    expect(lido.tipo).toBe('image/png');
    expect(sha(lido.bytes)).toBe(sha256);
  });

  it('o hash não é autorização: a conta B não lê o arquivo da conta A, e a resposta é a de "não existe"', async () => {
    const { sha256 } = await arquivos.enviarImagem(contaA, PNG);
    const outra = await erroDe(arquivos.ler(contaB, sha256));
    const inexistente = await erroDe(arquivos.ler(contaB, 'f'.repeat(64)));
    expect(outra.codigo).toBe(CODIGOS_DE_ERRO.naoEncontrado);
    expect({ codigo: outra.codigo, detalhe: outra.detalhe }).toEqual({ codigo: inexistente.codigo, detalhe: inexistente.detalhe });
  });

  it('o mesmo conteúdo em duas contas são dois objetos: cada conta lê o seu', async () => {
    await arquivos.enviarImagem(contaA, PNG);
    await arquivos.enviarImagem(contaB, PNG);
    expect((await arquivos.ler(contaB, sha(PNG))).bytes.byteLength).toBe(PNG.byteLength);
    expect(chaveDeArquivoDaConta(contaA, sha(PNG))).not.toBe(chaveDeArquivoDaConta(contaB, sha(PNG)));
  });

  it('hash malformado é "não encontrado", nunca caminho', async () => {
    for (const ruim of ['', 'abc', '../../etc/passwd', 'A'.repeat(64)]) expect((await erroDe(arquivos.ler(contaA, ruim))).codigo, ruim).toBe(CODIGOS_DE_ERRO.naoEncontrado);
  });

  it('registro sem objeto no armazenamento é "não encontrado"', async () => {
    const { sha256 } = await arquivos.enviarImagem(contaA, PNG);
    await armazenamento.remover(contaA, chaveDeArquivoDaConta(contaA, sha256));
    expect((await erroDe(arquivos.ler(contaA, sha256))).codigo).toBe(CODIGOS_DE_ERRO.naoEncontrado);
  });
});

describe('importar vetor (SVG)', () => {
  const LOGO = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50"><rect width="100" height="50" fill="#0037A6"/><text>Marca</text></svg>';

  it('devolve o nó pronto para criarNo, com os avisos, e guarda o SVG de origem como arquivo da conta', async () => {
    const r = await arquivos.importarVetor(contaA, LOGO, 'logo do cliente.svg');
    expect(r.no).toMatchObject({ tipo: 'vetor', moldura: [100, 50], origem: { arquivo: sha(Buffer.from(LOGO)), nome: 'logo do cliente.svg' } });
    expect(r.no.caminhos).toEqual([expect.objectContaining({ preenchimento: '#0037a6' })]);
    expect(r.avisos).toHaveLength(1);
    expect(await armazenamento.existe(contaA, chaveDeArquivoDaConta(contaA, sha(Buffer.from(LOGO))))).toBe(true);
  });

  it('o SVG guardado não sai pela rota de leitura de imagem (SVG na mesma origem roda script)', async () => {
    const r = await arquivos.importarVetor(contaA, LOGO, 'logo.svg');
    expect((await erroDe(arquivos.ler(contaA, r.no.origem.arquivo))).codigo).toBe(CODIGOS_DE_ERRO.naoEncontrado);
  });

  it('SVG recusado vira svg_invalido com o motivo em código, e nada é guardado', async () => {
    const bomba = '<!DOCTYPE x [<!ENTITY a "aaaa">]><svg viewBox="0 0 1 1"><path d="M0 0H1V1Z"/></svg>';
    expect(await erroDe(arquivos.importarVetor(contaA, bomba, 'x.svg'))).toMatchObject({ codigo: CODIGOS_DE_ERRO.svgInvalido, detalhe: { motivo: 'entidades' } });
    expect(await erroDe(arquivos.importarVetor(contaA, 'não sou svg', 'x.svg'))).toMatchObject({ codigo: CODIGOS_DE_ERRO.svgInvalido, detalhe: { motivo: 'sem_svg' } });
    expect(await armazenamento.existe(contaA, chaveDeArquivoDaConta(contaA, sha(Buffer.from(bomba))))).toBe(false);
  });

  it('nome ausente vira um nome neutro; nome longo é cortado', async () => {
    expect((await arquivos.importarVetor(contaA, LOGO, undefined)).no.origem.nome).toBe('vetor.svg');
    expect((await arquivos.importarVetor(contaA, LOGO, 'x'.repeat(500))).no.origem.nome).toHaveLength(120);
  });
});
