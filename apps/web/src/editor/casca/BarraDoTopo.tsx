// Topo do editor: caminho de volta para Peças, nome da peça, estado do salvamento, desfazer e
// refazer, o que o canvas deixou de mostrar e Exportar, com o andamento da exportação quando há
// uma. Sem nome de modelo, token ou custo.
import { useRef, useState } from 'react';
import { editor as textos } from '../../textos/editor';
import { exportar as textosDeExportar } from '../../textos/exportar';
import type { EstadoDaPecaAberta } from '../Editor';
import type { EstadoDoExportador, Exportador } from '../exportar/exportador';
import { type Armazem, useArmazem } from '../nucleo/armazem';
import type { Historico } from '../nucleo/sessaoDoDocumento';
import { AvisosDoRender, type FaltasDoRender } from './AvisosDoRender';
import estilos from './BarraDoTopo.module.css';

export interface PropriedadesDoTopo {
  nomeDaPeca: string | undefined;
  estado: Pick<Armazem<EstadoDaPecaAberta>, 'obter' | 'assinar'>;
  /** Se há o que desfazer e refazer, como a API disse. */
  historico: Pick<Armazem<Historico>, 'obter' | 'assinar'>;
  faltas: Pick<Armazem<FaltasDoRender>, 'obter' | 'assinar'>;
  /** Abrir a tela de exportar. Ausente: não há por onde exportar, e o botão fica desligado. */
  aoExportar?: () => void;
  exportador?: Exportador;
  paineisVisiveis: boolean;
  aoAlternarPaineis: () => void;
  aoDesfazer: () => void;
  aoRefazer: () => void;
  /** Renomear a peça. Ausente: o nome é só texto. */
  aoRenomear?: (nome: string) => void;
}

export function BarraDoTopo({ nomeDaPeca, estado, historico, faltas, aoExportar, exportador, paineisVisiveis, aoAlternarPaineis, aoDesfazer, aoRefazer, aoRenomear }: PropriedadesDoTopo) {
  const [renomeando, setRenomeando] = useState(false);
  const e = useArmazem(estado, (x) => x);
  const f = useArmazem(faltas, (x) => x);
  const h = useArmazem(historico, (x) => x);
  // com lote por confirmar a versão ainda não é a do servidor: desfazer espera a fila esvaziar
  const podeReverter = nomeDaPeca !== undefined && !e.somenteLeitura && e.pendentes === 0 && e.salvamento !== 'sem-conexao';
  return (
    <header className={estilos.topo}>
      <a className={estilos.marca} href="/editor">
        {textos.topo.marca}
      </a>
      <nav aria-label={textos.topo.caminho}>
        <ol className={estilos.caminho}>
          <li>
            <a href="/editor">{textos.topo.pecas}</a>
          </li>
          <li aria-current="page">
            {nomeDaPeca !== undefined && aoRenomear && renomeando ? (
              <CampoDoNome nome={nomeDaPeca} aoConfirmar={aoRenomear} aoFechar={() => setRenomeando(false)} />
            ) : nomeDaPeca !== undefined && aoRenomear ? (
              <button type="button" className={estilos.nome} aria-label={textos.topo.renomear(nomeDaPeca)} title={textos.topo.renomear(nomeDaPeca)} onClick={() => setRenomeando(true)}>
                {nomeDaPeca}
              </button>
            ) : (
              (nomeDaPeca ?? textos.topo.pecaSemNome)
            )}
          </li>
        </ol>
      </nav>
      {nomeDaPeca !== undefined && (
        <span className={estilos.salvamento} role="status" data-estado={e.somenteLeitura ? 'leitura' : e.salvamento}>
          {e.somenteLeitura ? textos.topo.salvamento.leitura : textos.topo.salvamento[e.salvamento]}
        </span>
      )}
      <span className={estilos.espaco} />
      <AvisosDoRender faltas={f} />
      <button type="button" className={estilos.botao} disabled={!podeReverter || !h.podeDesfazer} title={textos.topo.atalhoDeDesfazer} onClick={aoDesfazer}>
        {textos.topo.desfazer}
      </button>
      <button type="button" className={estilos.botao} disabled={!podeReverter || !h.podeRefazer} title={textos.topo.atalhoDeRefazer} onClick={aoRefazer}>
        {textos.topo.refazer}
      </button>
      {/* caminho de teclado para o que o Tab faz com o foco no canvas */}
      <button type="button" className={estilos.botao} aria-pressed={paineisVisiveis} title={textos.topo.dicaDosPaineis} onClick={aoAlternarPaineis}>
        {textos.topo.paineis}
      </button>
      {exportador && aoExportar && <AndamentoDaExportacao exportador={exportador} aoAbrir={aoExportar} />}
      <button type="button" className={estilos.botaoPrincipal} data-abre-exportar="" disabled={nomeDaPeca === undefined || !aoExportar} onClick={aoExportar}>
        {textos.topo.exportar}
      </button>
    </header>
  );
}

function fraseDaExportacao(e: EstadoDoExportador): string | undefined {
  const t = textosDeExportar.topo;
  if (e.fase === 'pedindo') return t.pedindo;
  if (e.fase === 'andando') return t.andando(e.exportacao.progresso.pranchetasProntas, e.exportacao.progresso.pranchetasNoTotal);
  if (e.fase === 'terminou') return e.exportacao.falhas.length > 0 ? t.emParte : t.pronto;
  if (e.fase === 'falhou') return t.falhou;
  return undefined;
}

/**
 * A exportação continua com o diálogo fechado. Aqui o topo diz onde ela está, e o clique leva de
 * volta aos arquivos. A região é anunciada: "Arquivos prontos" chega a quem não está olhando.
 */
function AndamentoDaExportacao({ exportador, aoAbrir }: { exportador: Exportador; aoAbrir: () => void }) {
  const e = useArmazem(exportador.armazem, (x) => x);
  const frase = fraseDaExportacao(e);
  return (
    <span role="status">
      {frase && (
        <button type="button" className={estilos.exportacao} data-fase={e.fase} title={textosDeExportar.topo.abrir} onClick={aoAbrir}>
          {frase}
        </button>
      )}
    </span>
  );
}

/** O nome da peça em edição: Enter ou sair confirma, Esc desiste. */
function CampoDoNome({ nome, aoConfirmar, aoFechar }: { nome: string; aoConfirmar: (nome: string) => void; aoFechar: () => void }) {
  const [rascunho, setRascunho] = useState(nome);
  const desistiu = useRef(false);
  const confirmar = () => {
    if (!desistiu.current && rascunho.trim() !== '' && rascunho.trim() !== nome) aoConfirmar(rascunho.trim());
    aoFechar();
  };
  return (
    <input
      className={estilos.campoDoNome}
      aria-label={textos.topo.nomeDaPeca}
      value={rascunho}
      maxLength={120}
      // biome-ignore lint/a11y/noAutofocus: o campo nasce de um clique no nome; o foco precisa ir para ele
      autoFocus
      onChange={(e) => setRascunho(e.target.value)}
      onBlur={confirmar}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') {
          desistiu.current = true;
          aoFechar();
        }
      }}
    />
  );
}
