import { randomUUID } from 'node:crypto';
import { type EntradaDaTarefa, EntradaDaTarefa as EsquemaDaEntrada } from '@otto/agente';
import { briefingDaTarefa, CODIGOS_DE_ERRO, type FormularioDeBriefing, lerContaId, PedidoDeTarefaPorBriefing } from '@otto/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { CasosDeUsoDeArquivo } from '../../arquivo/application/casos-de-uso-de-arquivo';
import { ArmazenamentoEmMemoria } from '../../arquivo/infrastructure/adaptadores/memoria/armazenamento-em-memoria';
import { RepositorioDeArquivosEmMemoria } from '../../arquivo/infrastructure/memoria/repositorio-de-arquivos-em-memoria';
import { ErroDaAplicacao } from '../../plataforma/erros/erro-da-aplicacao';
import { EscopoDaConta } from '../../plataforma/escopo/escopo-da-conta';
import { RepositorioDeCadastrosEmMemoria } from '../infrastructure/memoria/repositorio-de-cadastros-em-memoria';
import { aplicarMarca, BriefingParaOOtto } from './briefing-para-o-otto';
import type { MarcaGuardada } from './repositorio-de-cadastros';

const contaA = EscopoDaConta.abrir(lerContaId('01990000-0000-7000-8000-00000000000a'));
const contaB = EscopoDaConta.abrir(lerContaId('01990000-0000-7000-8000-00000000000b'));
const AGORA = new Date('2026-10-04T12:00:00.000Z');
const LOGO = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50"><path d="M0 0 L100 0 L100 50 Z" fill="#0037A6"/></svg>';
// PNG mínimo: assinatura e IHDR com as medidas
function pngDe(largura: number, altura: number): Buffer {
  const b = Buffer.alloc(64);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8);
  b.write('IHDR', 12, 'latin1');
  b.writeUInt32BE(largura, 16);
  b.writeUInt32BE(altura, 20);
  b[24] = 8;
  b[25] = 6;
  return b;
}

const MINIMO: FormularioDeBriefing = { versao: 1, formatos: [{ nome: 'Feed', largura: 1080, altura: 1350 }], textos: { titulo: 'Abrimos às 7h' }, imagens: { fonte: 'nenhuma' } };
const pedido = (briefing: FormularioDeBriefing, extra: object = {}) => PedidoDeTarefaPorBriefing.parse({ tipo: 'briefing', briefing, ...extra });

// biome-ignore lint/suspicious/noExplicitAny: o material é JSON para o modelo; o teste lê campo a campo
const materialDe = (entrada: EntradaDaTarefa) => (entrada as unknown as { briefing: Record<string, any> }).briefing;

let cadastros: RepositorioDeCadastrosEmMemoria;
let arquivos: CasosDeUsoDeArquivo;
let armazenamento: ArmazenamentoEmMemoria;
let registros: RepositorioDeArquivosEmMemoria;
let montador: BriefingParaOOtto;

async function erroDe(promessa: Promise<unknown>): Promise<ErroDaAplicacao> {
  try {
    await promessa;
  } catch (e) {
    if (e instanceof ErroDaAplicacao) return e;
    throw e;
  }
  throw new Error('esperava ErroDaAplicacao');
}

beforeEach(() => {
  cadastros = new RepositorioDeCadastrosEmMemoria();
  registros = new RepositorioDeArquivosEmMemoria();
  armazenamento = new ArmazenamentoEmMemoria();
  arquivos = new CasosDeUsoDeArquivo(registros, armazenamento, randomUUID, { bytesPorArquivo: 2 * 1024 * 1024, ladoMaximoDeImagem: 12_000, megapixelsNoMaximo: 80 });
  montador = new BriefingParaOOtto({ cadastros, registros, arquivos });
});

const marca = (extra: Partial<MarcaGuardada> = {}): MarcaGuardada => ({ id: randomUUID(), nome: 'Café Aurora', cores: {}, icones: [], restricoes: [], criadaEm: AGORA, alteradaEm: AGORA, ...extra });

