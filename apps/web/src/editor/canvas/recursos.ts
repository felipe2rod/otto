// A porta de recursos que o editor entrega ao motor: bytes de imagem e de fonte, buscados na
// mesma origem (docs/mvp/backend.md, seção 7.4). O motor decodifica por dentro; decodificar pelo
// navegador quebra a paridade em imagem com transparência (docs/tecnico/spike-render.md, 3.3).
import type { RecursosDoRender } from './motor';

type Buscar = (endereco: string) => Promise<Response>;

export function criarRecursosDoRender(buscar: Buscar = (endereco) => fetch(endereco)): RecursosDoRender {
  const bytes = async (endereco: string): Promise<ArrayBuffer> => {
    const resposta = await buscar(endereco);
    if (!resposta.ok) throw new Error(`recurso do render: ${resposta.status} em ${endereco}`);
    return resposta.arrayBuffer();
  };
  return {
    imagem: (hash) => bytes(`/api/arquivos/${encodeURIComponent(hash)}`),
    fonte: (familia, peso) => bytes(`/api/fontes/${encodeURIComponent(familia)}/${peso}/arquivo`),
  };
}
