// Regras da exportação, sem NestJS, sem banco, sem fila e sem motor de verdade.
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { aplicarLote, type Documento, documentoVazio } from '@otto/documento';
import { type RecursosDaExportacao, relatorioDeExportacaoVetorial } from '@otto/psd';
import {
  CODIGOS_DE_ERRO,
  DIAS_DE_RETENCAO_DA_EXPORTACAO,
  EXPORTACOES_NA_FILA_POR_CONTA,
  EXPORTACOES_NA_LISTA,
  Exportacao,
  lerContaId,
  MEGAPIXELS_POR_PRANCHETA_NA_EXPORTACAO,
  PedidoDeExportacao,
  RelatorioDeExportacao,
} from '@otto/shared';
import { unzipSync } from 'fflate';
import { beforeEach, describe, expect, it } from 'vitest';
import { CasosDeUsoDeArquivo } from '../../arquivo/application/casos-de-uso-de-arquivo';
import { ArmazenamentoEmMemoria } from '../../arquivo/infrastructure/adaptadores/memoria/armazenamento-em-memoria';
import { RepositorioDeArquivosEmMemoria } from '../../arquivo/infrastructure/memoria/repositorio-de-arquivos-em-memoria';
import { BibliotecaDeFontesEmMemoria } from '../../biblioteca/infrastructure/memoria/biblioteca-de-fontes-em-memoria';
import { RepositorioDeDocumentosEmMemoria } from '../../documento/infrastructure/memoria/repositorio-de-documentos-em-memoria';
import { ErroDaAplicacao } from '../../plataforma/erros/erro-da-aplicacao';
import { EscopoDaConta } from '../../plataforma/escopo/escopo-da-conta';
import { BarramentoEmMemoria } from '../../plataforma/fila/adaptadores/memoria/barramento-em-memoria';
import { FILAS } from '../../plataforma/fila/barramento-de-eventos';
import { type EventoDeUso, RegistroDeUso } from '../../plataforma/uso/registro-de-uso';
import { RepositorioDeExportacoesEmMemoria } from '../infrastructure/memoria/repositorio-de-exportacoes-em-memoria';
import { CasosDeUsoDeExportacao, type DependenciasDaExportacao, NA_FILA_NO_MAXIMO_MS, RETOMAR_SEM_SINAL_DEPOIS_DE_MS, SEM_SINAL_DEPOIS_DE_MS } from './casos-de-uso-de-exportacao';
import { type ArquivoGerado, type EntreEtapas, MotorDeExportacao } from './motor-de-exportacao';

const contaA = EscopoDaConta.abrir(lerContaId('01990000-0000-7000-8000-00000000000a'));
const contaB = EscopoDaConta.abrir(lerContaId('01990000-0000-7000-8000-00000000000b'));
const PNG = readFileSync(path.resolve(import.meta.dirname, '../../../../../packages/render/recursos-de-teste/imagens/recorte-com-alfa.png'));
const AGORA = new Date('2026-10-01T12:00:00.000Z');

class MotorFalso extends MotorDeExportacao {
  chamadas: { formato: string; nome: string; pranchetas: readonly string[]; opcoes: object; recursos: RecursosDaExportacao; doc: Documento }[] = [];
  falharEm = new Set<string>();

  private gerar(
    formato: 'psd' | 'png' | 'svg' | 'pdf',
    doc: Documento,
    recursos: RecursosDaExportacao,
    opcoes: { nome: string; pranchetas: readonly string[] },
    entreEtapas: EntreEtapas,
  ): Promise<ArquivoGerado[]> {
    return (async () => {
      await entreEtapas();
      this.chamadas.push({ formato, nome: opcoes.nome, pranchetas: opcoes.pranchetas, opcoes, recursos, doc });
      if (opcoes.pranchetas.some((p) => this.falharEm.has(p))) throw new Error('falha de propósito no motor');
      return [{ nome: `${opcoes.nome}.${formato}`, bytes: new TextEncoder().encode(`${formato}:${opcoes.pranchetas.join(',')}`) }];
    })();
  }
  psd(doc: Documento, recursos: RecursosDaExportacao, opcoes: { nome: string; pranchetas: readonly string[]; arquivos: 'por-prancheta' | 'juntas' }, e: EntreEtapas) {
    return this.gerar('psd', doc, recursos, opcoes, e);
  }
  png(doc: Documento, recursos: RecursosDaExportacao, opcoes: { nome: string; pranchetas: readonly string[]; escala: 1 | 2; semFundo: boolean }, e: EntreEtapas) {
    return this.gerar('png', doc, recursos, opcoes, e);
  }
  svg(doc: Documento, recursos: RecursosDaExportacao, opcoes: { nome: string; pranchetas: readonly string[]; escalaDaImagem?: 1 | 2 }, e: EntreEtapas) {
    return this.gerar('svg', doc, recursos, opcoes, e);
  }
  pdf(doc: Documento, recursos: RecursosDaExportacao, opcoes: { nome: string; pranchetas: readonly string[]; arquivos: 'por-prancheta' | 'juntas' }, e: EntreEtapas) {
    return this.gerar('pdf', doc, recursos, opcoes, e);
  }
}

class UsoEspiao extends RegistroDeUso {
  eventos: EventoDeUso[] = [];
  registrar(_escopo: EscopoDaConta, evento: EventoDeUso): void {
    this.eventos.push(evento);
  }
}

class BarramentoForaDoAr extends BarramentoEmMemoria {
  override async publicar(): Promise<void> {
    throw new Error('fila fora do ar');
  }
}

let documentos: RepositorioDeDocumentosEmMemoria;
let exportacoes: RepositorioDeExportacoesEmMemoria;
let armazenamento: ArmazenamentoEmMemoria;
let arquivosDaConta: CasosDeUsoDeArquivo;
let fontes: BibliotecaDeFontesEmMemoria;
let fila: BarramentoEmMemoria;
let motor: MotorFalso;
let casos: CasosDeUsoDeExportacao;
let relogio: Date;
let uso: UsoEspiao;

function montar(barramento: BarramentoEmMemoria = new BarramentoEmMemoria(), extras: Partial<DependenciasDaExportacao> = {}) {
  fila = barramento;
  casos = new CasosDeUsoDeExportacao({ documentos, exportacoes, arquivos: repositorioDeArquivos, armazenamento, fontes, fila, motor, gerarId: randomUUID, agora: () => relogio, uso, ...extras });
}
let repositorioDeArquivos: RepositorioDeArquivosEmMemoria;

beforeEach(() => {
  documentos = new RepositorioDeDocumentosEmMemoria();
  exportacoes = new RepositorioDeExportacoesEmMemoria();
  armazenamento = new ArmazenamentoEmMemoria();
  repositorioDeArquivos = new RepositorioDeArquivosEmMemoria();
  arquivosDaConta = new CasosDeUsoDeArquivo(repositorioDeArquivos, armazenamento, randomUUID, { bytesPorArquivo: 25e6, ladoMaximoDeImagem: 12_000, megapixelsNoMaximo: 80 });
  fontes = new BibliotecaDeFontesEmMemoria();
  motor = new MotorFalso();
  uso = new UsoEspiao();
  relogio = AGORA;
  montar();
});

/** Árvore montada pelo catálogo de operações. As pranchetas ficam com os ids p1, p2... e as camadas (na primeira prancheta) vêm depois. */
function arvoreCom(pranchetas: string[], camadas: object[] = []): Documento {
  const operacoes = [
    ...pranchetas.map((nome) => ({ op: 'criarPrancheta', nome, largura: 1080, altura: 1350, fundo: '#ffffff' })),
    ...camadas.map((no) => ({ op: 'criarNo', prancheta: pranchetas[0], no })),
  ];
  const r = aplicarLote(documentoVazio(), operacoes, { autoria: { tipo: 'designer' }, idDoLote: randomUUID(), gerarId: (indice) => `p${indice + 1}` });
  if (!r.ok) throw new Error(`árvore de teste recusada: ${r.erro.mensagem}`);
  return r.doc;
}

async function documento(escopo = contaA, arvore = arvoreCom(['Feed', 'Story']), nome = 'Promoção') {
  return documentos.criar(escopo, { id: randomUUID(), nome, arvore });
}

