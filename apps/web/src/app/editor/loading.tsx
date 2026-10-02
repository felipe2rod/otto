// Enquanto o servidor busca a lista: cartões-esqueleto na mesma grade (experiencia.md, 3.2).

import { Pagina } from '../../produto/Pagina';
import estilos from '../../produto/Pagina.module.css';
import { pecas as textos } from '../../textos/pecas';

export default function CarregandoPecas() {
  return (
    <Pagina secao="pecas" titulo={textos.titulo} ocupada>
      <p className={estilos.carregando} role="status">
        {textos.carregando}
      </p>
      <div className={estilos.esqueletos} aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
      </div>
    </Pagina>
  );
}
