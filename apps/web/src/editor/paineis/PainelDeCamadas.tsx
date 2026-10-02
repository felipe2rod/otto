'use client';

// Painel de camadas: a árvore do documento, da camada de cima para a de baixo, como no Photoshop.
// Toda mudança (ocultar, bloquear, renomear, reordenar) é lote do catálogo, pelo `aplicar` do
// ambiente. A lista é virtualizada: só as linhas à vista vão para a página (ADR 030: 200 camadas).
// Arrastar para reordenar, seleção múltipla e inserir camada entram depois.
import type { Documento, No, Prancheta } from '@otto/documento';
import { type KeyboardEvent, memo, useEffect, useId, useMemo, useRef, useState } from 'react';
import { editor as textos } from '../../textos/editor';
import { otto as textosDoOtto } from '../../textos/otto';
import { type AmbienteDoEditor, useAmbiente } from '../ambiente';
import { type DestinoNoPainel, loteDeBloqueio, loteDeDesagrupar, loteDeRenomear, loteDeReordenar, loteDeSoltarNoPainel, loteDeVisibilidade } from '../nucleo/acoes';
import { useArmazem } from '../nucleo/armazem';
import { agruparSelecao, desagruparSelecao } from '../nucleo/comandos';
import type { Selecao } from '../nucleo/interface';
import estilos from './PainelDeCamadas.module.css';

const ALTURA_DA_LINHA = 28;
const FOLGA = 10;
/** Altura usada enquanto o painel ainda não foi medido (e nos testes, que não têm layout). */
const ALTURA_PADRAO = 600;

const ICONE: Readonly<Record<No['tipo'], string>> = { texto: 'T', forma: '▭', imagem: '▨', vetor: '✦', grupo: '▤', ajuste: '◐' };

type Linha = { tipo: 'prancheta'; prancheta: Prancheta; id: string; nivel: 1 } | { tipo: 'no'; no: No; id: string; nivel: number; caminho: string };

/** Quanto o ponteiro precisa andar para um clique virar arraste, em pixels. */
const INICIO_DO_ARRASTE = 4;

/** Onde a camada arrastada vai cair: sobre qual linha, e em que metade dela. */
type Destino = DestinoNoPainel;

/**
 * Onde o ponteiro está na linha: no quarto de cima, no de baixo ou, em grupo e prancheta, no meio
 * (soltar ali põe a camada DENTRO). Prancheta só recebe por dentro. Linha sem altura (sem layout):
 * acima do topo, abaixo dele ou exatamente nele.
 */
export function zonaDaLinha(y: number, topo: number, altura: number, aceitaDentro: boolean): Destino['onde'] {
  const fracao = altura > 0 ? (y - topo) / altura : y < topo ? 0 : y > topo ? 1 : 0.5;
  if (!aceitaDentro) return fracao < 0.5 ? 'acima' : 'abaixo';
  if (fracao < 0.25) return 'acima';
  return fracao > 0.75 ? 'abaixo' : 'dentro';
}

/** A árvore achatada, na ordem em que aparece: cada prancheta, e as camadas de cima para baixo. */
function achatar(doc: Documento, recolhidos: ReadonlySet<string>): Linha[] {
  const linhas: Linha[] = [];
  const descer = (nos: readonly No[], nivel: number, prancheta: string) => {
    for (let i = nos.length - 1; i >= 0; i--) {
      const no = nos[i] as No;
      // "Prancheta/Camada": é como o motor cita a camada no que ficou em falta
      linhas.push({ tipo: 'no', no, id: no.id, nivel, caminho: `${prancheta}/${no.nome}` });
      if (no.tipo === 'grupo' && !recolhidos.has(no.id)) descer(no.filhos, nivel + 1, prancheta);
    }
  };
  for (const prancheta of doc.pranchetas) {
    linhas.push({ tipo: 'prancheta', prancheta, id: prancheta.id, nivel: 1 });
    if (!recolhidos.has(prancheta.id)) descer(prancheta.filhos, 2, prancheta.nome);
  }
  return linhas;
}

const selecionada = (selecao: Selecao, linha: Linha): boolean =>
  linha.tipo === 'prancheta' ? selecao?.tipo === 'prancheta' && selecao.id === linha.id : selecao?.tipo === 'camadas' && selecao.ids.includes(linha.id);

