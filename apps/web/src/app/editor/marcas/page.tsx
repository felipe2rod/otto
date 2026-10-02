// Marcas: o cadastro do cliente do designer (docs/mvp/experiencia.md, 3.3). É de onde o formulário de
// briefing puxa o que não muda de uma peça para outra.
import type { Metadata } from 'next';
import { Marcas } from '../../../marcas/Marcas';
import { Pagina } from '../../../produto/Pagina';
import { marcas as textos } from '../../../textos/briefing';

export const metadata: Metadata = { title: textos.tituloDaPagina };

export default function PaginaDeMarcas() {
  return (
    <Pagina secao="marcas" titulo={textos.titulo}>
      <Marcas />
    </Pagina>
  );
}
