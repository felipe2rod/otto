// Importar um PSD: enviar o arquivo, decidir o que fazer com as fontes e acompanhar até a peça abrir
// (ADR 028, item 4). A casca é do servidor; a tela é de cliente e fala com a API de lá. Esta rota não
// carrega o editor nem o motor de render.
import type { Metadata } from 'next';
import { ImportarPsd } from '../../../importar/ImportarPsd';
import { Pagina } from '../../../produto/Pagina';
import { importar as textos } from '../../../textos/importar';

export const metadata: Metadata = { title: textos.tituloDaPagina };

export default function PaginaDeImportar() {
  return (
    <Pagina titulo={textos.titulo}>
      <ImportarPsd />
    </Pagina>
  );
}
