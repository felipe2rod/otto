'use client';

// Peças: a lista da conta, com criar, renomear, duplicar e excluir (docs/mvp/experiencia.md, 3.2).
// A primeira página vem pronta do servidor; as ações falam com a API daqui, pelo mesmo cliente do
// editor. "Nova peça" leva ao formulário de briefing. Miniatura e filtro por marca dependem da API.
import type { Marca } from '@otto/shared';
import { type FormEvent, useEffect, useState } from 'react';
import { type ApiDeCadastros, criarApiDeCadastros } from '../api/cadastros';
import { criarCliente } from '../api/cliente';
import { type ApiDePecas, criarApiDePecas, type PecaDaLista, type ResultadoDaLista } from '../api/pecas';
import { erros } from '../textos/erros';
import { pecas as textos } from '../textos/pecas';
import estilos from './Pecas.module.css';
import { haQuantoTempo } from './tempo';

/** O estado da tarefa viva nas palavras da tela. Em revisão com o trabalho parado no meio não é "pronto para revisar". */
const estadoNaTela = (peca: Pick<PecaDaLista, 'tarefa' | 'tarefaParou'>): string | undefined => {
  if (peca.tarefaParou) return textos.estadoDaTarefa.naoTerminou;
  return peca.tarefa && Object.hasOwn(textos.estadoDaTarefa, peca.tarefa) ? textos.estadoDaTarefa[peca.tarefa as keyof typeof textos.estadoDaTarefa] : undefined;
};

/** O que o cartão está fazendo além de ser um link. */
type Modo = { tipo: 'renomeando'; id: string } | { tipo: 'excluindo'; id: string } | null;

export interface PropriedadesDePecas {
  inicial: ResultadoDaLista;
  /** A hora do servidor, para "alterada há 2 dias" sair igual no servidor e no navegador. */
  agora: string;
  api?: ApiDePecas;
  irPara?: (endereco: string) => void;
  /** A marca do filtro (a lista inicial já veio só com as peças dela). */
  marcaId?: string;
  cadastros?: Pick<ApiDeCadastros, 'marcas'>;
}