async function erroDe(promessa: Promise<unknown>): Promise<ErroDaAplicacao> {
  try {
    await promessa;
  } catch (e) {
    if (e instanceof ErroDaAplicacao) return e;
    throw e;
  }
  throw new Error('esperava ErroDaAplicacao');
}

describe('pedir exportação', () => {
  it('cria na fila, com a versão atual e todas as pranchetas, publica só identificadores e responde no formato do contrato', async () => {
    const doc = await documento();
    const e = Exportacao.parse(await casos.pedir(contaA, doc.id, { formato: 'psd', arquivos: 'por-prancheta' }));
    expect(e).toMatchObject({ documentoId: doc.id, versao: 0, formato: 'psd', estado: 'na_fila', progresso: { pranchetasProntas: 0, pranchetasNoTotal: 2 }, arquivos: [], falhas: [] });
    expect(fila.publicados).toEqual([{ fila: FILAS.exportacao, trabalho: { contaId: contaA.contaId, id: e.id } }]);
  });

  it('aceita um subconjunto das pranchetas, na ordem do documento', async () => {
    const doc = await documento();
    const e = await casos.pedir(contaA, doc.id, { formato: 'png', escala: 2, semFundo: true, pranchetas: ['p2'] });
    expect(e.progresso.pranchetasNoTotal).toBe(1);
    expect((await exportacoes.buscar(contaA, e.id))?.opcoes).toEqual({ formato: 'png', escala: 2, semFundo: true, pranchetas: ['p2'] });
  });

  it('prancheta que o documento não tem: 422, e nada é criado', async () => {
    const doc = await documento();
    expect((await erroDe(casos.pedir(contaA, doc.id, { formato: 'psd', arquivos: 'juntas', pranchetas: ['p1', 'não-existe'] }))).codigo).toBe(CODIGOS_DE_ERRO.pranchetaDesconhecida);
    expect(fila.publicados).toEqual([]);
  });

  it('documento sem prancheta não tem o que exportar', async () => {
    const doc = await documento(contaA, documentoVazio());
    expect((await erroDe(casos.pedir(contaA, doc.id, { formato: 'psd', arquivos: 'por-prancheta' }))).codigo).toBe(CODIGOS_DE_ERRO.nadaParaExportar);
  });

  it('documento de outra conta é "não encontrado"', async () => {
    const deB = await documento(contaB);
    expect((await erroDe(casos.pedir(contaA, deB.id, { formato: 'psd', arquivos: 'por-prancheta' }))).codigo).toBe(CODIGOS_DE_ERRO.naoEncontrado);
    expect(fila.publicados).toEqual([]);
  });

  it('limite de exportações esperando por conta: a seguinte é recusada com 429, e a outra conta não é afetada', async () => {
    const doc = await documento();
    for (let i = 0; i < EXPORTACOES_NA_FILA_POR_CONTA; i++) await casos.pedir(contaA, doc.id, { formato: 'psd', arquivos: 'por-prancheta' });
    expect(await erroDe(casos.pedir(contaA, doc.id, { formato: 'psd', arquivos: 'por-prancheta' }))).toMatchObject({
      codigo: CODIGOS_DE_ERRO.limiteDeExportacoes,
      detalhe: { limite: EXPORTACOES_NA_FILA_POR_CONTA },
    });
    const deB = await documento(contaB);
    expect((await casos.pedir(contaB, deB.id, { formato: 'psd', arquivos: 'por-prancheta' })).estado).toBe('na_fila');
  });

  it('fila fora do ar: responde fila_indisponivel e a exportação não fica pendurada na fila', async () => {
    montar(new BarramentoForaDoAr());
    const doc = await documento();
    expect((await erroDe(casos.pedir(contaA, doc.id, { formato: 'psd', arquivos: 'por-prancheta' }))).codigo).toBe(CODIGOS_DE_ERRO.filaIndisponivel);
    expect(await exportacoes.contarEmAndamento(contaA)).toBe(0);
  });
});

