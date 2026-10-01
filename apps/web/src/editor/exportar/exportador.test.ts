// A exportação em andamento, fora do React: pedir, consultar até terminar, guardar os arquivos.
import type { Exportacao } from '@otto/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import type { ApiDeExportacoes, ResultadoDaExportacao } from '../../api/exportacoes';
import { criarExportador, type Exportador, expirou, progressoPorPrancheta } from './exportador';

const ID = '0199a000-0000-7000-8000-0000000000e1';
const base: Exportacao = {
  id: ID,
  documentoId: '0199a000-0000-7000-8000-000000000001',
  versao: 3,
  formato: 'psd',
  estado: 'na_fila',
  progresso: { pranchetasProntas: 0, pranchetasNoTotal: 2 },
  arquivos: [],
  falhas: [],
  criadaEm: '2026-10-01T12:00:00.000Z',
};
const arquivo = (indice: number, pranchetaId?: string) => ({
  indice,
  nome: `Peça - ${pranchetaId ?? 'todas'}.psd`,
  tipo: 'image/vnd.adobe.photoshop',
  bytes: 1000,
  ...(pranchetaId ? { pranchetaId } : {}),
  baixar: `/api/exportacoes/${ID}/arquivos/${indice}`,
});
const ok = (e: Partial<Exportacao>): ResultadoDaExportacao => ({ ok: true, exportacao: { ...base, ...e } });
const PSD = { formato: 'psd', arquivos: 'por-prancheta' } as const;

let pedidos: unknown[];
let respostasDePedir: ResultadoDaExportacao[];
let respostasDeConsultar: ResultadoDaExportacao[];
let esperas: (() => void)[];
let exportador: Exportador;

/** Deixa as promessas pendentes andarem. */
const assentar = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};
/** Passa o intervalo de consulta: a próxima consulta acontece. */
const passarIntervalo = async () => {
  esperas.shift()?.();
  await assentar();
};

beforeEach(() => {
  pedidos = [];
  respostasDePedir = [];
  respostasDeConsultar = [];
  esperas = [];
  const api: Pick<ApiDeExportacoes, 'pedir' | 'consultar'> = {
    pedir: async (pedido) => {
      pedidos.push(pedido);
      return respostasDePedir.shift() ?? ok({});
    },
    consultar: async () => respostasDeConsultar.shift() ?? ok({ estado: 'rodando' }),
  };
  exportador = criarExportador({ api, esperar: () => new Promise<void>((seguir) => esperas.push(seguir)) });
});

describe('exportar', () => {
  it('começa parado; pedir põe na fila e consulta até ficar pronta', async () => {
    expect(exportador.armazem.obter()).toEqual({ fase: 'parado' });

    exportador.exportar(PSD);
    expect(exportador.armazem.obter()).toMatchObject({ fase: 'pedindo', pedido: PSD });
    await assentar();
    expect(exportador.armazem.obter()).toMatchObject({ fase: 'andando', exportacao: { estado: 'na_fila' } });
    expect(pedidos).toEqual([PSD]);

    respostasDeConsultar.push(ok({ estado: 'rodando', progresso: { pranchetasProntas: 1, pranchetasNoTotal: 2 }, arquivos: [arquivo(0, 'p1')] }));
    await passarIntervalo();
    expect(exportador.armazem.obter()).toMatchObject({ fase: 'andando', exportacao: { progresso: { pranchetasProntas: 1 } } });

    respostasDeConsultar.push(ok({ estado: 'pronta', progresso: { pranchetasProntas: 2, pranchetasNoTotal: 2 }, arquivos: [arquivo(0, 'p1'), arquivo(1, 'p2')] }));
    await passarIntervalo();
    const fim = exportador.armazem.obter();
    expect(fim).toMatchObject({ fase: 'terminou', exportacao: { estado: 'pronta' } });
    expect(fim.fase === 'terminou' && fim.arquivos.map((a) => a.baixar)).toEqual([`/api/exportacoes/${ID}/arquivos/0`, `/api/exportacoes/${ID}/arquivos/1`]);
    // terminou: ninguém consulta mais
    expect(esperas).toHaveLength(0);
  });

  it('pedido recusado vira falha com o código da API', async () => {
    respostasDePedir.push({ ok: false, codigo: 'limite_de_exportacoes', passageiro: false });
    exportador.exportar(PSD);
    await assentar();
    expect(exportador.armazem.obter()).toMatchObject({ fase: 'falhou', codigo: 'limite_de_exportacoes', pedido: PSD });
  });

  it('exportação que falhou no servidor vira falha com o código dela', async () => {
    exportador.exportar(PSD);
    await assentar();
    respostasDeConsultar.push(ok({ estado: 'falhou', erro: { codigo: 'erro_interno' } }));
    await passarIntervalo();
    expect(exportador.armazem.obter()).toMatchObject({ fase: 'falhou', codigo: 'erro_interno' });
  });

  it('consulta que não respondeu é tentada de novo; depois de muitas seguidas, desiste dizendo que é a conexão', async () => {
    exportador.exportar(PSD);
    await assentar();
    respostasDeConsultar.push({ ok: false, codigo: 'sem_conexao', passageiro: true });
    await passarIntervalo();
    expect(exportador.armazem.obter().fase).toBe('andando');

    respostasDeConsultar.push(ok({ estado: 'rodando' }));
    await passarIntervalo();
    // uma resposta boa zera a conta
    for (let i = 0; i < 19; i++) {
      respostasDeConsultar.push({ ok: false, codigo: 'sem_conexao', passageiro: true });
      await passarIntervalo();
    }
    expect(exportador.armazem.obter().fase).toBe('andando');
    respostasDeConsultar.push({ ok: false, codigo: 'sem_conexao', passageiro: true });
    await passarIntervalo();
    expect(exportador.armazem.obter()).toMatchObject({ fase: 'falhou', codigo: 'sem_conexao' });
  });

  it('consulta recusada de vez (a exportação sumiu) é falha na hora', async () => {
    exportador.exportar(PSD);
    await assentar();
    respostasDeConsultar.push({ ok: false, codigo: 'nao_encontrado', passageiro: false });
    await passarIntervalo();
    expect(exportador.armazem.obter()).toMatchObject({ fase: 'falhou', codigo: 'nao_encontrado' });
  });
});