interface PropriedadesDaLinha {
  linha: Linha;
  idNoDom: string;
  ativa: boolean;
  recolhida: boolean;
  travado: boolean;
  renomeando: boolean;
  /** A fonte desta camada de texto não carregou: ela não aparece no canvas. */
  semFonte: boolean;
  /** A camada (ou prancheta) foi tocada pela tarefa viva do Otto. */
  doOtto: boolean;
  /** A camada arrastada vai cair acima ou abaixo desta linha. */
  destino: 'acima' | 'abaixo' | 'dentro' | null;
  topo: number;
  ambiente: AmbienteDoEditor;
  aoAlternarGrupo: (id: string) => void;
  aoRenomear: (id: string | null) => void;
  aoApertar: (id: string, y: number) => void;
  aoPassar: (id: string, aceitaDentro: boolean, y: number, topo: number, altura: number) => void;
}

const LinhaDaArvore = memo(function LinhaDaArvore(props: PropriedadesDaLinha) {
  const { linha, idNoDom, ativa, recolhida, travado, renomeando, semFonte, doOtto, destino, topo, ambiente, aoAlternarGrupo, aoRenomear, aoApertar, aoPassar } = props;
  const ehGrupo = linha.tipo === 'prancheta' || linha.no.tipo === 'grupo';
  const nome = linha.tipo === 'prancheta' ? linha.prancheta.nome : linha.no.nome;
  const rotulo = linha.tipo === 'prancheta' ? textos.camadas.prancheta(nome, linha.prancheta.largura, linha.prancheta.altura) : textos.camadas.linha(nome, textos.camadas.tipos[linha.no.tipo]);
  // Shift (ou Ctrl) + clique acrescenta a camada à seleção, ou tira se já estava
  const selecionar = (e: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }) => {
    if (linha.tipo === 'prancheta') return ambiente.interface.selecionar({ tipo: 'prancheta', id: linha.id });
    if (e.shiftKey || e.ctrlKey || e.metaKey) return ambiente.interface.alternarNaSelecao(linha.id);
    ambiente.interface.selecionar({ tipo: 'camadas', ids: [linha.id] });
  };
  const arrastavel = linha.tipo === 'no' && !travado && !linha.no.bloqueado && !renomeando;

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: o teclado da árvore é tratado no elemento com role="tree" (setas, com aria-activedescendant)
    <div
      id={idNoDom}
      role="treeitem"
      tabIndex={-1}
      aria-label={rotulo}
      aria-level={linha.nivel}
      aria-selected={ativa}
      {...(ehGrupo ? { 'aria-expanded': !recolhida } : {})}
      className={estilos.linha}
      data-prancheta={linha.tipo === 'prancheta' ? 'sim' : undefined}
      data-oculta={linha.tipo === 'no' && !linha.no.visivel ? 'sim' : undefined}
      data-destino={destino ?? undefined}
      data-otto={doOtto ? 'sim' : undefined}
      onPointerDown={(e) => arrastavel && e.button === 0 && aoApertar(linha.id, e.clientY)}
      onPointerMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        aoPassar(linha.id, ehGrupo, e.clientY, r.top, r.height);
      }}
      style={{ top: topo, paddingLeft: 6 + (linha.nivel - 1) * 14 }}
      onClick={selecionar}
    >
      {ehGrupo ? (
        <button
          type="button"
          className={estilos.seta}
          aria-label={recolhida ? textos.camadas.abrir : textos.camadas.recolher}
          onClick={(e) => {
            e.stopPropagation();
            aoAlternarGrupo(linha.id);
          }}
        >
          <span aria-hidden="true">{recolhida ? '▸' : '▾'}</span>
        </button>
      ) : (
        <span className={estilos.seta} aria-hidden="true" />
      )}

      {linha.tipo === 'prancheta' ? (
        <>
          <span className={estilos.nome}>{nome}</span>
          {doOtto && (
            <span className={estilos.marcaDoOtto} title={textosDoOtto.revisao.legenda} role="img" aria-label={textosDoOtto.revisao.legenda}>
              ●
            </span>
          )}
          <span className={estilos.medida} aria-hidden="true">
            {linha.prancheta.largura}×{linha.prancheta.altura}
          </span>
        </>
      ) : (
        <>
          <span className={estilos.icone} aria-hidden="true">
            {ICONE[linha.no.tipo]}
          </span>
          {renomeando ? (
            <CampoDeNome no={linha.no} ambiente={ambiente} aoFechar={() => aoRenomear(null)} />
          ) : (
            // biome-ignore lint/a11y/noStaticElementInteractions: o duplo clique é atalho de mouse; pelo teclado, o nome se troca no painel de propriedades
            <span className={estilos.nome} onDoubleClick={() => !travado && !linha.no.bloqueado && aoRenomear(linha.id)}>
              {nome}
            </span>
          )}
          {semFonte && (
            <span className={estilos.marcaDeFalta} title={textos.camadas.fonteEmFalta} role="img" aria-label={textos.camadas.fonteEmFalta}>
              !
            </span>
          )}
          {/* a marca não depende só da cor: tem o ponto e o texto */}
          {doOtto && (
            <span className={estilos.marcaDoOtto} title={textosDoOtto.revisao.legenda} role="img" aria-label={textosDoOtto.revisao.legenda}>
              ●
            </span>
          )}
          {linha.no.recortadaNaDeBaixo && (
            <span className={estilos.marca} title={textos.camadas.recortada} role="img" aria-label={textos.camadas.recortada}>
              ↳
            </span>
          )}
          {linha.no.mascara && (
            <span className={estilos.marca} title={textos.camadas.comMascara} role="img" aria-label={textos.camadas.comMascara}>
              ◑
            </span>
          )}
          <button
            type="button"
            className={estilos.alternar}
            disabled={travado}
            aria-label={linha.no.visivel ? textos.camadas.ocultar : textos.camadas.mostrar}
            title={linha.no.visivel ? textos.camadas.ocultar : textos.camadas.mostrar}
            onClick={(e) => {
              e.stopPropagation();
              ambiente.aplicar(loteDeVisibilidade(linha.no));
            }}
          >
            <span aria-hidden="true">{linha.no.visivel ? '◉' : '○'}</span>
          </button>
          <button
            type="button"
            className={estilos.alternar}
            data-ligado={linha.no.bloqueado ? 'sim' : undefined}
            disabled={travado}
            aria-label={linha.no.bloqueado ? textos.camadas.desbloquear : textos.camadas.bloquear}
            title={linha.no.bloqueado ? textos.camadas.desbloquear : textos.camadas.bloquear}
            onClick={(e) => {
              e.stopPropagation();
              ambiente.aplicar(loteDeBloqueio(linha.no));
            }}
          >
            <span aria-hidden="true">{linha.no.bloqueado ? '■' : '□'}</span>
          </button>
        </>
      )}
    </div>
  );
});