describe('executar exportação (o worker)', () => {
  const pedirEExecutar = async (pedido: Parameters<CasosDeUsoDeExportacao['pedir']>[2], doc?: Awaited<ReturnType<typeof documento>>) => {
    const d = doc ?? (await documento());
    const pedida = await casos.pedir(contaA, d.id, pedido);
    relogio = new Date(AGORA.getTime() + 1500);
    const resultado = await casos.executar(contaA, pedida.id);
    return { resultado, exportacao: Exportacao.parse(await casos.consultar(contaA, pedida.id)), doc: d };
  };

  it('PSD por prancheta: um arquivo por prancheta, guardado sob a conta, com progresso, relatório, duração e vencimento em 7 dias', async () => {
    const { resultado, exportacao: e } = await pedirEExecutar({ formato: 'psd', arquivos: 'por-prancheta' });
    expect(resultado).toBe('feita');
    expect(e.estado).toBe('pronta');
    expect(e.progresso).toEqual({ pranchetasProntas: 2, pranchetasNoTotal: 2 });
    expect(e.arquivos.map((a) => [a.indice, a.nome, a.tipo, a.pranchetaId, a.baixar])).toEqual([
      [0, 'Promoção - Feed.psd', 'image/vnd.adobe.photoshop', 'p1', `/api/exportacoes/${e.id}/arquivos/0`],
      [1, 'Promoção - Story.psd', 'image/vnd.adobe.photoshop', 'p2', `/api/exportacoes/${e.id}/arquivos/1`],
    ]);
    expect(RelatorioDeExportacao.parse(e.relatorio).arquivos).toEqual(['Promoção - Feed.psd', 'Promoção - Story.psd']);
    expect(e.expiraEm).toBe(new Date(relogio.getTime() + DIAS_DE_RETENCAO_DA_EXPORTACAO * 86_400_000).toISOString());
    expect(e.prontaEm).toBe(relogio.toISOString());
    expect(e.duracaoMs).toBeGreaterThanOrEqual(0);
    const guardada = await exportacoes.buscar(contaA, e.id);
    expect(guardada?.arquivos[0]?.chaveDoObjeto).toBe(`contas/${contaA.contaId}/exportacoes/${e.id}/0.psd`);
    expect(new TextDecoder().decode(await armazenamento.ler(contaA, guardada?.arquivos[0]?.chaveDoObjeto as string))).toBe('psd:p1');
  });

  it('peça de uma prancheta só: o arquivo leva o nome da peça, sem o nome da prancheta', async () => {
    const doc = await documento(contaA, arvoreCom(['Feed']), 'Capa: "Jazz" / 2026');
    const { exportacao: e } = await pedirEExecutar({ formato: 'psd', arquivos: 'por-prancheta' }, doc);
    expect(motor.chamadas[0]?.nome).toBe('Capa: "Jazz" / 2026');
    expect(e.arquivos).toHaveLength(1);
  });

  it('PSD com as pranchetas juntas: uma chamada ao motor, um arquivo sem prancheta, progresso completo', async () => {
    const { exportacao: e } = await pedirEExecutar({ formato: 'psd', arquivos: 'juntas' });
    expect(motor.chamadas).toHaveLength(1);
    expect(motor.chamadas[0]).toMatchObject({ formato: 'psd', pranchetas: ['p1', 'p2'], opcoes: { arquivos: 'juntas' } });
    expect(e.arquivos).toHaveLength(1);
    expect(e.arquivos[0]).not.toHaveProperty('pranchetaId');
    expect(e.progresso).toEqual({ pranchetasProntas: 2, pranchetasNoTotal: 2 });
  });

  it('PNG: repassa escala e fundo, e não tem relatório', async () => {
    const { exportacao: e } = await pedirEExecutar({ formato: 'png', escala: 2, semFundo: true, pranchetas: ['p2'] });
    expect(motor.chamadas[0]).toMatchObject({ formato: 'png', pranchetas: ['p2'], opcoes: { escala: 2, semFundo: true } });
    // a peça tem duas pranchetas: o arquivo leva o nome da prancheta mesmo quando só uma foi pedida
    expect(e.arquivos[0]).toMatchObject({ nome: 'Promoção - Story.png', tipo: 'image/png' });
    expect(e.relatorio).toBeUndefined();
  });

  it('exporta a versão do momento do pedido, mesmo que o documento tenha mudado depois', async () => {
    const doc = await documento();
    const pedida = await casos.pedir(contaA, doc.id, { formato: 'psd', arquivos: 'juntas' });
    await documentos.comTrava(contaA, doc.id, (d) =>
      d.gravarLote({ id: randomUUID(), versao: 1, autoria: 'designer', tipo: 'edicao', descricao: 'apaga tudo', operacoes: [], tocados: [], arvore: arvoreCom(['Feed']) }),
    );
    await casos.executar(contaA, pedida.id);
    expect(motor.chamadas[0]?.doc.pranchetas.map((p) => p.id)).toEqual(['p1', 'p2']);
    expect((await casos.consultar(contaA, pedida.id)).versao).toBe(0);
  });

  it('resultado parcial: a prancheta que falha vira falha, as outras saem, e o relatório é só do que saiu', async () => {
    motor.falharEm.add('p1');
    const { exportacao: e } = await pedirEExecutar({ formato: 'psd', arquivos: 'por-prancheta' });
    expect(e.estado).toBe('pronta_em_parte');
    expect(e.falhas).toEqual([{ pranchetaId: 'p1', codigo: 'falha_na_prancheta' }]);
    expect(e.arquivos.map((a) => a.pranchetaId)).toEqual(['p2']);
    expect(e.progresso).toEqual({ pranchetasProntas: 2, pranchetasNoTotal: 2 });
    expect(e.relatorio?.arquivos).toEqual(['Promoção - Story.psd']);
    expect(e.expiraEm).toBeDefined();
  });

  it('se nenhuma prancheta sai, a exportação falha, sem arquivo e sem vencimento', async () => {
    motor.falharEm.add('p1').add('p2');
    const { exportacao: e } = await pedirEExecutar({ formato: 'psd', arquivos: 'por-prancheta' });
    expect(e).toMatchObject({ estado: 'falhou', erro: { codigo: 'falha_na_exportacao' }, arquivos: [] });
    expect(e.expiraEm).toBeUndefined();
  });

  it('entrega ao motor as fontes das famílias usadas (todos os pesos) e as imagens DA CONTA, com os bytes', async () => {
    await fontes.registrar({ familia: 'Anton', peso: 400, nomePostScript: 'Anton-Regular', licenca: null, conteudo: Uint8Array.from([1, 2]) });
    await fontes.registrar({ familia: 'Anton', peso: 700, nomePostScript: 'Anton-Bold', licenca: null, conteudo: Uint8Array.from([3]) });
    await fontes.registrar({ familia: 'Outra', peso: 400, nomePostScript: 'Outra', licenca: null, conteudo: Uint8Array.from([9]) });
    const { sha256 } = await arquivosDaConta.enviarImagem(contaA, PNG);
    const alheio = 'e'.repeat(64);
    const camadas = [
      { nome: 'Título', tipo: 'texto', x: 0, y: 0, largura: 100, altura: 50, conteudo: 'Oi', fonte: 'Anton', tamanho: 20, cor: '#000000' },
      { nome: 'Foto', tipo: 'imagem', x: 0, y: 0, largura: 10, altura: 10, arquivo: sha256, larguraOriginal: 600, alturaOriginal: 800 },
      { nome: 'Foto de outra conta', tipo: 'imagem', x: 0, y: 0, largura: 10, altura: 10, arquivo: alheio, larguraOriginal: 10, alturaOriginal: 10 },
    ];
    const doc = await documento(contaA, arvoreCom(['Feed'], camadas));
    // o arquivo existe, mas na conta B: não pode chegar ao motor
    await repositorioDeArquivos.registrar(contaB, {
      id: randomUUID(),
      sha256: alheio,
      tipoMime: 'image/png',
      bytes: 1,
      largura: 1,
      altura: 1,
      especie: 'imagem',
      chaveDoObjeto: `contas/${contaB.contaId}/arquivos/${alheio}`,
    });
    const { exportacao: e } = await pedirEExecutar({ formato: 'psd', arquivos: 'por-prancheta' }, doc);
    const recursos = motor.chamadas[0]?.recursos as RecursosDaExportacao;
    expect(recursos.fontes.map((f) => [f.familia, f.peso, f.postScript, f.bytes.byteLength])).toEqual([
      ['Anton', 400, 'Anton-Regular', 2],
      ['Anton', 700, 'Anton-Bold', 1],
    ]);
    expect(recursos.imagens.map((i) => [i.arquivo, i.tipo, i.bytes.byteLength])).toEqual([[sha256, 'image/png', PNG.byteLength]]);
    expect(e.relatorio?.emFalta.imagens.map((i) => i.arquivo)).toEqual([alheio]);
  });

  it('é idempotente: entregue duas vezes, roda uma vez só', async () => {
    const doc = await documento();
    const pedida = await casos.pedir(contaA, doc.id, { formato: 'psd', arquivos: 'juntas' });
    expect(await casos.executar(contaA, pedida.id)).toBe('feita');
    expect(await casos.executar(contaA, pedida.id)).toBe('ignorada');
    expect(motor.chamadas).toHaveLength(1);
  });

  it('trabalho com a conta trocada é ignorado: nada é processado e a exportação continua na fila', async () => {
    const doc = await documento();
    const pedida = await casos.pedir(contaA, doc.id, { formato: 'psd', arquivos: 'juntas' });
    expect(await casos.executar(contaB, pedida.id)).toBe('ignorada');
    expect(motor.chamadas).toEqual([]);
    expect((await casos.consultar(contaA, pedida.id)).estado).toBe('na_fila');
  });

  it('uma por vez por conta: com outra rodando, responde "ocupada" (a fila adia, sem gastar tentativa) e a exportação continua na fila', async () => {
    const doc = await documento();
    const [um, dois] = [await casos.pedir(contaA, doc.id, { formato: 'psd', arquivos: 'juntas' }), await casos.pedir(contaA, doc.id, { formato: 'psd', arquivos: 'juntas' })];
    await exportacoes.iniciar(contaA, um.id, AGORA, new Date(0));
    expect(await casos.executar(contaA, dois.id)).toBe('ocupada');
    expect((await casos.consultar(contaA, dois.id)).estado).toBe('na_fila');
    expect(motor.chamadas).toEqual([]);
  });

  it('documento que sumiu entre o pedido e o trabalho: falha com código, sem chamar o motor', async () => {
    const pedida = await exportacoes.criar(contaA, { id: randomUUID(), documentoId: randomUUID(), versao: 0, nome: 'x', opcoes: { formato: 'psd', arquivos: 'juntas', pranchetas: ['p1'] } });
    await casos.executar(contaA, pedida.id);
    expect(await casos.consultar(contaA, pedida.id)).toMatchObject({ estado: 'falhou', erro: { codigo: 'documento_indisponivel' } });
    expect(motor.chamadas).toEqual([]);
  });

  it('duas pranchetas com o mesmo nome não geram dois arquivos com o mesmo nome', async () => {
    const doc = await documento(contaA, { ...arvoreCom(['Feed', 'Story']), pranchetas: arvoreCom(['Feed', 'Story']).pranchetas.map((p) => ({ ...p, nome: 'Feed' })) });
    const { exportacao: e } = await pedirEExecutar({ formato: 'psd', arquivos: 'por-prancheta' }, doc);
    expect(e.arquivos.map((a) => a.nome)).toEqual(['Promoção - Feed.psd', 'Promoção - Feed (2).psd']);
    expect(e.relatorio?.arquivos).toEqual(['Promoção - Feed.psd', 'Promoção - Feed (2).psd']);
  });

  it('falha no PSD com as pranchetas juntas é falha da exportação inteira', async () => {
    motor.falharEm.add('p2');
    const { exportacao: e } = await pedirEExecutar({ formato: 'psd', arquivos: 'juntas' });
    expect(e).toMatchObject({ estado: 'falhou', erro: { codigo: 'falha_na_exportacao' }, arquivos: [], falhas: [] });
  });

  it('registra o uso sem conteúdo: formato, contagens, bytes, duração e resultado', async () => {
    motor.falharEm.add('p1');
    await pedirEExecutar({ formato: 'psd', arquivos: 'por-prancheta' });
    expect(uso.eventos.map((e) => e.evento)).toEqual(['exportacao_pedida', 'exportacao_terminada']);
    expect(uso.eventos[0]).toMatchObject({ formato: 'psd', pranchetas: 2, juntas: false });
    expect(uso.eventos[1]).toMatchObject({ formato: 'psd', resultado: 'pronta_em_parte', pranchetas: 2, falhas: 1, arquivos: 1, bytes: 6 });
    expect(JSON.stringify(uso.eventos)).not.toMatch(/Promoção|Feed|Story/);
  });
});