describe('tentar de novo', () => {
  it('se a exportação já estava na fila, volta a consultar a MESMA: não pede outra', async () => {
    exportador.exportar(PSD);
    await assentar();
    for (let i = 0; i < 20; i++) {
      respostasDeConsultar.push({ ok: false, codigo: 'sem_conexao', passageiro: true });
      await passarIntervalo();
    }
    expect(exportador.armazem.obter().fase).toBe('falhou');

    respostasDeConsultar.push(ok({ estado: 'pronta', arquivos: [arquivo(0, 'p1')] }));
    exportador.tentarDeNovo();
    await assentar();
    expect(pedidos).toHaveLength(1);
    expect(exportador.armazem.obter()).toMatchObject({ fase: 'terminou', exportacao: { estado: 'pronta' } });
  });

  it('se o pedido nem entrou na fila, pede de novo', async () => {
    respostasDePedir.push({ ok: false, codigo: 'fila_indisponivel', passageiro: true });
    exportador.exportar(PSD);
    await assentar();
    exportador.tentarDeNovo();
    await assentar();
    expect(pedidos).toEqual([PSD, PSD]);
    expect(exportador.armazem.obter().fase).toBe('andando');
  });

  it('se a exportação falhou no servidor, pede outra', async () => {
    exportador.exportar(PSD);
    await assentar();
    respostasDeConsultar.push(ok({ estado: 'falhou', erro: { codigo: 'erro_interno' } }));
    await passarIntervalo();
    exportador.tentarDeNovo();
    await assentar();
    expect(pedidos).toHaveLength(2);
  });
});

describe('resultado em parte', () => {
  const emParte = ok({ estado: 'pronta_em_parte', progresso: { pranchetasProntas: 2, pranchetasNoTotal: 2 }, arquivos: [arquivo(0, 'p1')], falhas: [{ pranchetaId: 'p2', codigo: 'erro_interno' }] });

  it('guarda o que saiu e o que falhou', async () => {
    exportador.exportar(PSD);
    await assentar();
    respostasDeConsultar.push(emParte);
    await passarIntervalo();
    const e = exportador.armazem.obter();
    expect(e).toMatchObject({ fase: 'terminou', exportacao: { estado: 'pronta_em_parte', falhas: [{ pranchetaId: 'p2' }] } });
    expect(e.fase === 'terminou' && e.arquivos).toHaveLength(1);
  });

  it('tentar as que falharam pede SÓ elas, e os arquivos que já saíram continuam para baixar', async () => {
    exportador.exportar(PSD);
    await assentar();
    respostasDeConsultar.push(emParte);
    await passarIntervalo();

    const OUTRA = '0199a000-0000-7000-8000-0000000000e2';
    respostasDePedir.push(ok({ id: OUTRA, progresso: { pranchetasProntas: 0, pranchetasNoTotal: 1 } }));
    exportador.tentarAsQueFalharam();
    await assentar();
    expect(pedidos[1]).toEqual({ ...PSD, pranchetas: ['p2'] });
    const andando = exportador.armazem.obter();
    expect(andando.fase === 'andando' && andando.arquivos.map((a) => a.pranchetaId)).toEqual(['p1']);

    respostasDeConsultar.push(
      ok({ id: OUTRA, estado: 'pronta', progresso: { pranchetasProntas: 1, pranchetasNoTotal: 1 }, arquivos: [{ ...arquivo(0, 'p2'), baixar: `/api/exportacoes/${OUTRA}/arquivos/0` }] }),
    );
    await passarIntervalo();
    const fim = exportador.armazem.obter();
    expect(fim.fase === 'terminou' && fim.arquivos.map((a) => a.pranchetaId)).toEqual(['p1', 'p2']);
  });
});

