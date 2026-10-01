// Estado do editor. Todo gesto vira lote do catálogo: aplica local (resposta imediata)
// e confirma na API; se a API recusar, volta ao que ela diz e mostra o motivo.
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { Documento } from '../documento/esquema';
import { aplicarLote, descreverErro, type Operacao } from '../documento/operacoes';
import { api, type PedidoDeTarefa, type Registro, type Tarefa } from './api';
import { criarMedidor } from '../render/medidas';
import type { Medidor } from '../documento/operacoes';

let medidor: Medidor | undefined;
/** Mede pela tinta com as mesmas fontes do servidor: o gesto local e a API chegam no mesmo lugar. */
function medidorWeb(): Medidor {
  medidor ??= criarMedidor(document.createElement('canvas').getContext('2d')!);
  return medidor;
}

export type Selecao = { tipo: 'no'; id: string } | { tipo: 'prancheta'; id: string } | null;

interface Editor {
  registro: Registro | undefined;
  doc: Documento | undefined;
  selecao: Selecao;
  selecionar: (s: Selecao) => void;
  aplicar: (descricao: string, operacoes: Operacao[]) => Promise<boolean>;
  desfazer: () => Promise<void>;
  /** tarefa rodando ou em revisão, se houver */
  tarefa: Tarefa | undefined;
  /** ids tocados pelo conjunto de alterações em revisão ou em curso */
  tocadosPeloOtto: ReadonlySet<string>;
  docAntes: Documento | undefined;
  comparando: boolean;
  setComparando: (v: boolean) => void;
  pedirTarefa: (corpo: PedidoDeTarefa) => Promise<void>;
  aceitar: () => Promise<void>;
  desfazerTarefa: () => Promise<void>;
  cancelarTarefa: () => Promise<void>;
  erro: string | undefined;
  avisar: (m: string | undefined) => void;
  abrirDocumento: (id: string) => Promise<void>;
  novoDocumento: (nome: string) => Promise<string>;
}

const Contexto = createContext<Editor | null>(null);

export function useEditor(): Editor {
  const e = useContext(Contexto);
  if (!e) throw new Error('useEditor fora do ProvedorDoEditor');
  return e;
}

export function ProvedorDoEditor({ children }: { children: ReactNode }) {
  const [registro, setRegistro] = useState<Registro>();
  const [selecao, selecionar] = useState<Selecao>(null);
  const [erro, avisar] = useState<string>();
  const [docAntes, setDocAntes] = useState<Documento>();
  const [comparando, setComparando] = useState(false);
  const fonte = useRef<EventSource | null>(null);

  const tarefa = useMemo(() => registro?.tarefas.find((t) => t.estado === 'rodando' || t.estado === 'em-revisao'), [registro]);

  const tocadosPeloOtto = useMemo(() => {
    const s = new Set<string>();
    if (!tarefa || !registro) return s;
    for (const l of registro.historico) if (tarefa.lotes.includes(l.id)) l.tocados.forEach((id) => s.add(id));
    return s;
  }, [registro, tarefa]);

  const abrirDocumento = useCallback(async (id: string) => {
    const r = await api.abrir(id);
    setRegistro(r);
    selecionar(null);
    window.location.hash = id;
  }, []);

  const novoDocumento = useCallback(async (nome: string) => {
    const r = await api.criar(nome);
    setRegistro(r);
    selecionar(null);
    window.location.hash = r.doc.id;
    return r.doc.id;
  }, []);

  // acompanha a tarefa ao vivo
  const tarefaId = tarefa?.id;
  const tarefaRodando = tarefa?.estado === 'rodando';
  useEffect(() => {
    if (!tarefaId || !tarefaRodando) return;
    const es = new EventSource(`/api/tarefas/${tarefaId}/eventos`);
    fonte.current = es;
    es.onmessage = (m) => {
      const { tarefa: t, doc } = JSON.parse(m.data as string) as { tarefa: Tarefa; doc?: Documento };
      setRegistro((r) => {
        if (!r) return r;
        return { ...r, doc: doc ?? r.doc, tarefas: r.tarefas.map((x) => (x.id === t.id ? { ...t, eventos: t.eventos } : x)) };
      });
      if (t.estado !== 'rodando') {
        es.close();
        void api.abrir(t.documentoId).then(setRegistro);
      }
    };
    es.onerror = () => {
      es.close();
      if (registro) void api.abrir(registro.doc.id).then(setRegistro);
    };
    return () => es.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tarefaId, tarefaRodando]);

  // guarda o "antes" do conjunto de alterações para comparar
  useEffect(() => {
    if (!tarefaId) {
      setDocAntes(undefined);
      return;
    }
    void api.antes(tarefaId).then(setDocAntes);
  }, [tarefaId]);

  const aplicar = useCallback(
    async (descricao: string, operacoes: Operacao[]) => {
      if (!registro) return false;
      const local = aplicarLote(registro.doc, operacoes, { tipo: 'designer' }, medidorWeb());
      if (!local.ok) {
        avisar(descreverErro(local.erro));
        return false;
      }
      const anterior = registro;
      setRegistro({ ...registro, doc: local.doc });
      try {
        setRegistro(await api.aplicar(registro.doc.id, descricao, operacoes));
        return true;
      } catch (e) {
        setRegistro(anterior);
        avisar(e instanceof Error ? e.message : String(e));
        return false;
      }
    },
    [registro],
  );

  const comErro = useCallback(async (f: () => Promise<Registro>) => {
    try {
      setRegistro(await f());
    } catch (e) {
      avisar(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const valor: Editor = {
    registro,
    doc: registro?.doc,
    selecao,
    selecionar,
    aplicar,
    desfazer: () => (registro ? comErro(() => api.desfazer(registro.doc.id)) : Promise.resolve()),
    tarefa,
    tocadosPeloOtto,
    docAntes,
    comparando,
    setComparando,
    pedirTarefa: async (corpo) => {
      if (!registro) return;
      await comErro(() => api.pedirTarefa(registro.doc.id, corpo));
    },
    aceitar: () => (tarefa ? comErro(() => api.aceitar(tarefa.id)) : Promise.resolve()),
    desfazerTarefa: () => (tarefa ? comErro(() => api.desfazerTarefa(tarefa.id)) : Promise.resolve()),
    cancelarTarefa: async () => {
      if (tarefa) await api.cancelar(tarefa.id);
    },
    erro,
    avisar,
    abrirDocumento,
    novoDocumento,
  };
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}