function CampoDeNome({ no, ambiente, aoFechar }: { no: No; ambiente: AmbienteDoEditor; aoFechar: () => void }) {
  const [rascunho, setRascunho] = useState(no.nome);
  const cancelado = useRef(false);
  const confirmar = () => {
    if (!cancelado.current) ambiente.aplicar(loteDeRenomear(no, rascunho));
    aoFechar();
  };
  return (
    <input
      className={estilos.campoDeNome}
      aria-label={textos.camadas.novoNome(no.nome)}
      value={rascunho}
      // biome-ignore lint/a11y/noAutofocus: o campo nasce de um duplo clique no nome; o foco precisa ir para ele
      autoFocus
      onChange={(e) => setRascunho(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onBlur={confirmar}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') confirmar();
        if (e.key === 'Escape') {
          cancelado.current = true;
          aoFechar();
        }
      }}
    />
  );
}

export function PainelDeCamadas() {
  const ambiente = useAmbiente();
  const doc = useArmazem(ambiente.documento, (d) => d);
  const selecao = useArmazem(ambiente.interface.armazem, (e) => e.selecao);
  const travado = useArmazem(ambiente.somenteLeitura, (v) => v);
  const fontesEmFalta = useArmazem(ambiente.faltas, (f) => f.emFalta.fontes);
  const semFonte = useMemo(() => new Set(fontesEmFalta.flatMap((f) => f.camadas)), [fontesEmFalta]);
  const tocados = useArmazem(ambiente.tocadosPeloOtto, (t) => t);
  const [destino, setDestino] = useState<Destino | null>(null);
  /** A camada apertada, e onde: vira arraste quando o ponteiro anda. */
  const arraste = useRef<{ id: string; y: number; andou: boolean } | null>(null);
  const destinoRef = useRef<Destino | null>(null);
  const [recolhidos, setRecolhidos] = useState<ReadonlySet<string>>(new Set());
  const [renomeando, setRenomeando] = useState<string | null>(null);
  const [rolagem, setRolagem] = useState({ topo: 0, altura: ALTURA_PADRAO });
  const caixaRef = useRef<HTMLDivElement>(null);
  const idDoTitulo = useId();
  const prefixo = useId();

  const linhas = useMemo(() => (doc ? achatar(doc, recolhidos) : []), [doc, recolhidos]);
  const indiceAtivo = linhas.findIndex((l) => selecionada(selecao, l));

  // Mede o painel e mantém a linha selecionada à vista (a seleção pode vir do canvas).
  useEffect(() => {
    const caixa = caixaRef.current;
    if (!caixa) return;
    const medir = () => setRolagem({ topo: caixa.scrollTop, altura: caixa.clientHeight || ALTURA_PADRAO });
    medir();
    const observador = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(medir);
    observador?.observe(caixa);
    return () => observador?.disconnect();
  }, []);
  useEffect(() => {
    const caixa = caixaRef.current;
    if (!caixa || indiceAtivo < 0 || !caixa.clientHeight) return;
    const topo = indiceAtivo * ALTURA_DA_LINHA;
    if (topo < caixa.scrollTop) caixa.scrollTop = topo;
    else if (topo + ALTURA_DA_LINHA > caixa.scrollTop + caixa.clientHeight) caixa.scrollTop = topo + ALTURA_DA_LINHA - caixa.clientHeight;
  }, [indiceAtivo]);

  const alternarGrupo = useRef((id: string) => setRecolhidos((atual) => new Set(atual.has(id) ? [...atual].filter((x) => x !== id) : [...atual, id]))).current;
  const renomear = useRef((id: string | null) => setRenomeando(id)).current;

  // Arrastar uma camada: ao lado de outra (reordena, ou muda de grupo ou de prancheta para ficar ali)
  // ou para dentro de um grupo ou de uma prancheta. Soltar é UM lote (`reordenar` ou `transferir`).
  const apertar = useRef((id: string, y: number) => {
    arraste.current = { id, y, andou: false };
  }).current;
  const passar = useRef((id: string, aceitaDentro: boolean, y: number, topo: number, altura: number) => {
    const a = arraste.current;
    if (!a) return;
    if (!a.andou && Math.abs(y - a.y) < INICIO_DO_ARRASTE && id === a.id) return;
    a.andou = true;
    const novo: Destino | null = id === a.id ? null : { id, onde: zonaDaLinha(y, topo, altura, aceitaDentro) };
    if (novo?.id !== destinoRef.current?.id || novo?.onde !== destinoRef.current?.onde) {
      destinoRef.current = novo;
      setDestino(novo);
    }
  }).current;
  useEffect(() => {
    const soltar = () => {
      const a = arraste.current;
      const d = destinoRef.current;
      arraste.current = null;
      destinoRef.current = null;
      setDestino(null);
      const atual = ambiente.documento.obter();
      if (a?.andou && d && atual) ambiente.aplicar(loteDeSoltarNoPainel(atual, a.id, d));
    };
    window.addEventListener('pointerup', soltar);
    window.addEventListener('pointercancel', soltar);
    return () => {
      window.removeEventListener('pointerup', soltar);
      window.removeEventListener('pointercancel', soltar);
    };
  }, [ambiente]);

  const selecionarLinha = (linha: Linha | undefined) => {
    if (linha) ambiente.interface.selecionar(linha.tipo === 'prancheta' ? { tipo: 'prancheta', id: linha.id } : { tipo: 'camadas', ids: [linha.id] });
  };
  const aoTeclar = (e: KeyboardEvent) => {
    const ativa = linhas[indiceAtivo];
    const ehGrupo = ativa && (ativa.tipo === 'prancheta' || ativa.no.tipo === 'grupo');
    if (e.key === 'ArrowDown') selecionarLinha(linhas[Math.min(linhas.length - 1, indiceAtivo + 1)]);
    else if (e.key === 'ArrowUp') selecionarLinha(linhas[Math.max(0, indiceAtivo - 1)]);
    else if (e.key === 'Home') selecionarLinha(linhas[0]);
    else if (e.key === 'End') selecionarLinha(linhas.at(-1));
    else if (e.key === 'ArrowLeft' && ehGrupo && !recolhidos.has(ativa.id)) alternarGrupo(ativa.id);
    else if (e.key === 'ArrowRight' && ehGrupo && recolhidos.has(ativa.id)) alternarGrupo(ativa.id);
    else if (e.key === 'F2' && ativa?.tipo === 'no' && !travado && !ativa.no.bloqueado) setRenomeando(ativa.id);
    else return;
    e.preventDefault();
  };

  const camadaAtiva = selecao?.tipo === 'camadas' && selecao.ids.length === 1 ? selecao.ids[0] : undefined;
  const reordenar = (sentido: 1 | -1) => doc && camadaAtiva && ambiente.aplicar(loteDeReordenar(doc, camadaAtiva, sentido));
  const podeReordenar = (sentido: 1 | -1) => Boolean(doc && camadaAtiva && !travado && loteDeReordenar(doc, camadaAtiva, sentido));

  const podeAgrupar = Boolean(doc && !travado && selecao?.tipo === 'camadas' && selecao.ids.length > 0);
  const podeDesagrupar = Boolean(doc && !travado && loteDeDesagrupar(doc, selecao));

  const primeira = Math.max(0, Math.floor(rolagem.topo / ALTURA_DA_LINHA) - FOLGA);
  const ultima = Math.min(linhas.length, Math.ceil((rolagem.topo + rolagem.altura) / ALTURA_DA_LINHA) + FOLGA);

  return (
    <section className={estilos.painel} aria-labelledby={idDoTitulo}>
      <div className={estilos.cabecalho}>
        <h2 id={idDoTitulo} className={estilos.titulo}>
          {textos.paineis.camadas.titulo}
        </h2>
        <span className={estilos.espaco} />
        <button type="button" className={estilos.acao} disabled={!podeAgrupar} title={textos.camadas.atalhoDeAgrupar} aria-label={textos.camadas.agrupar} onClick={() => agruparSelecao(ambiente)}>
          <span aria-hidden="true">▣</span>
        </button>
        <button
          type="button"
          className={estilos.acao}
          disabled={!podeDesagrupar}
          title={textos.camadas.atalhoDeDesagrupar}
          aria-label={textos.camadas.desagrupar}
          onClick={() => desagruparSelecao(ambiente)}
        >
          <span aria-hidden="true">▢</span>
        </button>
        <button type="button" className={estilos.acao} disabled={!podeReordenar(1)} title={textos.camadas.atalhoParaAFrente} aria-label={textos.camadas.paraAFrente} onClick={() => reordenar(1)}>
          <span aria-hidden="true">↑</span>
        </button>
        <button type="button" className={estilos.acao} disabled={!podeReordenar(-1)} title={textos.camadas.atalhoParaTras} aria-label={textos.camadas.paraTras} onClick={() => reordenar(-1)}>
          <span aria-hidden="true">↓</span>
        </button>
      </div>
      {linhas.length === 0 ? (
        <p className={estilos.vazio}>{textos.paineis.camadas.vazio}</p>
      ) : (
        <div ref={caixaRef} className={estilos.rolagem} onScroll={(e) => setRolagem({ topo: e.currentTarget.scrollTop, altura: e.currentTarget.clientHeight || ALTURA_PADRAO })}>
          <div
            role="tree"
            tabIndex={0}
            aria-label={textos.paineis.camadas.titulo}
            aria-multiselectable="true"
            aria-activedescendant={indiceAtivo >= 0 ? `${prefixo}-${linhas[indiceAtivo]?.id}` : undefined}
            className={estilos.arvore}
            style={{ height: linhas.length * ALTURA_DA_LINHA }}
            onKeyDown={aoTeclar}
            // O Shift+clique do navegador estende a seleção de texto da página, e arrastar em cima
            // dela começa um arraste nativo que cancela o ponteiro. Aqui ele é só da seleção de camadas.
            onMouseDown={(e) => {
              if (!e.shiftKey || e.target instanceof HTMLInputElement) return;
              e.preventDefault();
              e.currentTarget.focus({ preventScroll: true });
            }}
            onDragStart={(e) => e.preventDefault()}
          >
            {linhas.slice(primeira, ultima).map((linha, i) => (
              <LinhaDaArvore
                key={linha.id}
                linha={linha}
                idNoDom={`${prefixo}-${linha.id}`}
                ativa={selecionada(selecao, linha)}
                recolhida={recolhidos.has(linha.id)}
                travado={travado}
                renomeando={renomeando === linha.id}
                semFonte={linha.tipo === 'no' && semFonte.has(linha.caminho)}
                doOtto={tocados.has(linha.id)}
                destino={destino?.id === linha.id ? destino.onde : null}
                aoApertar={apertar}
                aoPassar={passar}
                topo={(primeira + i) * ALTURA_DA_LINHA}
                ambiente={ambiente}
                aoAlternarGrupo={alternarGrupo}
                aoRenomear={renomear}
              />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
