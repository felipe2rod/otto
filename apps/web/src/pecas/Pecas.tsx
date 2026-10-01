'use client';

// Peças: a lista da conta, com criar, renomear, duplicar e excluir (docs/mvp/experiencia.md, 3.2).
// A primeira página vem pronta do servidor; as ações falam com a API daqui, pelo mesmo cliente do
// editor. Miniatura, filtro por marca e "nova peça com este briefing" entram com as fatias deles.
import { type FormEvent, useState } from 'react';
import { criarCliente } from '../api/cliente';
import { type ApiDePecas, criarApiDePecas, type PecaDaLista, type ResultadoDaLista } from '../api/pecas';
import { erros } from '../textos/erros';
import { pecas as textos } from '../textos/pecas';
import estilos from './Pecas.module.css';
import { haQuantoTempo } from './tempo';

const estadoNaTela = (estado: string | undefined): string | undefined =>
  estado && Object.hasOwn(textos.estadoDaTarefa, estado) ? textos.estadoDaTarefa[estado as keyof typeof textos.estadoDaTarefa] : undefined;

/** O que o cartão está fazendo além de ser um link. */
type Modo = { tipo: 'renomeando'; id: string } | { tipo: 'excluindo'; id: string } | null;

export interface PropriedadesDePecas {
  inicial: ResultadoDaLista;
  /** A hora do servidor, para "alterada há 2 dias" sair igual no servidor e no navegador. */
  agora: string;
  api?: ApiDePecas;
  irPara?: (endereco: string) => void;
}

export function Pecas({ inicial, agora, api: apiDeFora, irPara = (endereco) => window.location.assign(endereco) }: PropriedadesDePecas) {
  const [apiPadrao] = useState(() => apiDeFora ?? criarApiDePecas(criarCliente()));
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
    const r = await api.listar(cursor);
    setOcupado(false);
    if (r.estado === 'erro') return setAviso(textos.erro);
    setPecas((lista) => [...lista, ...r.pecas]);
    setCursor(r.proximoCursor);
  };

  const botaoDeNova = (
    <button type="button" className={estilos.principal} disabled={ocupado} onClick={() => void criar()}>
      {ocupado ? textos.criando : textos.novaPeca}
    </button>
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
      <div className={estilos.acoesDaLista}>{botaoDeNova}</div>
      {aviso && (
        <div className={estilos.aviso} role="alert">
          <p>{aviso}</p>
          <button type="button" className={estilos.botao} aria-label={textos.fecharAviso} onClick={() => setAviso(null)}>
            <span aria-hidden="true">×</span>
          </button>
        </div>
      )}
      {pecas.length === 0 ? (
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
  const estado = estadoNaTela(peca.tarefa);
  const [nome, setNome] = useState(peca.nome);
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
        {/* sem miniatura ainda: o contorno do formato, como a tela faz quando a miniatura não carrega */}
        <span className={estilos.miniatura} aria-hidden="true" />
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
