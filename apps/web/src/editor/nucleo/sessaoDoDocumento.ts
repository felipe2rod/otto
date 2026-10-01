// Sessão do documento: o estado da peça aberta e a fila de lotes otimista.
// TypeScript puro, sem React e sem rede: quem aplica, envia e recarrega entra por parâmetro.
// Regras em docs/mvp/frontend.md (seção 3.1) e contrato em docs/mvp/backend.md (seção 7.3).
//
// A sessão não conhece o formato da árvore nem o catálogo: `aplicar` é o aplicarLote de
// @otto/documento (nucleo/catalogo.ts) e `enviar` será o cliente de POST /api/documentos/:id/lotes.
import { type Armazem, criarArmazem } from './armazem';

export interface LoteDoEditor<Op> {
  /** Gerado no navegador. Reenviar o mesmo id não aplica duas vezes. */
  id: string;
  /** Versão confirmada sobre a qual o lote vai. É preenchida na hora do envio. */
  versaoBase: number;
  descricao: string;
  operacoes: readonly Op[];
}

export type ResultadoDeAplicar<Doc> = { ok: true; doc: Doc; tocados: readonly string[] } | { ok: false; motivo: string };

/** Se há o que desfazer e o que refazer, como a API disse na última resposta. */
export interface Historico {
  podeDesfazer: boolean;
  podeRefazer: boolean;
}

export type RespostaDoEnvio<Doc> =
  /**
   * `arvore` vem quando o editor pede a árvore como ficou no servidor (operação que mede texto).
   * `historico` é para quem enviou: a sessão não o usa.
   */
  | { tipo: 'confirmado'; versao: number; arvore?: Doc; historico?: Historico }
  | { tipo: 'recusado'; codigo: string; detalhe?: Record<string, unknown> }
  | { tipo: 'versao_desatualizada'; versaoAtual: number }
  | { tipo: 'sem_conexao' };

export interface DependenciasDaSessao<Doc, Op> {
  /**
   * Aplica o lote. Recebe o id do lote porque o id de nó novo deriva dele (@otto/documento): a
   * primeira aplicação, a reaplicação e o servidor precisam chegar à mesma árvore.
   */
  aplicar(doc: Doc, operacoes: readonly Op[], idDoLote: string): ResultadoDeAplicar<Doc>;
  enviar(lote: LoteDoEditor<Op>): Promise<RespostaDoEnvio<Doc>>;
  recarregar(): Promise<{ doc: Doc; versao: number }>;
  gerarId(): string;
}

export type Salvamento = 'salvo' | 'salvando' | 'sem-conexao';

export interface Recusa {
  /** Código estável da API. A frase que a pessoa lê é montada em textos/erros.ts. */
  codigo: string;
  detalhe?: Record<string, unknown>;
  /** Quantos lotes saíram da fila: o recusado e os feitos em cima dele. */
  descartados: number;
}

export interface EstadoDaSessao<Doc> {
  /** O documento na última versão que a API confirmou. */
  confirmado: Doc;
  versao: number;
  /** O confirmado com os lotes pendentes aplicados. É o que canvas e painéis mostram. */
  visivel: Doc;
  pendentes: number;
  salvamento: Salvamento;
  somenteLeitura: boolean;
  /** Ids tocados pela última mudança do visível. O motor usa para recompor só o que mudou. */
  tocados: ReadonlySet<string>;
  recusa?: Recusa;
}

export type ResultadoDoGesto = { ok: true; id: string } | { ok: false; motivo: string };

export interface SessaoDoDocumento<Doc, Op> extends Pick<Armazem<EstadoDaSessao<Doc>>, 'obter' | 'assinar'> {
  aplicar(descricao: string, operacoes: readonly Op[]): ResultadoDoGesto;
  /** Lote que não nasceu aqui (o Otto trabalhando), já confirmado pelo servidor com a versão que resultou. */
  receberLote(lote: { id: string; versao: number; operacoes: readonly Op[] }): 'aplicado' | 'ignorado' | 'recarregar';
  /**
   * Adota a árvore que o servidor devolveu (desfazer e refazer). Só com a fila vazia: com lote por
   * confirmar devolve false, e quem pediu espera.
   */
  adotar(estado: { doc: Doc; versao: number }): boolean;
  tentarDeNovo(): void;
  dispensarRecusa(): void;
  definirSomenteLeitura(valor: boolean): void;
}

interface Pendente<Doc, Op> {
  id: string;
  descricao: string;
  operacoes: readonly Op[];
  /** O documento logo depois deste lote. Ao confirmar, vira o confirmado SEM aplicar de novo. */
  depois: Doc;
}

const NADA: ReadonlySet<string> = new Set();

