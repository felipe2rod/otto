// Painel lateral: título fixo e corpo com rolagem. Sem conteúdo, mostra o estado vazio.
import { type ReactNode, useId } from 'react';
import estilos from './Painel.module.css';

export interface PropriedadesDoPainel {
  titulo: string;
  /** O que o painel diz quando não tem o que mostrar. */
  vazio: string;
  children?: ReactNode;
  /** O painel do Otto usa o título em serifa: é a entidade, não uma seção. */
  destaque?: boolean;
  /** Ocupa a altura que sobrar na coluna. */
  cresce?: boolean;
}

export function Painel({ titulo, vazio, children, destaque = false, cresce = false }: PropriedadesDoPainel) {
  const id = useId();
  return (
    <section className={estilos.painel} aria-labelledby={id} data-cresce={cresce ? 'sim' : undefined}>
      <div className={estilos.cabecalho}>
        <h2 id={id} className={destaque ? estilos.tituloEmDestaque : estilos.titulo}>
          {titulo}
        </h2>
      </div>
      <div className={estilos.corpo}>{children ?? <p className={estilos.vazio}>{vazio}</p>}</div>
    </section>
  );
}