export function Pecas({ inicial, agora, api: apiDeFora, irPara = (endereco) => window.location.assign(endereco), marcaId, cadastros: cadastrosDeFora }: PropriedadesDePecas) {
  const [apiPadrao] = useState(() => apiDeFora ?? criarApiDePecas(criarCliente()));
  const [cadastros] = useState(() => cadastrosDeFora ?? criarApiDeCadastros(criarCliente()));
  /** As marcas da conta, para o filtro. Vazio (ou falha na leitura): a lista aparece sem o filtro. */
  const [marcas, setMarcas] = useState<Marca[]>([]);
  useEffect(() => {
    let desmontado = false;
    void cadastros.marcas().then((lidas) => !desmontado && setMarcas(lidas ?? []));
    return () => {
      desmontado = true;
    };
  }, [cadastros]);
  const marcaDoFiltro = marcas.find((m) => m.id === marcaId);
  const api = apiDeFora ?? apiPadrao;
  const [pecas, setPecas] = useState(inicial.estado === 'ok' ? inicial.pecas : []);
  const [cursor, setCursor] = useState(inicial.estado === 'ok' ? inicial.proximoCursor : null);
  const [modo, setModo] = useState<Modo>(null);
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const quando = new Date(agora);

  /** Roda uma ação da API, uma por vez; se falhar, diz a frase da tela e deixa a lista como estava. */
  async function agir<T extends { ok: boolean }>(acao: () => Promise<T>): Promise<Extract<T, { ok: true }> | undefined> {
    setOcupado(true);
    setAviso(null);
    const r = await acao();
    setOcupado(false);
    if (r.ok) return r as Extract<T, { ok: true }>;
    setAviso(erros.doCodigo((r as unknown as { codigo: string }).codigo));
    return undefined;
  }

  const criar = async () => {
    const r = await agir(() => api.criar());
    if (r) irPara(`/editor/p/${encodeURIComponent(r.peca.id)}`);
  };
  const duplicar = async (peca: PecaDaLista) => {
    const r = await agir(() => api.duplicar(peca.id));
    if (r) setPecas((lista) => [r.peca, ...lista]);
  };
  const renomear = async (peca: PecaDaLista, nome: string) => {
    setModo(null);
    if (nome.trim() === '' || nome.trim() === peca.nome) return;
    const r = await agir(() => api.renomear(peca.id, nome));
    if (r) setPecas((lista) => lista.map((p) => (p.id === peca.id ? { ...p, nome: r.nome } : p)));
  };
  const excluir = async (peca: PecaDaLista) => {
    const r = await agir(() => api.arquivar(peca.id));
    if (r) {
      setModo(null);
      setPecas((lista) => lista.filter((p) => p.id !== peca.id));
    }
  };
  const carregarMais = async () => {
    if (!cursor) return;
    setOcupado(true);
    const r = await api.listar(cursor, marcaId);
    setOcupado(false);
    if (r.estado === 'erro') return setAviso(textos.erro);
    setPecas((lista) => [...lista, ...r.pecas]);
    setCursor(r.proximoCursor);
  };

  // O caminho padrão para criar é o formulário de briefing (ADR 033); a peça em branco fica em segundo plano.
  const botoesDeNova = (
    <>
      <button type="button" className={estilos.botao} disabled={ocupado} onClick={() => void criar()}>
        {textos.pecaEmBranco}
      </button>
      {/* trazer para o Otto a peça que já existe: enviar o arquivo, decidir as fontes, abrir */}
      <a className={estilos.botao} href="/editor/importar">
        {textos.importarPsd}
      </a>
      <a className={estilos.principal} href="/editor/novo">
        {textos.novaPeca}
      </a>
    </>
  );

  if (inicial.estado === 'erro') {
    return (
      <div className={estilos.aviso} role="alert">
        <p>{textos.erro}</p>
        <a className={estilos.botao} href="/editor">
          {textos.tentarDeNovo}
        </a>
      </div>
    );
  }

  return (
    <>
      <div className={estilos.acoesDaLista}>
        {/* o filtro recarrega a lista pelo servidor: a marca vai no endereço, e a página pode ser guardada ou enviada */}
        {marcas.length > 0 && (
          <label className={estilos.filtro}>
            <span>{textos.filtro.rotulo}</span>
            <select aria-label={textos.filtro.rotulo} value={marcaDoFiltro?.id ?? ''} onChange={(e) => irPara(e.target.value ? `/editor?marca=${encodeURIComponent(e.target.value)}` : '/editor')}>
              <option value="">{textos.filtro.todas}</option>
              {marcas.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nome}
                </option>
              ))}
            </select>
          </label>
        )}
        {botoesDeNova}
      </div>
      {aviso && (
        <div className={estilos.aviso} role="alert">
          <p>{aviso}</p>
          <button type="button" className={estilos.botao} aria-label={textos.fecharAviso} onClick={() => setAviso(null)}>
            <span aria-hidden="true">×</span>
          </button>
        </div>
      )}
      {pecas.length === 0 && marcaId ? (
        // filtro sem resultado não é conta vazia: diz de que marca, e oferece a peça nova dela
        <div className={estilos.vazio}>
          <p>{marcaDoFiltro ? textos.filtro.nenhuma(marcaDoFiltro.nome) : null}</p>
          {marcaDoFiltro && (
            <a className={estilos.botao} href={`/editor/novo?marca=${encodeURIComponent(marcaDoFiltro.id)}`}>
              {textos.filtro.novaPara(marcaDoFiltro.nome)}
            </a>
          )}
        </div>
      ) : pecas.length === 0 ? (
        <p className={estilos.vazio}>{textos.vazio}</p>
      ) : (
        <ul className={estilos.grade} aria-label={textos.lista}>
          {pecas.map((peca) => (
            <Cartao
              key={peca.id}
              peca={peca}
              quando={quando}
              modo={modo?.id === peca.id ? modo.tipo : null}
              ocupado={ocupado}
              aoMudarModo={(tipo) => setModo(tipo ? { tipo, id: peca.id } : null)}
              aoRenomear={(nome) => void renomear(peca, nome)}
              aoDuplicar={() => void duplicar(peca)}
              aoExcluir={() => void excluir(peca)}
            />
          ))}
        </ul>
      )}
      {cursor && (
        <button type="button" className={estilos.botao} disabled={ocupado} onClick={() => void carregarMais()}>
          {textos.carregarMais}
        </button>
      )}
    </>
  );
}