describe('aplicarMarca', () => {
  it('a marca completa o que o formulário não trouxe: identidade, logo, ícones, rodapé e restrições', () => {
    const m = marca({
      cores: { primaria: '#0f3b2c', fundo: '#f4efe3' },
      fonteDeTitulo: 'DM Serif Display',
      logo: 'a'.repeat(64),
      icones: ['b'.repeat(64)],
      rodape: '@cafeaurora',
      restricoes: ['nunca foto de pessoa'],
    });
    expect(aplicarMarca({ ...MINIMO, marcaId: m.id, restricoes: ['sem preço'] }, m)).toEqual({
      ...MINIMO,
      marcaId: m.id,
      textos: { titulo: 'Abrimos às 7h', rodape: '@cafeaurora' },
      identidade: { cores: { primaria: '#0f3b2c', fundo: '#f4efe3' }, fonteDeTitulo: 'DM Serif Display' },
      logo: { arquivo: 'a'.repeat(64) },
      icones: [{ arquivo: 'b'.repeat(64) }],
      restricoes: ['nunca foto de pessoa', 'sem preço'],
    });
  });

  it('o que o formulário trouxe vence a marca, campo a campo', () => {
    const m = marca({ cores: { primaria: '#0f3b2c', destaque: '#f4c430' }, fonteDeTitulo: 'DM Serif Display', fonteDeTexto: 'IBM Plex Sans', logo: 'a'.repeat(64), rodape: '@cafeaurora' });
    const r = aplicarMarca(
      { ...MINIMO, textos: { titulo: 'x', rodape: 'outro rodapé' }, identidade: { cores: { primaria: '#ff0000' }, fonteDeTitulo: 'Anton' }, logo: { arquivo: 'c'.repeat(64) } },
      m,
    );
    expect(r.textos.rodape).toBe('outro rodapé');
    expect(r.identidade).toEqual({ cores: { primaria: '#ff0000', destaque: '#f4c430' }, fonteDeTitulo: 'Anton', fonteDeTexto: 'IBM Plex Sans' });
    expect(r.logo).toEqual({ arquivo: 'c'.repeat(64) });
  });

  it('marca sem identidade não inventa identidade: o formulário continua sem ela', () => {
    expect(aplicarMarca(MINIMO, marca())).toEqual(MINIMO);
    expect(aplicarMarca(MINIMO, undefined)).toEqual(MINIMO);
  });

  it('restrição repetida não entra duas vezes, e o total respeita o limite do formulário', () => {
    const m = marca({ restricoes: Array.from({ length: 12 }, (_, i) => `da marca ${i}`) });
    const r = aplicarMarca({ ...MINIMO, restricoes: ['da marca 0', 'da peça'] }, m);
    expect(r.restricoes).toHaveLength(12);
    expect(r.restricoes?.filter((x) => x === 'da marca 0')).toHaveLength(1);
  });
});