describe('consultar e baixar', () => {
  async function pronta() {
    const doc = await documento();
    const pedida = await casos.pedir(contaA, doc.id, { formato: 'psd', arquivos: 'por-prancheta' });
    await casos.executar(contaA, pedida.id);
    return pedida.id;
  }

  it('exportação de outra conta é "não encontrada", para consultar e para baixar', async () => {
    const id = await pronta();
    expect((await erroDe(casos.consultar(contaB, id))).codigo).toBe(CODIGOS_DE_ERRO.naoEncontrado);
    expect((await erroDe(casos.linkDoArquivo(contaB, id, 0))).codigo).toBe(CODIGOS_DE_ERRO.naoEncontrado);
    expect((await erroDe(casos.consultar(contaA, randomUUID()))).codigo).toBe(CODIGOS_DE_ERRO.naoEncontrado);
  });

  it('o link de download entrega o arquivo com o nome certo, e é outro a cada pedido', async () => {
    const id = await pronta();
    const link = await casos.linkDoArquivo(contaA, id, 1);
    const baixado = await armazenamento.abrirLinkProprio(link.split('/').at(-1) as string);
    expect(baixado).toMatchObject({ nome: 'Promoção - Story.psd', tipo: 'image/vnd.adobe.photoshop' });
    expect(new TextDecoder().decode(baixado?.bytes)).toBe('psd:p2');
  });

  it('antes de ficar pronta: 409 com o estado; índice que não existe: não encontrado', async () => {
    const doc = await documento();
    const pedida = await casos.pedir(contaA, doc.id, { formato: 'psd', arquivos: 'por-prancheta' });
    expect(await erroDe(casos.linkDoArquivo(contaA, pedida.id, 0))).toMatchObject({ codigo: CODIGOS_DE_ERRO.exportacaoNaoPronta, detalhe: { estado: 'na_fila' } });
    await casos.executar(contaA, pedida.id);
    expect((await erroDe(casos.linkDoArquivo(contaA, pedida.id, 7))).codigo).toBe(CODIGOS_DE_ERRO.naoEncontrado);
  });

  it('depois do vencimento: 410, e não sai link', async () => {
    const id = await pronta();
    relogio = new Date(AGORA.getTime() + (DIAS_DE_RETENCAO_DA_EXPORTACAO * 86_400 + 60) * 1000);
    expect((await erroDe(casos.linkDoArquivo(contaA, id, 0))).codigo).toBe(CODIGOS_DE_ERRO.exportacaoExpirada);
  });
});

describe('relatório antes de exportar', () => {
  it('devolve o relatório sem criar exportação nem tocar na fila', async () => {
    const doc = await documento();
    const r = RelatorioDeExportacao.parse(await casos.relatorio(contaA, doc.id, { formato: 'psd', arquivos: 'por-prancheta' }));
    expect(r.camadas.map((c) => c.prancheta)).toEqual(['Feed', 'Story']);
    expect(fila.publicados).toEqual([]);
    expect(await exportacoes.contarEmAndamento(contaA)).toBe(0);
  });

  it('para PNG, só o que vale para imagem chapada: o que falta e a origem das imagens, sem lista de camadas', async () => {
    const doc = await documento();
    const r = await casos.relatorio(contaA, doc.id, { formato: 'png', escala: 1, semFundo: false });
    expect(r).toMatchObject({ camadas: [], fontes: [], tokens: [] });
    expect(r.avisos.every((a) => ['fonte-substituida', 'fonte-em-falta', 'imagem-em-falta'].includes(a.codigo))).toBe(true);
  });

  it('respeita as pranchetas pedidas e recusa a que não existe', async () => {
    const doc = await documento();
    expect((await casos.relatorio(contaA, doc.id, { formato: 'psd', arquivos: 'por-prancheta', pranchetas: ['p2'] })).camadas.map((c) => c.prancheta)).toEqual(['Story']);
    expect((await erroDe(casos.relatorio(contaA, doc.id, { formato: 'psd', arquivos: 'juntas', pranchetas: ['x'] }))).codigo).toBe(CODIGOS_DE_ERRO.pranchetaDesconhecida);
    expect((await erroDe(casos.relatorio(contaB, doc.id, { formato: 'psd', arquivos: 'juntas' }))).codigo).toBe(CODIGOS_DE_ERRO.naoEncontrado);
  });
});

// ---------------------------------------------------------------------------------------------
// Fechamento da fatia 2: SVG e PDF, pacote, nome de arquivo, limpeza, exportação parada e lista.
// ---------------------------------------------------------------------------------------------

const UM_DIA = 86_400_000;
const pedirE = async (pedido: Parameters<CasosDeUsoDeExportacao['pedir']>[2], doc?: Awaited<ReturnType<typeof documento>>) => {
  const d = doc ?? (await documento());
  const pedida = await casos.pedir(contaA, d.id, pedido);
  await casos.executar(contaA, pedida.id);
  return { exportacao: Exportacao.parse(await casos.consultar(contaA, pedida.id)), doc: d };
};
const texto = (camadas: object[] = []) => [{ nome: 'Título', tipo: 'texto', x: 0, y: 0, largura: 100, altura: 50, conteudo: 'Oi', fonte: 'Anton', tamanho: 20, cor: '#000000' }, ...camadas];

describe('SVG e PDF', () => {
  it('SVG: um arquivo por prancheta, com o tipo certo e o relatório vetorial do que saiu', async () => {
    const { exportacao: e } = await pedirE({ formato: 'svg' });
    expect(e).toMatchObject({ formato: 'svg', estado: 'pronta', progresso: { pranchetasProntas: 2, pranchetasNoTotal: 2 } });
    expect(e.arquivos.map((a) => [a.nome, a.tipo, a.pranchetaId])).toEqual([
      ['Promoção - Feed.svg', 'image/svg+xml', 'p1'],
      ['Promoção - Story.svg', 'image/svg+xml', 'p2'],
    ]);
    expect(motor.chamadas.map((c) => [c.formato, c.pranchetas])).toEqual([
      ['svg', ['p1']],
      ['svg', ['p2']],
    ]);
    expect(RelatorioDeExportacao.parse(e.relatorio).arquivos).toEqual(['Promoção - Feed.svg', 'Promoção - Story.svg']);
    expect((await exportacoes.buscar(contaA, e.id))?.arquivos[0]?.chaveDoObjeto).toBe(`contas/${contaA.contaId}/exportacoes/${e.id}/0.svg`);
  });

  it('PDF: por padrão as pranchetas vão juntas, uma página cada, num arquivo com o nome da peça; falhou, falhou tudo', async () => {
    const { exportacao: e } = await pedirE({ formato: 'pdf', arquivos: 'juntas' });
    expect(motor.chamadas).toHaveLength(1);
    expect(motor.chamadas[0]).toMatchObject({ formato: 'pdf', nome: 'Promoção', pranchetas: ['p1', 'p2'], opcoes: { arquivos: 'juntas' } });
    expect(e.arquivos.map((a) => [a.nome, a.tipo])).toEqual([['Promoção.pdf', 'application/pdf']]);
    expect(e.arquivos[0]).not.toHaveProperty('pranchetaId');
    expect(e.progresso).toEqual({ pranchetasProntas: 2, pranchetasNoTotal: 2 });

    motor.falharEm.add('p2');
    const { exportacao: falha } = await pedirE({ formato: 'pdf', arquivos: 'juntas' });
    expect(falha).toMatchObject({ estado: 'falhou', arquivos: [], falhas: [] });
  });

  it('PDF por prancheta: um arquivo cada, e a que falha não derruba a outra', async () => {
    motor.falharEm.add('p1');
    const { exportacao: e } = await pedirE({ formato: 'pdf', arquivos: 'por-prancheta' });
    expect(e.estado).toBe('pronta_em_parte');
    expect(e.arquivos.map((a) => a.nome)).toEqual(['Promoção - Story.pdf']);
  });

  it('o relatório prévio do SVG e do PDF é o vetorial de @otto/psd, e não o do PSD', async () => {
    const ajuste = { nome: 'Curvas', tipo: 'ajuste', ajuste: { tipo: 'curvas' } };
    const doc = await documento(contaA, arvoreCom(['Feed'], texto([ajuste])));
    // o destino de cada camada é decisão do mapeamento vetorial (do especialista-grafico): aqui só se confere a origem
    const direto = (formato: 'svg' | 'pdf') => relatorioDeExportacaoVetorial(doc.arvore, { fontes: [], imagens: [] }, { pranchetas: ['p1'], formato }).camadas.map((c) => [c.camada, c.destino]);
    const svg = RelatorioDeExportacao.parse(await casos.relatorio(contaA, doc.id, { formato: 'svg' }));
    const pdf = RelatorioDeExportacao.parse(await casos.relatorio(contaA, doc.id, { formato: 'pdf', arquivos: 'juntas' }));
    const psd = await casos.relatorio(contaA, doc.id, { formato: 'psd', arquivos: 'por-prancheta' });
    expect(svg.camadas.map((c) => [c.camada, c.destino])).toEqual(direto('svg'));
    expect(pdf.camadas.map((c) => [c.camada, c.destino])).toEqual(direto('pdf'));
    expect(psd.camadas.length).toBeGreaterThan(0);
  });
});