interface PropriedadesDoCartao {
  peca: PecaDaLista;
  quando: Date;
  modo: 'renomeando' | 'excluindo' | null;
  ocupado: boolean;
  aoMudarModo: (modo: 'renomeando' | 'excluindo' | null) => void;
  aoRenomear: (nome: string) => void;
  aoDuplicar: () => void;
  aoExcluir: () => void;
}

function Cartao({ peca, quando, modo, ocupado, aoMudarModo, aoRenomear, aoDuplicar, aoExcluir }: PropriedadesDoCartao) {
  const estado = estadoNaTela(peca);
  const [nome, setNome] = useState(peca.nome);
  const [semMiniatura, setSemMiniatura] = useState(false);
  const enviar = (e: FormEvent) => {
    e.preventDefault();
    aoRenomear(nome);
  };
  /** Fecha o menu (um <details>) antes de agir: ele não fecha sozinho. */
  const escolher = (acao: () => void) => (e: { currentTarget: HTMLElement }) => {
    e.currentTarget.closest('details')?.removeAttribute('open');
    acao();
  };

  return (
    <li className={estilos.item}>
      <a className={estilos.cartao} href={`/editor/p/${encodeURIComponent(peca.id)}`} data-pede-acao={estado ? 'sim' : undefined}>
        {/* sem miniatura (ou se ela não carregar): o contorno do formato, e o cartão continua clicável */}
        {peca.miniatura && !semMiniatura ? (
          <span className={estilos.miniatura} data-com-imagem="sim">
            {/* biome-ignore lint/performance/noImgElement: JPEG pequeno da API, com cache imutável; não passa pelo otimizador de imagens */}
            <img src={peca.miniatura} alt="" loading="lazy" onError={() => setSemMiniatura(true)} />
          </span>
        ) : (
          <span className={estilos.miniatura} aria-hidden="true" data-sem-miniatura />
        )}
        <span className={estilos.nome}>{peca.nome}</span>
        <span className={estilos.medida}>{textos.formatos(peca.formatos)}</span>
        {/* o estado não depende só da cor: tem a marca e o texto */}
        {estado && <span className={estilos.estado}>{estado}</span>}
        <span className={estilos.quando}>{textos.alterada(haQuantoTempo(peca.alteradoEm, quando))}</span>
      </a>

      <details className={estilos.menu}>
        <summary aria-label={textos.acoes(peca.nome)} title={textos.acoes(peca.nome)}>
          <span aria-hidden="true">⋯</span>
          <span className={estilos.soParaLeitorDeTela}>{textos.acoes(peca.nome)}</span>
        </summary>
        <div className={estilos.itensDoMenu}>
          <button
            type="button"
            disabled={ocupado}
            onClick={escolher(() => {
              setNome(peca.nome);
              aoMudarModo('renomeando');
            })}
          >
            {textos.renomear}
          </button>
          <button type="button" disabled={ocupado} onClick={escolher(aoDuplicar)}>
            {textos.duplicar}
          </button>
          {/* o briefing que gerou a peça está guardado na tarefa: o formulário abre preenchido com ele */}
          <a href={`/editor/novo?peca=${encodeURIComponent(peca.id)}`}>{textos.comEsteBriefing}</a>
          <button type="button" disabled={ocupado} onClick={escolher(() => aoMudarModo('excluindo'))}>
            {textos.excluir}
          </button>
        </div>
      </details>

      {modo === 'renomeando' && (
        <form className={estilos.faixa} onSubmit={enviar}>
          <input
            aria-label={textos.novoNome(peca.nome)}
            value={nome}
            maxLength={120}
            // biome-ignore lint/a11y/noAutofocus: o campo nasce de "Renomear"; o foco precisa ir para ele
            autoFocus
            onChange={(e) => setNome(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && aoMudarModo(null)}
          />
          <button type="submit" className={estilos.botao}>
            {textos.salvar}
          </button>
          <button type="button" className={estilos.botao} onClick={() => aoMudarModo(null)}>
            {textos.cancelar}
          </button>
        </form>
      )}
      {modo === 'excluindo' && (
        <div className={estilos.faixa}>
          <p>{textos.confirmarExclusao(peca.nome)}</p>
          <button type="button" className={estilos.perigo} disabled={ocupado} onClick={aoExcluir}>
            {textos.excluir}
          </button>
          <button type="button" className={estilos.botao} onClick={() => aoMudarModo(null)}>
            {textos.cancelar}
          </button>
        </div>
      )}
    </li>
  );
}
