// Editor da peça. Este arquivo é só a casca no servidor: o editor inteiro é carregado no
// navegador, por import() dinâmico, e busca a peça de lá, em paralelo com o motor.
import { CarregadorDoEditor } from '../../../../editor/CarregadorDoEditor';

export default async function PaginaDoEditor({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CarregadorDoEditor pecaId={id} />;
}
