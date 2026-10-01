// A exportação em andamento, fora do React (docs/mvp/experiencia.md, seção 3.10). Mora no editor, não
// no diálogo: fechar o diálogo não interrompe nada, e o topo avisa quando o arquivo fica pronto.
//
// Pedir → consultar a cada intervalo enquanto estiver na fila ou rodando → terminar. O que se guarda
// de cada arquivo é o endereço `baixar`, que gera um link novo a cada clique: o designer não vê link
// vencido. O que vence é a exportação inteira, em 7 dias (`expirou`).
import { type ArquivoDaExportacao, ESTADOS_FINAIS_DA_EXPORTACAO, type Exportacao, type PedidoDeExportacao } from '@otto/shared';
import type { ApiDeExportacoes } from '../../api/exportacoes';
import { type Armazem, criarArmazem } from '../nucleo/armazem';

export type EstadoDoExportador =
  | { fase: 'parado' }
  /** O pedido saiu e a API ainda não respondeu. */
  | { fase: 'pedindo'; pedido: PedidoDeExportacao; arquivos: readonly ArquivoDaExportacao[] }
  /**
   * `pedido` indefinido nas três fases abaixo: a exportação foi RETOMADA depois de recarregar a página.
   * Sabe-se o que a API diz dela, não o pedido original: dá para acompanhar e baixar, não para repetir.
   */
  /** Na fila ou rodando. `arquivos` junta os desta exportação com os de tentativas anteriores. */
  | { fase: 'andando'; pedido: PedidoDeExportacao | undefined; exportacao: Exportacao; arquivos: readonly ArquivoDaExportacao[] }
  /** Pronta, ou pronta em parte (ver `exportacao.falhas`). */
  | { fase: 'terminou'; pedido: PedidoDeExportacao | undefined; exportacao: Exportacao; arquivos: readonly ArquivoDaExportacao[] }
  /** `retomar`: a exportação entrou na fila e foi a consulta que não respondeu. Tentar de novo volta a consultar essa mesma. */
  | { fase: 'falhou'; pedido: PedidoDeExportacao | undefined; codigo: string; arquivos: readonly ArquivoDaExportacao[]; retomar?: Exportacao };

export interface Exportador {
  armazem: Pick<Armazem<EstadoDoExportador>, 'obter' | 'assinar'>;
  /** Começa uma exportação do zero. */
  exportar(pedido: PedidoDeExportacao): void;
  /** Volta a acompanhar uma exportação que já estava em curso (a página foi recarregada). Não pede nada. */
  retomar(exportacao: Exportacao): void;
  /** Depois de uma falha: retoma a consulta se a exportação já estava na fila; senão, pede de novo. */
  tentarDeNovo(): void;
  /** Depois de um resultado em parte: pede só as pranchetas que falharam e mantém os arquivos que saíram. */
  tentarAsQueFalharam(): void;
  /** Volta ao começo. Uma consulta em andamento deixa de valer. */
  limpar(): void;
}

export interface DependenciasDoExportador {
  api: Pick<ApiDeExportacoes, 'pedir' | 'consultar'>;
  /** Padrão: setTimeout. */
  esperar?(ms: number): Promise<void>;
}

/** O contrato pede consulta a cada 1 a 2 segundos. */
const INTERVALO_DA_CONSULTA = 1500;
/** Consultas seguidas sem resposta antes de desistir: cerca de meio minuto. */
const CONSULTAS_SEM_RESPOSTA = 20;
const SEM_ARQUIVOS: readonly ArquivoDaExportacao[] = [];
/** Código do editor: a exportação terminou como `falhou` e a API não disse por quê. */
export const EXPORTACAO_FALHOU = 'exportacao_falhou';

