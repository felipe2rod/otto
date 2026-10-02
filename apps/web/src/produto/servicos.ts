// As chamadas de API que as telas de formulário usam, juntas, para o teste trocar por mentiras.
import { type ApiDeArquivos, criarApiDeArquivos } from '../api/arquivos';
import { type ApiDeCadastros, criarApiDeCadastros } from '../api/cadastros';
import { criarCliente } from '../api/cliente';
import { type ApiDeFontes, type ApiDeImagens, criarApiDeFontes, criarApiDeImagens } from '../api/imagens';
import { type ApiDePecas, criarApiDePecas } from '../api/pecas';
import { type ApiDeTarefas, criarApiDeTarefas } from '../api/tarefas';

export interface Servicos {
  cadastros: ApiDeCadastros;
  arquivos: ApiDeArquivos;
  fontes: ApiDeFontes;
  imagens: ApiDeImagens;
  pecas: Pick<ApiDePecas, 'criar' | 'criarComTarefa'>;
  /** As tarefas de uma peça. Os limites da conta não dependem da peça. */
  tarefas(pecaId: string): Pick<ApiDeTarefas, 'limites' | 'daPeca'>;
}

export function criarServicos(): Servicos {
  const cliente = criarCliente();
  return {
    cadastros: criarApiDeCadastros(cliente),
    arquivos: criarApiDeArquivos(cliente),
    fontes: criarApiDeFontes(cliente),
    imagens: criarApiDeImagens(cliente),
    pecas: criarApiDePecas(cliente),
    tarefas: (pecaId) => criarApiDeTarefas(cliente, pecaId),
  };
}