describe('nome do arquivo', () => {
  it('peça com mais de uma prancheta: o arquivo leva o nome da prancheta, mesmo exportando uma só (como ao tentar de novo a que falhou)', async () => {
    const doc = await documento();
    motor.falharEm.add('p1');
    const { exportacao: primeira } = await pedirE({ formato: 'psd', arquivos: 'por-prancheta' }, doc);
    motor.falharEm.clear();
    const { exportacao: deNovo } = await pedirE({ formato: 'psd', arquivos: 'por-prancheta', pranchetas: ['p1'] }, doc);
    expect([...primeira.arquivos, ...deNovo.arquivos].map((a) => a.nome)).toEqual(['Promoção - Story.psd', 'Promoção - Feed.psd']);
  });

  it('peça de uma prancheta só: o arquivo leva só o nome da peça, em qualquer formato', async () => {
    const doc = await documento(contaA, arvoreCom(['Feed']));
    const nomes: string[] = [];
    for (const pedido of [{ formato: 'psd', arquivos: 'por-prancheta' }, { formato: 'png', escala: 1, semFundo: false }, { formato: 'svg' }, { formato: 'pdf', arquivos: 'por-prancheta' }] as const) {
      nomes.push(...(await pedirE(pedido, doc)).exportacao.arquivos.map((a) => a.nome));
    }
    expect(nomes).toEqual(['Promoção.psd', 'Promoção.png', 'Promoção.svg', 'Promoção.pdf']);
  });
});

describe('pacote (.zip)', () => {
  async function comFontes(camadas: object[]) {
    await fontes.registrar({ familia: 'Anton', peso: 400, nomePostScript: 'Anton-Regular', licenca: 'SIL Open Font License 1.1', conteudo: Uint8Array.from([0, 1, 0, 0, 7]) });
    await fontes.registrar({
      familia: 'Aberta',
      peso: 400,
      nomePostScript: 'Aberta-Regular',
      licenca: 'Google Fonts (licença aberta, a conferir por família)',
      conteudo: Uint8Array.from([79, 84, 84, 79, 1]),
    });
    await fontes.registrar({ familia: 'Fechada', peso: 400, nomePostScript: 'Fechada-Regular', licenca: 'Licença comercial', conteudo: Uint8Array.from([0, 1, 0, 0, 8]) });
    await fontes.registrar({ familia: 'Sem Registro', peso: 400, nomePostScript: 'SemRegistro-Regular', licenca: null, conteudo: Uint8Array.from([0, 1, 0, 0, 9]) });
    await fontes.registrar({ familia: 'Não Usada', peso: 400, nomePostScript: 'NaoUsada-Regular', licenca: 'SIL Open Font License 1.1', conteudo: Uint8Array.from([0, 1, 0, 0, 5]) });
    return documento(contaA, arvoreCom(['Feed', 'Story'], camadas));
  }
  const camadaDeTexto = (nome: string, fonte: string) => ({ nome, tipo: 'texto', x: 0, y: 0, largura: 100, altura: 50, conteudo: 'Oi', fonte, tamanho: 20, cor: '#000000' });
  const quatroTextos = [camadaDeTexto('A', 'Anton'), camadaDeTexto('B', 'Aberta'), camadaDeTexto('C', 'Fechada'), camadaDeTexto('D', 'Sem Registro')];
  const abrirZip = async (id: string) => unzipSync((await armazenamento.ler(contaA, `contas/${contaA.contaId}/exportacoes/${id}/0.zip`)) as Uint8Array);

  it('entrega UM .zip com os arquivos do formato, a pasta de fontes usadas e o relatório em texto', async () => {
    const doc = await comFontes(quatroTextos);
    const { exportacao: e } = await pedirE({ formato: 'psd', arquivos: 'por-prancheta', pacote: true }, doc);
    expect(e).toMatchObject({ estado: 'pronta', formato: 'psd', pacote: true, progresso: { pranchetasProntas: 2, pranchetasNoTotal: 2 } });
    expect(e.arquivos.map((a) => [a.indice, a.nome, a.tipo, a.pranchetaId])).toEqual([[0, 'Promoção.zip', 'application/zip', undefined]]);

    const zip = await abrirZip(e.id);
    expect(Object.keys(zip).sort()).toEqual(['Fontes/Aberta-Regular.otf', 'Fontes/Anton-Regular.ttf', 'Promoção - Feed.psd', 'Promoção - Story.psd', 'Relatório de exportação.md'].sort());
    expect(new TextDecoder().decode(zip['Promoção - Feed.psd'])).toBe('psd:p1');
    expect(Array.from(zip['Fontes/Anton-Regular.ttf'] as Uint8Array)).toEqual([0, 1, 0, 0, 7]);
    expect(e.arquivos[0]?.bytes).toBe((await armazenamento.ler(contaA, `contas/${contaA.contaId}/exportacoes/${e.id}/0.zip`))?.byteLength);
  });

  it('fonte cuja licença não deixa redistribuir, ou sem licença registrada, fica fora do pacote, e o relatório diz qual e por quê', async () => {
    const doc = await comFontes(quatroTextos);
    const { exportacao: e } = await pedirE({ formato: 'psd', arquivos: 'por-prancheta', pacote: true }, doc);
    expect(e.relatorio?.pacote?.fontes.map((f) => [f.familia, f.incluida, f.arquivo ?? f.motivo])).toEqual([
      ['Aberta', true, 'Fontes/Aberta-Regular.otf'],
      ['Anton', true, 'Fontes/Anton-Regular.ttf'],
      ['Fechada', false, 'licenca_nao_permite'],
      ['Sem Registro', false, 'licenca_desconhecida'],
    ]);
    const relatorio = new TextDecoder().decode((await abrirZip(e.id))['Relatório de exportação.md']);
    expect(relatorio).toContain('# Relatório de exportação: Promoção');
    expect(relatorio).toContain('Fontes/Anton-Regular.ttf');
    expect(relatorio).toMatch(/Fechada.*não/i);
    expect(relatorio).toMatch(/Sem Registro.*não/i);
    expect(relatorio).not.toContain('Não Usada');
  });

  it('o relatório prévio de um pacote já diz que fontes vão dentro; sem pacote, o campo não existe', async () => {
    const doc = await comFontes(quatroTextos);
    const previo = RelatorioDeExportacao.parse(await casos.relatorio(contaA, doc.id, { formato: 'svg', pacote: true }));
    expect(previo.pacote?.fontes.map((f) => [f.postScript, f.incluida])).toEqual([
      ['Aberta-Regular', true],
      ['Anton-Regular', true],
      ['Fechada-Regular', false],
      ['SemRegistro-Regular', false],
    ]);
    expect((await casos.relatorio(contaA, doc.id, { formato: 'svg' })).pacote).toBeUndefined();
  });

  it('pacote com falha em uma prancheta: sai com o que deu certo, em parte, e o progresso anda prancheta a prancheta', async () => {
    const doc = await comFontes(quatroTextos);
    motor.falharEm.add('p2');
    const pedida = await casos.pedir(contaA, doc.id, { formato: 'pdf', arquivos: 'por-prancheta', pacote: true });
    const andamento: number[] = [];
    const original = motor.pdf.bind(motor);
    motor.pdf = async (...a) => {
      andamento.push((await exportacoes.buscar(contaA, pedida.id))?.pranchetasProntas ?? -1);
      return original(...a);
    };
    await casos.executar(contaA, pedida.id);
    const e = await casos.consultar(contaA, pedida.id);
    expect(andamento).toEqual([0, 1]);
    expect(e).toMatchObject({ estado: 'pronta_em_parte', falhas: [{ pranchetaId: 'p2', codigo: 'falha_na_prancheta' }], progresso: { pranchetasProntas: 2, pranchetasNoTotal: 2 } });
    expect(Object.keys(await abrirZip(e.id)).filter((n) => n.endsWith('.pdf'))).toEqual(['Promoção - Feed.pdf']);
  });

  it('pacote em que nada saiu: falha, sem .zip', async () => {
    motor.falharEm.add('p1').add('p2');
    const { exportacao: e } = await pedirE({ formato: 'svg', pacote: true });
    expect(e).toMatchObject({ estado: 'falhou', arquivos: [] });
  });

  it('pacote de PNG: as imagens e o relatório do que falta, sem pasta de fontes (não há texto para editar)', async () => {
    const doc = await comFontes(quatroTextos);
    const { exportacao: e } = await pedirE({ formato: 'png', escala: 1, semFundo: false, pacote: true }, doc);
    expect(Object.keys(await abrirZip(e.id)).sort()).toEqual(['Promoção - Feed.png', 'Promoção - Story.png', 'Relatório de exportação.md'].sort());
  });
});

