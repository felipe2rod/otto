// Topo do editor: caminho de volta para Peças, nome da peça, estado do salvamento, desfazer e
// refazer, e o que o canvas deixou de mostrar. Exportar ocupa o lugar dele e fica desligado até a
// fatia de exportação. Sem nome de modelo, token ou custo.
import { editor as textos } from '../../textos/editor';
import type { EstadoDaPecaAberta } from '../Editor';
import { type Armazem, useArmazem } from '../nucleo/armazem';
import { AvisosDoRender, type FaltasDoRender } from './AvisosDoRender';
import estilos from './BarraDoTopo.module.css';

export interface PropriedadesDoTopo {
  nomeDaPeca: string | undefined;
  estado: Pick<Armazem<EstadoDaPecaAberta>, 'obter' | 'assinar'>;
  faltas: Pick<Armazem<FaltasDoRender>, 'obter' | 'assinar'>;
  paineisVisiveis: boolean;
  aoAlternarPaineis: () => void;
  aoDesfazer: () => void;
  aoRefazer: () => void;
}

export function BarraDoTopo({ nomeDaPeca, estado, faltas, paineisVisiveis, aoAlternarPaineis, aoDesfazer, aoRefazer }: PropriedadesDoTopo) {
  const e = useArmazem(estado, (x) => x);
  const f = useArmazem(faltas, (x) => x);
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
          <li aria-current="page">{nomeDaPeca ?? textos.topo.pecaSemNome}</li>
        </ol>
      </nav>
      {nomeDaPeca !== undefined && (
        <span className={estilos.salvamento} role="status" data-estado={e.somenteLeitura ? 'leitura' : e.salvamento}>
          {e.somenteLeitura ? textos.topo.salvamento.leitura : textos.topo.salvamento[e.salvamento]}
        </span>
      )}
      <span className={estilos.espaco} />
      <AvisosDoRender faltas={f} />
      {/* versão 0 é a peça como nasceu: não há o que desfazer */}
      <button type="button" className={estilos.botao} disabled={!podeReverter || e.versao === 0} title={textos.topo.atalhoDeDesfazer} onClick={aoDesfazer}>
        {textos.topo.desfazer}
      </button>
      <button type="button" className={estilos.botao} disabled={!podeReverter || e.versao === 0} title={textos.topo.atalhoDeRefazer} onClick={aoRefazer}>
        {textos.topo.refazer}
      </button>
      {/* caminho de teclado para o que o Tab faz com o foco no canvas */}
      <button type="button" className={estilos.botao} aria-pressed={paineisVisiveis} title={textos.topo.dicaDosPaineis} onClick={aoAlternarPaineis}>
        {textos.topo.paineis}
      </button>
      <button type="button" className={estilos.botaoPrincipal} disabled>
        {textos.topo.exportar}
      </button>
    </header>
  );
}