export function criarSessaoDoDocumento<Doc, Op>(inicial: { doc: Doc; versao: number }, deps: DependenciasDaSessao<Doc, Op>): SessaoDoDocumento<Doc, Op> {
  const armazem = criarArmazem<EstadoDaSessao<Doc>>({
    confirmado: inicial.doc,
    versao: inicial.versao,
    visivel: inicial.doc,
    pendentes: 0,
    salvamento: 'salvo',
    somenteLeitura: false,
    tocados: NADA,
  });
  let fila: Pendente<Doc, Op>[] = [];
  let enviando = false;

  /** Reaplica a fila sobre uma base. Lote que não aplica mais sai, com os que vieram depois dele. */
  function reaplicar(base: Doc): { visivel: Doc; tocados: Set<string>; descartados: number } {
    let visivel = base;
    const tocados = new Set<string>();
    for (let i = 0; i < fila.length; i++) {
      const pendente = fila[i] as Pendente<Doc, Op>;
      const r = deps.aplicar(visivel, pendente.operacoes, pendente.id);
      if (!r.ok) {
        const descartados = fila.length - i;
        fila = fila.slice(0, i);
        return { visivel, tocados, descartados };
      }
      visivel = r.doc;
      fila[i] = { ...pendente, depois: r.doc };
      for (const id of r.tocados) tocados.add(id);
    }
    return { visivel, tocados, descartados: 0 };
  }

  const semRecusa = ({ recusa: _recusa, ...resto }: EstadoDaSessao<Doc>): EstadoDaSessao<Doc> => resto;

  async function esvaziar(): Promise<void> {
    if (enviando) return;
    enviando = true;
    try {
      while (fila.length > 0) {
        const primeiro = fila[0] as Pendente<Doc, Op>;
        const resposta = await deps
          // só o que é do contrato: o documento guardado em `depois` nunca vai na requisição
          .enviar({ id: primeiro.id, versaoBase: armazem.obter().versao, descricao: primeiro.descricao, operacoes: primeiro.operacoes })
          .catch((): RespostaDoEnvio<Doc> => ({ tipo: 'sem_conexao' }));

        if (resposta.tipo === 'confirmado') {
          fila = fila.slice(1);
          if (resposta.arvore === undefined) {
            // O servidor chegou à mesma árvore: o confirmado é o resultado que a sessão já tinha, e o
            // visível continua sendo o MESMO objeto. Aplicar de novo criaria um documento igual e
            // novo, e o motor (cache por identidade) recomporia o que já está desenhado.
            armazem.definir((e) => ({ ...e, confirmado: primeiro.depois, versao: resposta.versao, tocados: NADA, pendentes: fila.length, salvamento: fila.length > 0 ? 'salvando' : 'salvo' }));
            continue;
          }
          const confirmado = resposta.arvore;
          const { visivel, tocados, descartados } = reaplicar(confirmado);
          armazem.definir((e) => ({
            ...e,
            confirmado,
            versao: resposta.versao,
            visivel,
            tocados,
            pendentes: fila.length,
            salvamento: fila.length > 0 ? 'salvando' : 'salvo',
            ...(descartados > 0 ? { recusa: { codigo: 'conflito_local', descartados } } : {}),
          }));
          continue;
        }

        if (resposta.tipo === 'sem_conexao') {
          armazem.definir((e) => ({ ...e, salvamento: 'sem-conexao' }));
          return;
        }

        // recusa ou versão desatualizada: o lote e tudo o que foi feito em cima dele saem
        const descartados = fila.length;
        fila = [];
        if (resposta.tipo === 'recusado') {
          armazem.definir((e) => ({
            ...e,
            visivel: e.confirmado,
            tocados: NADA,
            pendentes: 0,
            salvamento: 'salvo',
            recusa: { codigo: resposta.codigo, descartados, ...(resposta.detalhe ? { detalhe: resposta.detalhe } : {}) },
          }));
          return;
        }
        const atual = await deps.recarregar();
        armazem.definir((e) => ({
          ...e,
          confirmado: atual.doc,
          versao: atual.versao,
          visivel: atual.doc,
          tocados: NADA,
          pendentes: 0,
          salvamento: 'salvo',
          recusa: { codigo: 'versao_desatualizada', descartados },
        }));
        return;
      }
    } finally {
      enviando = false;
    }
  }

  return {
    obter: armazem.obter,
    assinar: armazem.assinar,

    aplicar(descricao, operacoes) {
      const estado = armazem.obter();
      if (estado.somenteLeitura) return { ok: false, motivo: 'somente_leitura' };
      if (estado.salvamento === 'sem-conexao') return { ok: false, motivo: 'sem_conexao' };
      const id = deps.gerarId();
      const local = deps.aplicar(estado.visivel, operacoes, id);
      if (!local.ok) return { ok: false, motivo: local.motivo };

      fila = [...fila, { id, descricao, operacoes, depois: local.doc }];
      armazem.definir((e) => ({ ...semRecusa(e), visivel: local.doc, tocados: new Set(local.tocados), pendentes: fila.length, salvamento: 'salvando' }));
      void esvaziar();
      return { ok: true, id };
    },

    receberLote(lote) {
      const estado = armazem.obter();
      if (lote.versao <= estado.versao) return 'ignorado';
      const aplicado = lote.versao === estado.versao + 1 ? deps.aplicar(estado.confirmado, lote.operacoes, lote.id) : undefined;
      if (!aplicado?.ok) {
        // pulou versão ou não aplicou aqui: o que vale é o que o servidor tem
        void deps.recarregar().then((atual) => {
          fila = [];
          armazem.definir((e) => ({ ...e, confirmado: atual.doc, versao: atual.versao, visivel: atual.doc, tocados: NADA, pendentes: 0, salvamento: 'salvo' }));
        });
        return 'recarregar';
      }
      const { visivel } = reaplicar(aplicado.doc);
      armazem.definir((e) => ({ ...e, confirmado: aplicado.doc, versao: lote.versao, visivel, tocados: new Set(aplicado.tocados), pendentes: fila.length }));
      return 'aplicado';
    },

    adotar({ doc, versao }) {
      if (fila.length > 0 || enviando) return false;
      armazem.definir((e) => ({ ...semRecusa(e), confirmado: doc, visivel: doc, versao, tocados: NADA, pendentes: 0, salvamento: 'salvo' }));
      return true;
    },

    tentarDeNovo() {
      if (fila.length === 0) return;
      armazem.definir((e) => ({ ...e, salvamento: 'salvando' }));
      void esvaziar();
    },

    dispensarRecusa() {
      armazem.definir((e) => (e.recusa ? semRecusa(e) : e));
    },

    definirSomenteLeitura(valor) {
      armazem.definir((e) => (e.somenteLeitura === valor ? e : { ...e, somenteLeitura: valor }));
    },
  };
}