describe('limpeza dos arquivos vencidos', () => {
  async function prontaComLimpezaAgendada() {
    const { exportacao: e } = await pedirE({ formato: 'psd', arquivos: 'por-prancheta' });
    return e;
  }
  const chaves = (id: string) => [0, 1].map((i) => `contas/${contaA.contaId}/exportacoes/${id}/${i}.psd`);

  it('ao terminar com arquivo, agenda a limpeza para depois do vencimento, só com identificadores', async () => {
    const e = await prontaComLimpezaAgendada();
    expect(fila.agendados).toHaveLength(1);
    expect(fila.agendados[0]).toMatchObject({ fila: FILAS.limpezaDeExportacao, trabalho: { contaId: contaA.contaId, id: e.id } });
    expect(fila.agendados[0]?.naoAntesDe.getTime()).toBeGreaterThan(Date.parse(e.expiraEm as string));
  });

  it('exportação que falhou sem arquivo não agenda limpeza', async () => {
    motor.falharEm.add('p1').add('p2');
    await pedirE({ formato: 'psd', arquivos: 'por-prancheta' });
    expect(fila.agendados).toEqual([]);
  });

  it('vencida: apaga os objetos do armazenamento, marca a exportação e registra o uso; o registro fica', async () => {
    const e = await prontaComLimpezaAgendada();
    relogio = new Date(Date.parse(e.expiraEm as string) + 61_000);
    expect(await casos.limpar(contaA, e.id)).toBe('limpa');
    for (const chave of chaves(e.id)) expect(await armazenamento.existe(contaA, chave)).toBe(false);
    const depois = await exportacoes.buscar(contaA, e.id);
    expect(depois?.arquivosRemovidosEm?.toISOString()).toBe(relogio.toISOString());
    expect(depois?.arquivos).toHaveLength(2);
    expect(uso.eventos.at(-1)).toMatchObject({ evento: 'exportacao_limpa', exportacaoId: e.id, arquivos: 2, bytes: 12 });
    // entregue de novo: não faz nada
    expect(await casos.limpar(contaA, e.id)).toBe('ignorada');
    expect((await erroDe(casos.linkDoArquivo(contaA, e.id, 0))).codigo).toBe(CODIGOS_DE_ERRO.exportacaoExpirada);
  });

  it('trabalho de limpeza que chega antes do vencimento não apaga nada e lança, para ser entregue de novo', async () => {
    const e = await prontaComLimpezaAgendada();
    await expect(casos.limpar(contaA, e.id)).rejects.toThrow();
    for (const chave of chaves(e.id)) expect(await armazenamento.existe(contaA, chave)).toBe(true);
  });

  it('trabalho de limpeza com a conta trocada, ou de exportação que não existe, é ignorado: nada é apagado', async () => {
    const e = await prontaComLimpezaAgendada();
    relogio = new Date(Date.parse(e.expiraEm as string) + 61_000);
    expect(await casos.limpar(contaB, e.id)).toBe('ignorada');
    expect(await casos.limpar(contaA, randomUUID())).toBe('ignorada');
    for (const chave of chaves(e.id)) expect(await armazenamento.existe(contaA, chave)).toBe(true);
  });
});

describe('exportação parada', () => {
  it('na fila há mais tempo que o limite (o trabalho se perdeu): quem consulta recebe "falhou", e ela para de contar no limite da conta', async () => {
    const doc = await documento();
    for (let i = 0; i < EXPORTACOES_NA_FILA_POR_CONTA; i++) await casos.pedir(contaA, doc.id, { formato: 'png', escala: 1, semFundo: false });
    const esquecida = fila.publicados[0]?.trabalho.id as string;
    expect((await erroDe(casos.pedir(contaA, doc.id, { formato: 'png', escala: 1, semFundo: false }))).codigo).toBe(CODIGOS_DE_ERRO.limiteDeExportacoes);

    relogio = new Date(AGORA.getTime() + NA_FILA_NO_MAXIMO_MS + 1000);
    expect(await casos.consultar(contaA, esquecida)).toMatchObject({ estado: 'falhou', erro: { codigo: 'abandonada' } });
    expect((await casos.pedir(contaA, doc.id, { formato: 'png', escala: 1, semFundo: false })).estado).toBe('na_fila');
  });

  it('rodando sem sinal de vida (o worker morreu): quem consulta recebe "falhou" depois do limite, não "rodando" para sempre', async () => {
    const doc = await documento();
    const pedida = await casos.pedir(contaA, doc.id, { formato: 'psd', arquivos: 'juntas' });
    await exportacoes.iniciar(contaA, pedida.id, AGORA, new Date(0));
    relogio = new Date(AGORA.getTime() + SEM_SINAL_DEPOIS_DE_MS - 1000);
    expect((await casos.consultar(contaA, pedida.id)).estado).toBe('rodando');
    relogio = new Date(AGORA.getTime() + SEM_SINAL_DEPOIS_DE_MS + 1000);
    expect(await casos.consultar(contaA, pedida.id)).toMatchObject({ estado: 'falhou', erro: { codigo: 'interrompida' } });
  });
});

describe('lista das exportações de uma peça (para retomar depois de recarregar a página)', () => {
  it('traz as em curso e as recentes, da mais nova para a mais velha, sem o relatório e sem as de outra peça', async () => {
    const [doc, outro] = [await documento(), await documento()];
    const pronta = (await pedirE({ formato: 'psd', arquivos: 'por-prancheta' }, doc)).exportacao;
    relogio = new Date(AGORA.getTime() + 60_000);
    const naFila = await casos.pedir(contaA, doc.id, { formato: 'svg', pacote: true });
    await casos.pedir(contaA, outro.id, { formato: 'png', escala: 1, semFundo: false });

    const lista = await casos.listar(contaA, doc.id);
    expect(lista.itens.map((e) => [e.id, e.estado, e.formato, e.pacote ?? false])).toEqual([
      [naFila.id, 'na_fila', 'svg', true],
      [pronta.id, 'pronta', 'psd', false],
    ]);
    expect(lista.itens[1]?.arquivos).toHaveLength(2);
    expect(lista.itens.every((e) => e.relatorio === undefined)).toBe(true);
  });

  it('não traz o que foi criado há mais que o tempo de retenção, e respeita o limite', async () => {
    const doc = await documento();
    await pedirE({ formato: 'png', escala: 1, semFundo: false }, doc);
    relogio = new Date(AGORA.getTime() + (DIAS_DE_RETENCAO_DA_EXPORTACAO + 1) * UM_DIA);
    expect((await casos.listar(contaA, doc.id)).itens).toEqual([]);
    for (let i = 0; i < EXPORTACOES_NA_LISTA + 3; i++) await pedirE({ formato: 'png', escala: 1, semFundo: false }, doc);
    expect((await casos.listar(contaA, doc.id)).itens).toHaveLength(EXPORTACOES_NA_LISTA);
  });

  it('peça de outra conta, ou que não existe, é "não encontrado" (não uma lista vazia)', async () => {
    const deB = await documento(contaB);
    expect((await erroDe(casos.listar(contaA, deB.id))).codigo).toBe(CODIGOS_DE_ERRO.naoEncontrado);
    expect((await erroDe(casos.listar(contaA, randomUUID()))).codigo).toBe(CODIGOS_DE_ERRO.naoEncontrado);
  });

  it('a lista também dá baixa no que parou: a exportação esquecida aparece como "falhou"', async () => {
    const doc = await documento();
    const pedida = await casos.pedir(contaA, doc.id, { formato: 'psd', arquivos: 'juntas' });
    relogio = new Date(AGORA.getTime() + NA_FILA_NO_MAXIMO_MS + 1000);
    expect((await casos.listar(contaA, doc.id)).itens.map((e) => [e.id, e.estado])).toEqual([[pedida.id, 'falhou']]);
  });
});

