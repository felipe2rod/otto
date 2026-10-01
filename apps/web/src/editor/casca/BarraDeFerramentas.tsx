// Barra de ferramentas: três itens. É pouco e é honesto: não há ferramenta de texto que não cria
// texto. A barra existe para as próximas entrarem no lugar esperado (experiencia.md, 4.1).
import { editor as textos } from '../../textos/editor';
import { useArmazem } from '../nucleo/armazem';
import type { Ferramenta, Interface } from '../nucleo/interface';
import estilos from './BarraDeFerramentas.module.css';

const FERRAMENTAS: readonly Ferramenta[] = ['mover', 'mao', 'zoom'];

export function BarraDeFerramentas({ interface: iface }: { interface: Interface }) {
  const ativa = useArmazem(iface.armazem, (e) => e.ferramenta);
  return (
    <div className={estilos.barra} role="toolbar" aria-label={textos.ferramentas.rotulo} aria-orientation="vertical">
      {FERRAMENTAS.map((ferramenta) => {
        const { nome, tecla } = textos.ferramentas[ferramenta];
        const rotulo = textos.ferramentas.comTecla(nome, tecla);
        return (
          <button
            key={ferramenta}
            type="button"
            className={estilos.ferramenta}
            aria-label={rotulo}
            title={rotulo}
            aria-pressed={ativa === ferramenta}
            onClick={() => iface.escolherFerramenta(ferramenta)}
          >
            <span aria-hidden="true">{tecla}</span>
          </button>
        );
      })}
    </div>
  );
}
