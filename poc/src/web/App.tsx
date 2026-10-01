import { useCallback, useEffect, useState } from 'react';
import { api, type ItemDaLista } from './api';
import type { EsforcoCriativo } from '../servidor/esforco';
import { Briefing } from './componentes/Briefing';
import { Camadas } from './componentes/Camadas';
import { Canvas } from './componentes/Canvas';
import { Exportar } from './componentes/Exportar';
import { PainelDoOtto } from './componentes/PainelDoOtto';
import { Propriedades } from './componentes/Propriedades';
import { useEditor } from './estado';

export function App() {
  const { registro, doc, abrirDocumento, novoDocumento, desfazer, erro, avisar, tarefa } = useEditor();
  const [briefingAberto, setBriefingAberto] = useState(false);
  const [exportarAberto, setExportarAberto] = useState(false);
  const [documentos, setDocumentos] = useState<ItemDaLista[]>([]);
  const [modelo, setModelo] = useState<string>();

  // abre o documento do endereço, o mais recente, ou cria um
  useEffect(() => {
    void (async () => {
      const [lista, estado] = await Promise.all([api.listar(), api.estado()]);
      setDocumentos(lista);
      setModelo(estado.modelo);
      const doHash = window.location.hash.slice(1);
      const alvo = lista.find((d) => d.id === doHash) ?? lista[0];
      if (alvo) await abrirDocumento(alvo.id);
      else {
        await novoDocumento('Sem título');
        setBriefingAberto(true);
      }
    })().catch((e: unknown) => avisar(`não consegui falar com a API: ${e instanceof Error ? e.message : String(e)}`));
  }, [abrirDocumento, novoDocumento, avisar]);

  useEffect(() => {
    if (!erro) return;
    const t = setTimeout(() => avisar(undefined), 6000);
    return () => clearTimeout(t);
  }, [erro, avisar]);

  const enviarBriefing = useCallback(
    async (briefing: unknown, nome: string, esforco?: EsforcoCriativo) => {
      if (!doc) return;
      // briefing novo em documento com trabalho vira documento novo; documento vazio é usado
      const id = doc.pranchetas.length === 0 && registro?.historico.length === 0 ? doc.id : (await api.criar(nome || 'Nova peça')).doc.id;
      await api.pedirTarefa(id, { tipo: 'briefing', briefing, ...(esforco ? { esforco } : {}) });
      await abrirDocumento(id);
      setDocumentos(await api.listar());
      setBriefingAberto(false);
    },
    [doc, registro, abrirDocumento],
  );

  return (
    <div className="editor">
      <header className="topo">
        <div className="logo" aria-label="Otto">
          <span className="o">O</span>tto
          <small>POC</small>
        </div>
        <label className="doc-atual">
          <span className="visualmente-oculto">Documento</span>
          <select
            value={doc?.id ?? ''}
            onChange={async (e) => {
              if (e.target.value === '__novo') {
                await novoDocumento('Sem título');
                setDocumentos(await api.listar());
                setBriefingAberto(true);
              } else await abrirDocumento(e.target.value);
            }}
          >
            {documentos.map((d) => (
              <option key={d.id} value={d.id}>
                {d.nome}
              </option>
            ))}
            {doc && !documentos.some((d) => d.id === doc.id) && <option value={doc.id}>{doc.nome}</option>}
            <option value="__novo">+ Novo documento</option>
          </select>
        </label>
        <span className="espaco" />
        <button type="button" className="botao-topo" onClick={() => void desfazer()} disabled={!registro?.historico.length || tarefa?.estado === 'rodando'} title="Desfazer (Ctrl+Z)">
          Desfazer
        </button>
        <button type="button" className="botao-topo destaque" onClick={() => setExportarAberto(true)} disabled={!doc?.pranchetas.length}>
          Exportar para PSD
        </button>
        {modelo && <span className="modelo" title="Modelo do agente nesta POC">{modelo}</span>}
      </header>

      <aside className="coluna esquerda">
        <Camadas />
      </aside>
      <main className="centro">
        <Canvas />
        {erro && (
          <div className="aviso-flutuante" role="alert">
            {erro}
            <button type="button" onClick={() => avisar(undefined)} aria-label="Fechar aviso">
              ×
            </button>
          </div>
        )}
      </main>
      <aside className="coluna direita">
        <PainelDoOtto aoAbrirBriefing={() => setBriefingAberto(true)} />
        <Propriedades />
      </aside>

      {briefingAberto && <Briefing aoFechar={() => setBriefingAberto(false)} aoEnviar={enviarBriefing} />}
      {exportarAberto && <Exportar aoFechar={() => setExportarAberto(false)} />}
    </div>
  );
}