describe('recomeçar', () => {
  it('limpar volta ao começo e a consulta antiga não escreve mais nada', async () => {
    exportador.exportar(PSD);
    await assentar();
    exportador.limpar();
    respostasDeConsultar.push(ok({ estado: 'pronta' }));
    await passarIntervalo();
    expect(exportador.armazem.obter()).toEqual({ fase: 'parado' });
  });

  it('exportar de novo começa do zero, sem os arquivos da anterior', async () => {
    exportador.exportar(PSD);
    await assentar();
    respostasDeConsultar.push(ok({ estado: 'pronta', arquivos: [arquivo(0, 'p1')] }));
    await passarIntervalo();
    exportador.exportar({ formato: 'png', escala: 2, semFundo: false });
    await assentar();
    const e = exportador.armazem.obter();
    expect(e.fase === 'andando' && e.arquivos).toEqual([]);
  });
});

describe('progresso por prancheta', () => {
  const pranchetas = [
    { id: 'p1', nome: 'Feed' },
    { id: 'p2', nome: 'Story' },
    { id: 'p3', nome: 'Banner' },
  ];

  it('na fila, todas esperam; rodando, a primeira que falta está em andamento', () => {
    expect(progressoPorPrancheta({ ...base, progresso: { pranchetasProntas: 0, pranchetasNoTotal: 3 } }, pranchetas).map((p) => p.estado)).toEqual(['na-fila', 'na-fila', 'na-fila']);
    const rodando: Exportacao = { ...base, estado: 'rodando', progresso: { pranchetasProntas: 1, pranchetasNoTotal: 3 }, arquivos: [arquivo(0, 'p1')] };
    expect(progressoPorPrancheta(rodando, pranchetas)).toEqual([
      { id: 'p1', nome: 'Feed', estado: 'pronta' },
      { id: 'p2', nome: 'Story', estado: 'andando' },
      { id: 'p3', nome: 'Banner', estado: 'na-fila' },
    ]);
  });

  it('a que falhou aparece como falha, e não segura a seguinte', () => {
    const e: Exportacao = {
      ...base,
      estado: 'rodando',
      progresso: { pranchetasProntas: 2, pranchetasNoTotal: 3 },
      arquivos: [arquivo(0, 'p1')],
      falhas: [{ pranchetaId: 'p2', codigo: 'erro_interno' }],
    };
    expect(progressoPorPrancheta(e, pranchetas).map((p) => p.estado)).toEqual(['pronta', 'falhou', 'andando']);
  });

  it('no arquivo com todas juntas, o progresso vem só da contagem', () => {
    const e: Exportacao = { ...base, estado: 'rodando', progresso: { pranchetasProntas: 2, pranchetasNoTotal: 3 } };
    expect(progressoPorPrancheta(e, pranchetas).map((p) => p.estado)).toEqual(['pronta', 'pronta', 'andando']);
  });
});

describe('arquivos apagados', () => {
  it('depois de expiraEm a exportação venceu; antes, ou sem data, não', () => {
    const e: Exportacao = { ...base, estado: 'pronta', expiraEm: '2026-10-08T12:00:00.000Z' };
    expect(expirou(e, Date.parse('2026-10-08T11:59:00.000Z'))).toBe(false);
    expect(expirou(e, Date.parse('2026-10-08T12:00:01.000Z'))).toBe(true);
    expect(expirou(base, Date.parse('2030-01-01T00:00:00.000Z'))).toBe(false);
  });
});