export function criarExportador(deps: DependenciasDoExportador): Exportador {
  const esperar = deps.esperar ?? ((ms: number) => new Promise<void>((seguir) => setTimeout(seguir, ms)));
  const armazem = criarArmazem<EstadoDoExportador>({ fase: 'parado' });
  /** Cada exportação tem uma vez. Quem acorda com a vez errada não escreve mais. */
  let vez = 0;

  /**
   * `retomar`: em vez de pedir, volta a consultar uma exportação que já está na fila. `anteriores` são
   * os arquivos de tentativas anteriores (resultado em parte), que continuam para baixar.
   */
  async function rodar(pedido: PedidoDeExportacao | undefined, anteriores: readonly ArquivoDaExportacao[], retomar?: Exportacao): Promise<void> {
    const minha = ++vez;
    const atual = () => minha === vez;

    const receber = (exportacao: Exportacao): boolean => {
      if (exportacao.estado === 'falhou') {
        armazem.definir({ fase: 'falhou', pedido, codigo: exportacao.erro?.codigo ?? EXPORTACAO_FALHOU, arquivos: anteriores });
        return true;
      }
      const terminou = ESTADOS_FINAIS_DA_EXPORTACAO.includes(exportacao.estado);
      armazem.definir({ fase: terminou ? 'terminou' : 'andando', pedido, exportacao, arquivos: [...anteriores, ...exportacao.arquivos] });
      return terminou;
    };

    let exportacao = retomar;
    if (exportacao) armazem.definir({ fase: 'andando', pedido, exportacao, arquivos: [...anteriores, ...exportacao.arquivos] });
    else {
      if (!pedido) return;
      armazem.definir({ fase: 'pedindo', pedido, arquivos: anteriores });
      const pedida = await deps.api.pedir(pedido);
      if (!atual()) return;
      if (!pedida.ok) return armazem.definir({ fase: 'falhou', pedido, codigo: pedida.codigo, arquivos: anteriores });
      exportacao = pedida.exportacao;
      if (receber(exportacao)) return;
    }

    let semResposta = 0;
    for (let primeira = retomar !== undefined; ; primeira = false) {
      // quem retoma consulta já: a exportação pode ter terminado enquanto a conexão esteve fora
      if (!primeira) await esperar(INTERVALO_DA_CONSULTA);
      if (!atual()) return;
      const r = await deps.api.consultar(exportacao.id);
      if (!atual()) return;
      if (r.ok) {
        semResposta = 0;
        exportacao = r.exportacao;
        if (receber(exportacao)) return;
      } else if (!r.passageiro) {
        return armazem.definir({ fase: 'falhou', pedido, codigo: r.codigo, arquivos: anteriores });
      } else if (++semResposta >= CONSULTAS_SEM_RESPOSTA) {
        return armazem.definir({ fase: 'falhou', pedido, codigo: r.codigo, arquivos: anteriores, retomar: exportacao });
      }
    }
  }

  return {
    armazem,
    exportar: (pedido) => void rodar(pedido, SEM_ARQUIVOS),
    retomar(exportacao) {
      // só o que ainda está em curso, e só se o editor não estiver cuidando de outra
      if (armazem.obter().fase !== 'parado' || ESTADOS_FINAIS_DA_EXPORTACAO.includes(exportacao.estado)) return;
      void rodar(undefined, SEM_ARQUIVOS, exportacao);
    },
    tentarDeNovo() {
      const e = armazem.obter();
      if (e.fase === 'falhou' && (e.pedido || e.retomar)) void rodar(e.pedido, e.arquivos, e.retomar);
    },
    tentarAsQueFalharam() {
      const e = armazem.obter();
      if (e.fase !== 'terminou' || !e.pedido || e.exportacao.falhas.length === 0) return;
      void rodar({ ...e.pedido, pranchetas: e.exportacao.falhas.map((f) => f.pranchetaId) }, e.arquivos);
    },
    limpar() {
      vez++;
      armazem.definir({ fase: 'parado' });
    },
  };
}

export type EstadoDaPrancheta = 'pronta' | 'falhou' | 'andando' | 'na-fila';

/**
 * O andamento de cada prancheta pedida, na ordem do pedido. A API diz quantas terminaram e, no PSD
 * por prancheta e no PNG, quais (pelo arquivo ou pela falha). No PSD com todas juntas só há a contagem.
 */
export function progressoPorPrancheta<P extends { id: string; nome: string }>(exportacao: Exportacao, pranchetas: readonly P[]): { id: string; nome: string; estado: EstadoDaPrancheta }[] {
  const prontas = new Set(exportacao.arquivos.flatMap((a) => (a.pranchetaId ? [a.pranchetaId] : [])));
  const falhas = new Set(exportacao.falhas.map((f) => f.pranchetaId));
  const sabeQuais = prontas.size + falhas.size > 0 || exportacao.progresso.pranchetasProntas === 0;
  let andandoDada = exportacao.estado !== 'rodando';
  return pranchetas.map((p, i) => {
    let estado: EstadoDaPrancheta;
    if (falhas.has(p.id)) estado = 'falhou';
    else if (sabeQuais ? prontas.has(p.id) : i < exportacao.progresso.pranchetasProntas) estado = 'pronta';
    else if (exportacao.estado === 'pronta') estado = 'pronta';
    else if (!andandoDada) {
      andandoDada = true;
      estado = 'andando';
    } else estado = 'na-fila';
    return { id: p.id, nome: p.nome, estado };
  });
}

/** Os arquivos ficam guardados por 7 dias. Depois de `expiraEm`, baixar responde 410: melhor nem oferecer. */
export const expirou = (exportacao: Pick<Exportacao, 'expiraEm'>, agora: number): boolean => exportacao.expiraEm !== undefined && agora > Date.parse(exportacao.expiraEm);
