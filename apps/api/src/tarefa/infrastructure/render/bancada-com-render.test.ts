// A bancada de verdade: o motor de render (CanvasKit, variante completa), o resumo e a verificação. Sem banco:
// biblioteca, registro de arquivos e armazenamento são os de memória.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { aplicarLote, type Documento, documentoVazio } from '@otto/documento';
import { lerContaId } from '@otto/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ArmazenamentoEmMemoria } from '../../../arquivo/infrastructure/adaptadores/memoria/armazenamento-em-memoria';
import { RepositorioDeArquivosEmMemoria } from '../../../arquivo/infrastructure/memoria/repositorio-de-arquivos-em-memoria';
import { BibliotecaDeFontesEmMemoria } from '../../../biblioteca/infrastructure/memoria/biblioteca-de-fontes-em-memoria';
import { EscopoDaConta } from '../../../plataforma/escopo/escopo-da-conta';
import { BancadaComRender } from './bancada-com-render';

const RECURSOS = path.resolve(import.meta.dirname, '../../../../../../packages/render/recursos-de-teste');
const FOTO = new Uint8Array(readFileSync(path.join(RECURSOS, 'imagens/foto-paisagem.jpg')));
const SHA_DA_FOTO = createHash('sha256').update(FOTO).digest('hex');
const contaA = EscopoDaConta.abrir(lerContaId('01990000-0000-7000-8000-0000000000a1'));
const contaB = EscopoDaConta.abrir(lerContaId('01990000-0000-7000-8000-0000000000b2'));

class ArmazenamentoQueConta extends ArmazenamentoEmMemoria {
  lidas: string[] = [];
  override async ler(escopo: EscopoDaConta, chave: string): Promise<Uint8Array | undefined> {
    this.lidas.push(escopo.contaId);
    return super.ler(escopo, chave);
  }
}

let bancada: BancadaComRender;
let fontes: BibliotecaDeFontesEmMemoria;
const ANTON = new Uint8Array(readFileSync(path.join(RECURSOS, 'fontes/Anton-Regular.ttf')));
let armazenamento: ArmazenamentoQueConta;
let peca: Documento;

function montar(doc: Documento, operacoes: unknown[]): Documento {
  const r = aplicarLote(doc, operacoes, { autoria: { tipo: 'designer' }, idDoLote: '01990000-0000-7000-8000-00000000aaaa' });
  if (!r.ok) throw new Error(r.erro.mensagem);
  return r.doc;
}

beforeAll(async () => {
  fontes = new BibliotecaDeFontesEmMemoria();
  await fontes.registrar({
    familia: 'Anton',
    peso: 400,
    nomePostScript: 'Anton-Regular',
    licenca: 'SIL Open Font License 1.1',
    conteudo: new Uint8Array(readFileSync(path.join(RECURSOS, 'fontes/Anton-Regular.ttf'))),
  });
  const arquivos = new RepositorioDeArquivosEmMemoria();
  armazenamento = new ArmazenamentoQueConta();
  // a foto é da conta A, e só dela
  const chave = `contas/${contaA.contaId}/arquivos/${SHA_DA_FOTO}`;
  await armazenamento.guardar(contaA, chave, FOTO, 'image/jpeg');
  await arquivos.registrar(contaA, {
    id: '01990000-0000-7000-8000-00000000f070',
    sha256: SHA_DA_FOTO,
    tipoMime: 'image/jpeg',
    bytes: FOTO.byteLength,
    largura: 1200,
    altura: 800,
    chaveDoObjeto: chave,
    especie: 'imagem',
  });
  bancada = new BancadaComRender(fontes, arquivos, armazenamento);
  peca = montar(documentoVazio(), [
    { op: 'criarPrancheta', nome: 'Feed', largura: 1080, altura: 1350, fundo: '#f4efe3' },
    { op: 'criarNo', prancheta: 'Feed', no: { tipo: 'imagem', nome: 'Foto', x: 0, y: 0, largura: 1080, altura: 720, arquivo: SHA_DA_FOTO, larguraOriginal: 1200, alturaOriginal: 800 } },
    { op: 'criarNo', prancheta: 'Feed', no: { tipo: 'texto', nome: 'Título', x: 80, y: 800, largura: 900, altura: 200, conteudo: 'Promoção', fonte: 'Anton', tamanho: 120, cor: '#17171c' } },
  ]);
}, 60_000);

