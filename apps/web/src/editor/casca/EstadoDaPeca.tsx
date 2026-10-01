// O que o centro diz enquanto a peça não está aberta. Fica por cima do canvas, que já está montado:
// o motor carrega em paralelo com a peça.
import { editor as textos } from '../../textos/editor';
import estilos from './EstadoDaPeca.module.css';

export type SituacaoDaPeca = { estado: 'abrindo' } | { estado: 'aberta'; nome: string } | { estado: 'nao_encontrada' } | { estado: 'erro'; codigo: string };

export function EstadoDaPeca({ situacao, aoTentarDeNovo }: { situacao: SituacaoDaPeca; aoTentarDeNovo: () => void }) {
  if (situacao.estado === 'aberta') return null;
  if (situacao.estado === 'abrindo') {
    return (
      <p className={estilos.abrindo} aria-live="polite">
        {textos.canvas.abrindo}
      </p>
    );
  }
  return (
    <div className={estilos.cartao} role="alert">
      <p>{situacao.estado === 'nao_encontrada' ? textos.canvas.naoEncontrada : textos.canvas.naoAbriu}</p>
      <div className={estilos.acoes}>
        {situacao.estado === 'erro' && (
          <button type="button" onClick={aoTentarDeNovo}>
            {textos.canvas.tentarDeNovo}
          </button>
        )}
        <a href="/editor">{textos.canvas.voltarParaPecas}</a>
      </div>
    </div>
  );
}