describe('preparar (na criação da tarefa)', () => {
  it('devolve a entrada que será guardada: o formulário com a marca aplicada, o esforço do ciclo e o cuidado escolhido', async () => {
    const m = await cadastros.criarMarca(
      contaA,
      { id: randomUUID(), dados: { nome: 'Café Aurora', cores: { primaria: '#0f3b2c' }, icones: [], restricoes: [], rodape: '@cafeaurora' }, agora: AGORA },
      10,
    );
    if (m === 'limite') throw new Error('não criou');
    const { entrada, briefingId } = await montador.preparar(contaA, pedido({ ...MINIMO, marcaId: m.id }, { cuidado: 'autoral' }));
    expect(briefingId).toBeUndefined();
    expect(entrada).toEqual({
      tipo: 'briefing',
      briefing: { ...MINIMO, marcaId: m.id, textos: { titulo: 'Abrimos às 7h', rodape: '@cafeaurora' }, identidade: { cores: { primaria: '#0f3b2c' } } },
      esforco: 'CONCEPTUAL',
      cuidado: 'autoral',
    });
    // é uma entrada válida para o ciclo, e o editor a lê de volta como formulário
    expect(EsquemaDaEntrada.safeParse(entrada).success).toBe(true);
    expect(briefingDaTarefa({ entrada })).toEqual({ briefing: (entrada as { briefing: unknown }).briefing, cuidado: 'autoral' });
  });

  it('os três cuidados viram os três níveis do treinador; sem escolha, é o cuidadoso', async () => {
    const esforcos = [];
    for (const cuidado of ['direto', 'cuidadoso', 'autoral', undefined]) esforcos.push((await montador.preparar(contaA, pedido(MINIMO, cuidado ? { cuidado } : {}))).entrada);
    expect(esforcos.map((e) => (e as { esforco?: string }).esforco)).toEqual(['STANDARD', 'REFINED', 'CONCEPTUAL', 'REFINED']);
  });

  it('marca de outra conta ou inexistente é recusada', async () => {
    const deB = await cadastros.criarMarca(contaB, { id: randomUUID(), dados: { nome: 'de B', cores: {}, icones: [], restricoes: [] }, agora: AGORA }, 10);
    if (deB === 'limite') throw new Error('não criou');
    expect((await erroDe(montador.preparar(contaA, pedido({ ...MINIMO, marcaId: deB.id })))).codigo).toBe(CODIGOS_DE_ERRO.marcaDesconhecida);
    expect((await erroDe(montador.preparar(contaA, pedido({ ...MINIMO, marcaId: randomUUID() })))).codigo).toBe(CODIGOS_DE_ERRO.marcaDesconhecida);
  });

  it('o hash não é autorização: imagem, logo ou ícone de outra conta é recusado, dizendo quantos', async () => {
    const fotoDeB = await arquivos.enviarImagem(contaB, pngDe(800, 600));
    const logoDeB = await arquivos.importarVetor(contaB, LOGO, 'logo.svg');
    expect(await erroDe(montador.preparar(contaA, pedido({ ...MINIMO, imagens: { fonte: 'minhas', arquivos: [fotoDeB.sha256] }, logo: { arquivo: logoDeB.no.origem.arquivo } })))).toMatchObject({
      codigo: CODIGOS_DE_ERRO.arquivoDesconhecido,
      detalhe: { quantos: 2 },
    });
  });

  it('em "minhas imagens" só entra imagem: vetor ali é recusado', async () => {
    const logo = await arquivos.importarVetor(contaA, LOGO, 'logo.svg');
    expect((await erroDe(montador.preparar(contaA, pedido({ ...MINIMO, imagens: { fonte: 'minhas', arquivos: [logo.no.origem.arquivo] } })))).codigo).toBe(CODIGOS_DE_ERRO.arquivoDesconhecido);
  });

  it('o briefing salvo de origem só vale se é da conta', async () => {
    const salvo = await cadastros.criarBriefing(contaA, { id: randomUUID(), dados: { nome: 'x', dados: { versao: 1 } }, agora: AGORA }, 10);
    if (typeof salvo === 'string') throw new Error('não criou');
    expect((await montador.preparar(contaA, pedido(MINIMO, { briefingId: salvo.id }))).briefingId).toBe(salvo.id);
    expect((await montador.preparar(contaB, pedido(MINIMO, { briefingId: salvo.id }))).briefingId).toBeUndefined();
    await montador.usado(contaA, salvo.id);
    expect((await cadastros.buscarBriefing(contaA, salvo.id))?.usos).toBe(1);
  });
});

