// Regras da exportação, sem NestJS, sem banco, sem fila e sem motor de verdade.
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { aplicarLote, type Documento, documentoVazio } from '@otto/documento';
import type { RecursosDaExportacao } from '@otto/psd';
import { CODIGOS_DE_ERRO, DIAS_DE_RETENCAO_DA_EXPORTACAO, EXPORTACOES_NA_FILA_POR_CONTA, Exportacao, lerContaId, RelatorioDeExportacao } from '@otto/shared';
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
import { CasosDeUsoDeExportacao, ContaOcupada } from './casos-de-uso-de-exportacao';
import { type ArquivoGerado, type EntreEtapas, MotorDeExportacao } from './motor-de-exportacao';

const contaA = EscopoDaConta.abrir(lerContaId('01990000-0000-7000-8000-00000000000a'));
const contaB = EscopoDaConta.abrir(lerContaId('01990000-0000-7000-8000-00000000000b'));
const PNG = readFileSync(path.resolve(import.meta.dirname, '../../../../../packages/render/recursos-de-teste/imagens/recorte-com-alfa.png'));
const AGORA = new Date('2026-10-01T12:00:00.000Z');

class MotorFalso extends MotorDeExportacao {
  chamadas: { formato: string; nome: string; pranchetas: readonly string[]; opcoes: object; recursos: RecursosDaExportacao; doc: Documento }[] = [];
  falharEm = new Set<string>();

  private gerar(formato: 'psd' | 'png', doc: Documento, recursos: RecursosDaExportacao, opcoes: { nome: string; pranchetas: readonly string[] }, entreEtapas: EntreEtapas): Promise<ArquivoGerado[]> {
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

function montar(barramento: BarramentoEmMemoria = new BarramentoEmMemoria()) {
  fila = barramento;
  casos = new CasosDeUsoDeExportacao({ documentos, exportacoes, arquivos: repositorioDeArquivos, armazenamento, fontes, fila, motor, gerarId: randomUUID, agora: () => relogio, uso });
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
    expect(e.arquivos[0]).toMatchObject({ nome: 'Promoção.png', tipo: 'image/png' });
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

  it('uma por vez por conta: com outra rodando, lança ContaOcupada e a exportação continua na fila', async () => {
    const doc = await documento();
    const [um, dois] = [await casos.pedir(contaA, doc.id, { formato: 'psd', arquivos: 'juntas' }), await casos.pedir(contaA, doc.id, { formato: 'psd', arquivos: 'juntas' })];
    await exportacoes.iniciar(contaA, um.id, AGORA, new Date(0));
    await expect(casos.executar(contaA, dois.id)).rejects.toBeInstanceOf(ContaOcupada);
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