describe('uso: baixar', () => {
  it('pedir o link de download registra exportacao_baixada, com formato e se é pacote, sem nome de arquivo', async () => {
    const { exportacao: e } = await pedirE({ formato: 'pdf', arquivos: 'juntas', pacote: true });
    await casos.linkDoArquivo(contaA, e.id, 0);
    expect(uso.eventos.at(-1)).toEqual({ evento: 'exportacao_baixada', exportacaoId: e.id, documentoId: e.documentoId, formato: 'pdf', pacote: true });
  });
});

// ---------------------------------------------------------------------------------------------
// Mais de um worker: limite atômico, justiça entre contas, retomada, sinal de vida, teto de tamanho.
// ---------------------------------------------------------------------------------------------

describe('mais de um worker', () => {
  it('o limite de exportações esperando é atômico: de doze pedidos ao mesmo tempo, entram cinco e sete recebem 429', async () => {
    const doc = await documento();
    const resultados = await Promise.allSettled(Array.from({ length: 12 }, () => casos.pedir(contaA, doc.id, { formato: 'png', escala: 1, semFundo: false })));
    expect(resultados.filter((r) => r.status === 'fulfilled')).toHaveLength(EXPORTACOES_NA_FILA_POR_CONTA);
    const recusas = resultados.flatMap((r) => (r.status === 'rejected' ? [(r.reason as ErroDaAplicacao).codigo] : []));
    expect(recusas).toEqual(Array(7).fill(CODIGOS_DE_ERRO.limiteDeExportacoes));
    expect(fila.publicados).toHaveLength(EXPORTACOES_NA_FILA_POR_CONTA);
  });

  it('justiça entre contas: cada pedido vai para a fila sabendo quantos a conta já tem na frente', async () => {
    const [docA, docB] = [await documento(contaA), await documento(contaB)];
    const deA = [];
    for (let i = 0; i < 3; i++) deA.push(await casos.pedir(contaA, docA.id, { formato: 'png', escala: 1, semFundo: false }));
    const deB = await casos.pedir(contaB, docB.id, { formato: 'png', escala: 1, semFundo: false });
    expect(deA.map((e) => fila.posicoes.get(e.id))).toEqual([0, 1, 2]);
    // a única exportação de B entra na frente da segunda e da terceira de A
    expect(fila.posicoes.get(deB.id)).toBe(0);
  });

  it('retomada: a exportação que estava rodando num worker que morreu, reentregue pela fila, é refeita do zero por outro worker', async () => {
    const doc = await documento();
    const pedida = await casos.pedir(contaA, doc.id, { formato: 'psd', arquivos: 'por-prancheta' });
    // o primeiro worker começou, guardou a primeira prancheta e morreu
    await exportacoes.iniciar(contaA, pedida.id, AGORA, new Date(0));
    await exportacoes.registrarArquivo(
      contaA,
      pedida.id,
      { indice: 0, nome: 'Promoção - Feed.psd', tipoMime: 'image/vnd.adobe.photoshop', bytes: 6, pranchetaId: 'p1', chaveDoObjeto: `contas/${contaA.contaId}/exportacoes/${pedida.id}/0.psd` },
      1,
      AGORA,
    );

    // a fila reentrega antes de dar o tempo de retomada: o dono pode estar vivo, ninguém mexe
    relogio = new Date(AGORA.getTime() + RETOMAR_SEM_SINAL_DEPOIS_DE_MS - 1000);
    expect(await casos.executar(contaA, pedida.id)).toBe('ignorada');
    expect(motor.chamadas).toEqual([]);

    relogio = new Date(AGORA.getTime() + RETOMAR_SEM_SINAL_DEPOIS_DE_MS + 1000);
    expect(await casos.executar(contaA, pedida.id)).toBe('feita');
    const e = Exportacao.parse(await casos.consultar(contaA, pedida.id));
    expect(e).toMatchObject({ estado: 'pronta', progresso: { pranchetasProntas: 2, pranchetasNoTotal: 2 } });
    expect(e.arquivos.map((a) => [a.indice, a.nome])).toEqual([
      [0, 'Promoção - Feed.psd'],
      [1, 'Promoção - Story.psd'],
    ]);
    expect(uso.eventos.at(-1)).toMatchObject({ evento: 'exportacao_terminada', resultado: 'pronta', tentativa: 2 });
  });

  it('a exportação que derruba o worker duas vezes não é tentada uma terceira: fecha como interrompida', async () => {
    const doc = await documento();
    const pedida = await casos.pedir(contaA, doc.id, { formato: 'psd', arquivos: 'juntas' });
    await exportacoes.iniciar(contaA, pedida.id, AGORA, new Date(0));
    // segunda tentativa: o motor "morre" (a promessa nunca volta ao caso de uso, como num processo morto)
    await exportacoes.iniciar(contaA, pedida.id, new Date(AGORA.getTime() + 60_000), new Date(0), { semSinalDesde: new Date(AGORA.getTime() + 30_000), maximoDeTentativas: 2 });
    relogio = new Date(AGORA.getTime() + 120_000 + RETOMAR_SEM_SINAL_DEPOIS_DE_MS);
    expect(await casos.executar(contaA, pedida.id)).toBe('ignorada');
    expect(await casos.consultar(contaA, pedida.id)).toMatchObject({ estado: 'falhou', erro: { codigo: 'interrompida' } });
    expect(motor.chamadas).toEqual([]);
  });

  it('enquanto roda, grava o sinal de vida por relógio, sem depender do motor ceder a vez', async () => {
    montar(undefined, { intervaloDoSinalDeVidaMs: 10 });
    const doc = await documento();
    const pedida = await casos.pedir(contaA, doc.id, { formato: 'psd', arquivos: 'juntas' });
    let batidas = 0;
    const original = exportacoes.bater.bind(exportacoes);
    exportacoes.bater = async (...a) => {
      batidas++;
      return original(...a);
    };
    // um motor que demora e nunca chama entreEtapas, como o render de uma prancheta pesada na thread
    motor.psd = async (_doc, _recursos, opcoes) => {
      await new Promise((ok) => setTimeout(ok, 80));
      return [{ nome: `${opcoes.nome}.psd`, bytes: new Uint8Array(3) }];
    };
    await casos.executar(contaA, pedida.id);
    expect(batidas).toBeGreaterThanOrEqual(3);
    // e o relógio para quando a exportação termina
    const depois = batidas;
    await new Promise((ok) => setTimeout(ok, 40));
    expect(batidas).toBe(depois);
  });
});