describe('paraOCiclo (no worker)', () => {
  const preparado = async (briefing: FormularioDeBriefing): Promise<EntradaDaTarefa> => (await montador.preparar(contaA, pedido(briefing))).entrada;

  it('troca as referências pelo material que o ciclo lê: nó de imagem com medidas, e o desenho do logo', async () => {
    const foto = await arquivos.enviarImagem(contaA, pngDe(2400, 1600), { nome: 'vitrine.png' });
    const logo = await arquivos.importarVetor(contaA, LOGO, 'logo do cliente.svg');
    const entrada = await preparado({
      ...MINIMO,
      nome: 'Novo horário',
      objetivo: 'informar',
      publico: 'clientes do bairro',
      estilo: ['acolhedor', 'direto'],
      restricoes: ['sem preço'],
      observacoes: 'abre mais cedo aos sábados',
      identidade: { cores: { primaria: '#0f3b2c' }, fonteDeTitulo: 'DM Serif Display' },
      imagens: { fonte: 'minhas', arquivos: [foto.sha256] },
      logo: { arquivo: logo.no.origem.arquivo },
      icones: [{ arquivo: logo.no.origem.arquivo }],
    });
    const paraOCiclo = await montador.paraOCiclo(contaA, entrada);
    expect(paraOCiclo).toMatchObject({ tipo: 'briefing', esforco: 'REFINED' });
    const b = materialDe(paraOCiclo);
    expect(b).toMatchObject({
      nome: 'Novo horário',
      objetivo: 'informar',
      publico: 'clientes do bairro',
      formatos: MINIMO.formatos,
      textos: { titulo: 'Abrimos às 7h' },
      identidade: { cores: { primaria: '#0f3b2c' }, fonteDeTitulo: 'DM Serif Display' },
      estilo: 'acolhedor, direto',
      restricoes: ['sem preço'],
      observacoes: 'abre mais cedo aos sábados',
      imagens: { usarEstas: [{ descricao: 'vitrine.png', no: { tipo: 'imagem', arquivo: foto.sha256, larguraOriginal: 2400, alturaOriginal: 1600, ajuste: 'cobrir' } }] },
      logo: { arquivo: 'logo do cliente.svg', usarEste: { moldura: logo.no.moldura, caminhos: logo.no.caminhos, origem: { arquivo: logo.no.origem.arquivo, nome: 'logo do cliente.svg' } } },
    });
    expect((b.icones as unknown[]).length).toBe(1);
    // o que é do formulário e não é material não vai: versão e id da marca
    expect(b).not.toHaveProperty('versao');
    expect(b).not.toHaveProperty('marcaId');
    expect(EsquemaDaEntrada.safeParse(paraOCiclo).success).toBe(true);
  });

  it('sem identidade, o material diz que ela não foi definida, em vez de mandar cor de exemplo', async () => {
    const b = materialDe(await montador.paraOCiclo(contaA, await preparado(MINIMO)));
    expect(b.identidade).toBe('não definida: a direção de arte escolhe');
    expect(JSON.stringify(b)).not.toMatch(/#[0-9a-f]{6}/i);
    expect(b.imagens).toEqual({ fonte: 'nenhuma: peça só tipográfica e com formas' });
  });

  it('com banco de imagens, vão os termos de busca (ou a indicação de escolher pelos textos)', async () => {
    const com = materialDe(await montador.paraOCiclo(contaA, await preparado({ ...MINIMO, imagens: { fonte: 'banco', termos: 'café coado' } })));
    expect(com.imagens).toEqual({ fonte: 'banco de imagens', termos: 'café coado' });
    const sem = materialDe(await montador.paraOCiclo(contaA, await preparado({ ...MINIMO, imagens: { fonte: 'banco' } })));
    expect(sem.imagens).toEqual({ fonte: 'banco de imagens', termos: '(escolha pelos textos)' });
  });

  it('logo em imagem vai como imagem, com o aviso de que não muda de cor', async () => {
    const png = await arquivos.enviarImagem(contaA, pngDe(600, 200), { nome: 'logo.png' });
    const b = materialDe(await montador.paraOCiclo(contaA, await preparado({ ...MINIMO, logo: { arquivo: png.sha256 } })));
    expect(b.logo).toMatchObject({ arquivo: 'logo.png', usarEste: { tipo: 'imagem', arquivo: png.sha256, larguraOriginal: 600, alturaOriginal: 200 } });
    expect(String(b.logo.nota)).toContain('não muda de cor');
  });

  it('o worker relê cada arquivo sob a conta do trabalho: com a conta trocada, nenhum arquivo entra no material e o armazenamento não é lido', async () => {
    const foto = await arquivos.enviarImagem(contaA, pngDe(2400, 1600));
    const logo = await arquivos.importarVetor(contaA, LOGO, 'logo.svg');
    const entrada = await preparado({ ...MINIMO, imagens: { fonte: 'minhas', arquivos: [foto.sha256] }, logo: { arquivo: logo.no.origem.arquivo } });
    let leituras = 0;
    const ler = armazenamento.ler.bind(armazenamento);
    armazenamento.ler = async (...a) => {
      leituras++;
      return ler(...a);
    };
    const b = materialDe(await montador.paraOCiclo(contaB, entrada));
    expect(b.imagens).toEqual({ fonte: 'upload do designer', usarEstas: [] });
    expect(b).not.toHaveProperty('logo');
    expect(leituras).toBe(0);
  });

  it('entrada que não veio do formulário (pedido livre, ajuste, briefing solto do roteiro) volta como chegou', async () => {
    const solta: EntradaDaTarefa = { tipo: 'briefing', briefing: { formatos: MINIMO.formatos, estilo: 'acolhedor' }, esforco: 'REFINED' };
    expect(await montador.paraOCiclo(contaA, solta)).toBe(solta);
    const ajuste: EntradaDaTarefa = { tipo: 'ajuste', pedido: 'aumenta o título' };
    expect(await montador.paraOCiclo(contaA, ajuste)).toBe(ajuste);
  });
});
