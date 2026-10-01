// Comandos sobre a seleção que nascem em mais de um lugar (atalho do teclado e botão do painel de
// Camadas): montam o lote, aplicam pelo caminho único do editor e ajustam a seleção ao resultado.
import { editor as textos } from '../../textos/editor';
import type { AmbienteDoEditor } from '../ambiente';
import { camadasNovas, loteDeAgrupar, loteDeDesagrupar, loteDeDuplicar } from './acoes';

type Ambiente = Pick<AmbienteDoEditor, 'documento' | 'interface' | 'aplicar' | 'avisar'>;

/** Aplica o lote e seleciona as camadas que ele criou (a cópia, o grupo novo), como no Photoshop. */
function aplicarESelecionarAsNovas(a: Ambiente, lote: Parameters<Ambiente['aplicar']>[0]): boolean {
  const antes = a.documento.obter();
  if (!antes || !a.aplicar(lote)) return false;
  const depois = a.documento.obter();
  const novas = depois ? camadasNovas(antes, depois) : [];
  if (novas.length > 0) a.interface.selecionar({ tipo: 'camadas', ids: novas });
  return true;
}

/** Ctrl+J. Devolve false se não havia o que duplicar. */
export function duplicarSelecao(a: Ambiente): boolean {
  const doc = a.documento.obter();
  const lote = doc && loteDeDuplicar(doc, a.interface.armazem.obter().selecao);
  return lote ? aplicarESelecionarAsNovas(a, lote) : false;
}

/** Ctrl+G. */
export function agruparSelecao(a: Ambiente): boolean {
  const doc = a.documento.obter();
  const lote = doc && loteDeAgrupar(doc, a.interface.armazem.obter().selecao);
  if (!lote) return false;
  if (lote === 'niveis-diferentes') {
    a.avisar(textos.avisos.agruparNoMesmoNivel);
    return false;
  }
  return aplicarESelecionarAsNovas(a, lote);
}

/** Ctrl+Shift+G. As camadas que saem do grupo ficam selecionadas. */
export function desagruparSelecao(a: Ambiente): boolean {
  const doc = a.documento.obter();
  const r = doc && loteDeDesagrupar(doc, a.interface.armazem.obter().selecao);
  if (!r || !a.aplicar(r.lote)) return false;
  a.interface.selecionar({ tipo: 'camadas', ids: r.soltas });
  return true;
}