describe('o pedido original', () => {
  it('a exportação devolve o pedido, com as pranchetas resolvidas na ordem do documento, e ele vale como corpo de um novo pedido', async () => {
    const doc = await documento();
    const todas = await casos.pedir(contaA, doc.id, { formato: 'pdf', arquivos: 'por-prancheta', pacote: true });
    expect(todas.pedido).toEqual({ formato: 'pdf', arquivos: 'por-prancheta', pranchetas: ['p1', 'p2'], pacote: true });
    relogio = new Date(AGORA.getTime() + 1000);
    const uma = await casos.pedir(contaA, doc.id, { formato: 'png', escala: 2, semFundo: true, pranchetas: ['p2'] });
    expect(uma.pedido).toEqual({ formato: 'png', escala: 2, semFundo: true, pranchetas: ['p2'] });
    expect(PedidoDeExportacao.parse(uma.pedido)).toEqual(uma.pedido);
    // e vem também na lista: é o que deixa a tela retomada mostrar o andamento por prancheta
    expect((await casos.listar(contaA, doc.id)).itens.map((e) => e.pedido?.formato)).toEqual(['png', 'pdf']);
  });

  it('"tentar só as que falharam": o pedido original com as pranchetas das falhas', async () => {
    const doc = await documento();
    motor.falharEm.add('p2');
    const pedida = await casos.pedir(contaA, doc.id, { formato: 'psd', arquivos: 'por-prancheta' });
    await casos.executar(contaA, pedida.id);
    const e = await casos.consultar(contaA, pedida.id);
    motor.falharEm.clear();
    const deNovo = await casos.pedir(contaA, doc.id, PedidoDeExportacao.parse({ ...e.pedido, pranchetas: e.falhas.map((f) => f.pranchetaId) }));
    await casos.executar(contaA, deNovo.id);
    expect((await casos.consultar(contaA, deNovo.id)).arquivos.map((a) => a.nome)).toEqual(['Promoção - Story.psd']);
  });
});

describe('teto de tamanho', () => {
  const comPrancheta = (largura: number, altura: number) => {
    const r = aplicarLote(
      documentoVazio(),
      [
        { op: 'criarPrancheta', nome: 'Painel', largura, altura, fundo: '#ffffff' },
        { op: 'criarPrancheta', nome: 'Feed', largura: 1080, altura: 1350, fundo: '#ffffff' },
      ],
      {
        autoria: { tipo: 'designer' },
        idDoLote: randomUUID(),
        gerarId: (indice) => `p${indice + 1}`,
      },
    );
    if (!r.ok) throw new Error(r.erro.mensagem);
    return documento(contaA, r.doc);
  };

  it('prancheta que passa do teto de megapixels na escala de saída é recusada ao pedir, com código próprio, e nada vai para a fila', async () => {
    const doc = await comPrancheta(9000, 9000); // 81 MP
    const erro = await erroDe(casos.pedir(contaA, doc.id, { formato: 'psd', arquivos: 'por-prancheta' }));
    expect(erro).toMatchObject({ codigo: CODIGOS_DE_ERRO.exportacaoGrandeDemais, detalhe: { pranchetaId: 'p1', megapixels: 81, limite: MEGAPIXELS_POR_PRANCHETA_NA_EXPORTACAO } });
    expect(fila.publicados).toEqual([]);
    expect(await exportacoes.contarEmAndamento(contaA)).toBe(0);
    // só a prancheta que cabe: passa
    expect((await casos.pedir(contaA, doc.id, { formato: 'psd', arquivos: 'por-prancheta', pranchetas: ['p2'] })).estado).toBe('na_fila');
  });

  it('a escala conta: 5000 × 5000 passa em PNG 1x e em PSD e é recusada em PNG 2x; em SVG e PDF passa, com as camadas que viram imagem em 1x em vez de 2x', async () => {
    const doc = await comPrancheta(5000, 5000); // 25 MP em 1x, 100 MP em 2x
    const pedidos = {
      png1: { formato: 'png', escala: 1, semFundo: false },
      psd: { formato: 'psd', arquivos: 'por-prancheta' },
      png2: { formato: 'png', escala: 2, semFundo: false },
      svg: { formato: 'svg' },
      pdf: { formato: 'pdf', arquivos: 'juntas' },
    } as const;
    const resultado: Record<string, string> = {};
    for (const [nome, pedido] of Object.entries(pedidos)) {
      resultado[nome] = await casos.pedir(contaA, doc.id, { ...pedido, pranchetas: ['p1'] }).then(
        async (e) => {
          await casos.executar(contaA, e.id);
          return 'aceita';
        },
        (e: ErroDaAplicacao) => e.codigo,
      );
    }
    expect(resultado).toEqual({ png1: 'aceita', psd: 'aceita', png2: 'exportacao_grande_demais', svg: 'aceita', pdf: 'aceita' });
    expect(motor.chamadas.filter((c) => c.formato === 'svg' || c.formato === 'pdf').map((c) => (c.opcoes as { escalaDaImagem?: number }).escalaDaImagem)).toEqual([1, 1]);
    // a prancheta comum (1080 × 1350) continua saindo em 2x
    const comum = await casos.pedir(contaA, doc.id, { formato: 'svg', pranchetas: ['p2'] });
    await casos.executar(contaA, comum.id);
    expect(motor.chamadas.at(-1)?.opcoes).toMatchObject({ escalaDaImagem: 2 });
  });

  it('o relatório do SVG e do PDF avisa quando as camadas que viram imagem saem em 1x, antes de exportar e depois', async () => {
    const r = aplicarLote(
      documentoVazio(),
      [
        { op: 'criarPrancheta', nome: 'Painel', largura: 5000, altura: 5000, fundo: '#ffffff' },
        { op: 'criarPrancheta', nome: 'Feed', largura: 1080, altura: 1350, fundo: '#ffffff' },
        // no SVG, camada com modo de mesclagem vira imagem
        {
          op: 'criarNo',
          prancheta: 'Painel',
          no: { tipo: 'forma', nome: 'Selo', forma: 'retangulo', x: 0, y: 0, largura: 100, altura: 100, preenchimento: '#ff0000', modoDeMesclagem: 'multiplicacao' },
        },
        {
          op: 'criarNo',
          prancheta: 'Feed',
          no: { tipo: 'forma', nome: 'Selo', forma: 'retangulo', x: 0, y: 0, largura: 100, altura: 100, preenchimento: '#ff0000', modoDeMesclagem: 'multiplicacao' },
        },
      ],
      { autoria: { tipo: 'designer' }, idDoLote: randomUUID(), gerarId: (indice) => `p${indice + 1}` },
    );
    if (!r.ok) throw new Error(r.erro.mensagem);
    const doc = await documento(contaA, r.doc);
    const avisos = async (pranchetas: string[]) => (await casos.relatorio(contaA, doc.id, { formato: 'svg', pranchetas })).avisos.map((a) => a.codigo);
    expect(await avisos(['p1'])).toContain('imagem-em-resolucao-menor');
    expect(await avisos(['p2'])).not.toContain('imagem-em-resolucao-menor');
    const pedida = await casos.pedir(contaA, doc.id, { formato: 'svg', pranchetas: ['p1'] });
    await casos.executar(contaA, pedida.id);
    expect((await casos.consultar(contaA, pedida.id)).relatorio?.avisos.map((a) => a.codigo)).toContain('imagem-em-resolucao-menor');
  });

  it('SVG e PDF de prancheta que não cabe nem em 1x são recusados', async () => {
    const doc = await comPrancheta(7000, 7000); // 49 MP
    for (const pedido of [{ formato: 'svg' }, { formato: 'pdf', arquivos: 'juntas' }] as const) {
      expect((await erroDe(casos.pedir(contaA, doc.id, { ...pedido, pranchetas: ['p1'] }))).codigo).toBe(CODIGOS_DE_ERRO.exportacaoGrandeDemais);
    }
  });

  it('o relatório prévio não é recusado pelo tamanho: ele não renderiza', async () => {
    const doc = await comPrancheta(9000, 9000);
    expect((await casos.relatorio(contaA, doc.id, { formato: 'psd', arquivos: 'por-prancheta' })).camadas).toBeDefined();
  });

  it('pacote cujos arquivos, somados, passam do teto de bytes: a exportação falha com código próprio ANTES de montar o .zip, sem guardar nada', async () => {
    montar(undefined, { bytesNoMaximoPorPacote: 10 });
    const doc = await documento();
    const pedida = await casos.pedir(contaA, doc.id, { formato: 'psd', arquivos: 'por-prancheta', pacote: true });
    await casos.executar(contaA, pedida.id);
    expect(await casos.consultar(contaA, pedida.id)).toMatchObject({ estado: 'falhou', erro: { codigo: 'pacote_grande_demais' }, arquivos: [] });
    expect(await armazenamento.existe(contaA, `contas/${contaA.contaId}/exportacoes/${pedida.id}/0.zip`)).toBe(false);
  });
});