afterAll(async () => {
  await bancada?.fechar();
});

const jpegDe = (base64: string) => Buffer.from(base64, 'base64');

describe('BancadaComRender', () => {
  it('diz as fontes da biblioteca, resume a peça e renderiza em JPEG no lado máximo pedido', async () => {
    const aberta = await bancada.abrir(contaA, { nome: 'Promoção', arvore: peca });
    try {
      expect(aberta.fontes).toEqual([{ familia: 'Anton', pesos: [400] }]);
      expect(JSON.stringify(aberta.resumir(peca))).toContain('Título');
      const imagem = await aberta.renderizar(peca, { prancheta: peca.pranchetas[0]?.id as string, ladoMaximo: 540 });
      expect(imagem).toMatchObject({ mime: 'image/jpeg', largura: 432, altura: 540 });
      // começa com a marca de JPEG
      expect([...jpegDe(imagem.base64).subarray(0, 3)]).toEqual([0xff, 0xd8, 0xff]);
      const detalhe = await aberta.renderizar(peca, { prancheta: peca.pranchetas[0]?.id as string, ladoMaximo: 400, regiao: [0, 700, 1080, 400] });
      expect(detalhe.largura).toBe(400);
      expect(Array.isArray(await aberta.verificar(peca))).toBe(true);
    } finally {
      aberta.fechar();
    }
  });

  it('prancheta que não existe é erro, e não imagem vazia', async () => {
    const aberta = await bancada.abrir(contaA, { nome: 'Promoção', arvore: peca });
    await expect(aberta.renderizar(peca, { prancheta: 'p-que-nao-existe', ladoMaximo: 300 })).rejects.toThrow('prancheta desconhecida');
    aberta.fechar();
  });

  it('a prévia de arquivo é reduzida para o modelo ver, e só existe para a conta dona', async () => {
    const deA = await bancada.abrir(contaA, { nome: 'Promoção', arvore: peca });
    const previa = await deA.previaDeArquivo(SHA_DA_FOTO, 256);
    expect(previa).toMatchObject({ mime: 'image/jpeg', largura: 256 });
    deA.fechar();
  });

  it('o hash não é autorização: com a conta B, a foto de A não é lida nem para o render nem para a prévia', async () => {
    armazenamento.lidas = [];
    const deB = await bancada.abrir(contaB, { nome: 'Cópia', arvore: peca });
    try {
      expect(await deB.previaDeArquivo(SHA_DA_FOTO, 256)).toBeUndefined();
      // o render sai (a imagem em falta é desenhada como falta), sem ler nada de A
      const imagem = await deB.renderizar(peca, { prancheta: peca.pranchetas[0]?.id as string, ladoMaximo: 300 });
      expect(imagem.altura).toBe(300);
      expect(armazenamento.lidas).toEqual([]);
    } finally {
      deB.fechar();
    }
  });

  it('fonte que entra na biblioteca no meio da tarefa (trazida do catálogo) é lida quando o documento passa a citá-la', async () => {
    const aberta = await bancada.abrir(contaA, { nome: 'Promoção', arvore: peca });
    try {
      await fontes.registrar({ familia: 'Chegou Depois', peso: 400, nomePostScript: 'ChegouDepois-Regular', licenca: 'OFL', conteudo: ANTON });
      const comNova = montar(peca, [{ op: 'alterar', alvo: 'Feed/Título', props: { fonte: 'Chegou Depois' } }]);
      const lidas: string[] = [];
      const pesosDa = fontes.pesosDa.bind(fontes);
      fontes.pesosDa = async (familia) => {
        lidas.push(familia);
        return pesosDa(familia);
      };
      await aberta.renderizar(comNova, { prancheta: comNova.pranchetas[0]?.id as string, ladoMaximo: 200 });
      await aberta.verificar(comNova);
      // lida uma vez, no primeiro uso; a que já estava na sessão não é relida
      expect(lidas).toEqual(['Chegou Depois']);
    } finally {
      aberta.fechar();
    }
  });

  it('uma thread de render por processo, e cada tarefa tem a própria sessão dentro dela', async () => {
    const [um, dois] = [await bancada.abrir(contaA, { nome: 'x', arvore: peca }), await bancada.abrir(contaA, { nome: 'y', arvore: peca })];
    um.fechar();
    // fechar uma não derruba a outra
    expect((await dois.renderizar(peca, { prancheta: peca.pranchetas[0]?.id as string, ladoMaximo: 200 })).altura).toBe(200);
    dois.fechar();
    expect(bancada.threadsCriadas).toBe(1);
  });

  it('o render roda fora do laço principal: enquanto uma prancheta grande é desenhada, o processo continua atendendo', async () => {
    const grande = montar(documentoVazio(), [
      { op: 'criarPrancheta', nome: 'Painel', largura: 6000, altura: 6000, fundo: '#f4efe3' },
      ...Array.from({ length: 12 }, (_, i) => ({
        op: 'criarNo',
        prancheta: 'Painel',
        no: { tipo: 'texto', nome: `T${i}`, x: 100, y: 100 + i * 450, largura: 5800, altura: 420, conteudo: 'Promoção da semana', fonte: 'Anton', tamanho: 400, cor: '#17171c' },
      })),
    ]);
    const aberta = await bancada.abrir(contaA, { nome: 'Painel', arvore: grande });
    try {
      let batidas = 0;
      const relogio = setInterval(() => batidas++, 5);
      const inicio = Date.now();
      await Promise.all([1, 2, 3].map(() => aberta.renderizar(grande, { prancheta: grande.pranchetas[0]?.id as string, ladoMaximo: 6000 })));
      const duracao = Date.now() - inicio;
      clearInterval(relogio);
      // no laço principal, um render síncrono não deixaria o relógio bater nenhuma vez durante ele
      expect(duracao).toBeGreaterThan(100);
      expect(batidas).toBeGreaterThan(duracao / 50);
    } finally {
      aberta.fechar();
    }
  }, 60_000);

  it('se a thread de render cair, outra sobe e a sessão é remontada com o que já tinha sido entregue', async () => {
    const aberta = await bancada.abrir(contaA, { nome: 'Promoção', arvore: peca });
    try {
      const antes = await aberta.renderizar(peca, { prancheta: peca.pranchetas[0]?.id as string, ladoMaximo: 300 });
      await bancada.derrubarThread();
      const depois = await aberta.renderizar(peca, { prancheta: peca.pranchetas[0]?.id as string, ladoMaximo: 300 });
      // a foto e a fonte voltaram para a sessão nova: o render é o mesmo
      expect(depois.base64).toBe(antes.base64);
      expect(bancada.threadsCriadas).toBe(2);
    } finally {
      aberta.fechar();
    }
  }, 60_000);

  it('desligar encerra a thread, e a bancada não aceita mais trabalho', async () => {
    const outra = new BancadaComRender(fontes, new RepositorioDeArquivosEmMemoria(), armazenamento);
    const aberta = await outra.abrir(contaA, { nome: 'x', arvore: peca });
    await aberta.renderizar(peca, { prancheta: peca.pranchetas[0]?.id as string, ladoMaximo: 100 });
    await outra.fechar();
    await expect(aberta.renderizar(peca, { prancheta: peca.pranchetas[0]?.id as string, ladoMaximo: 100 })).rejects.toThrow();
  }, 60_000);
});
