// Nova peça: o formulário de briefing, que é o caminho padrão para criar (ADR 033; experiencia.md, 3.4).
// A casca é do servidor; o formulário é de cliente e fala com a API de lá. Esta rota não carrega o
// editor nem o motor de render: é só formulário.
//
//   /editor/novo                 formulário em branco (ou o rascunho deste navegador)
//   /editor/novo?briefing=<id>   a partir de um briefing salvo
//   /editor/novo?peca=<id>       "nova peça com este briefing": o briefing que gerou aquela peça
//   /editor/novo?marca=<id>      em branco, com a marca escolhida
import type { Metadata } from 'next';
import { NovaPeca } from '../../../briefing/NovaPeca';
import { Pagina } from '../../../produto/Pagina';
import { briefing as textos } from '../../../textos/briefing';

export const metadata: Metadata = { title: textos.tituloDaPagina };

const um = (valor: string | string[] | undefined): string | undefined => (Array.isArray(valor) ? valor[0] : valor);

export default async function PaginaDeNovaPeca({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const consulta = await searchParams;
  const [briefingId, pecaId, marcaId] = [um(consulta.briefing), um(consulta.peca), um(consulta.marca)];
  return (
    <Pagina titulo={textos.titulo}>
      <NovaPeca origem={{ ...(briefingId ? { briefingId } : {}), ...(pecaId ? { pecaId } : {}), ...(marcaId ? { marcaId } : {}) }} />
    </Pagina>
  );
}
