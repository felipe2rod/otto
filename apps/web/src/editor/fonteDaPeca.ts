// De onde o editor tira a peça, os recursos e para onde manda cada lote. Em /editor/p/[id] é a
// API; na bancada de desenvolvimento, um documento de exemplo local. O editor não sabe qual é.
import { criarApiDeArquivos, type EnvioDeArquivos } from '../api/arquivos';
import { criarCliente } from '../api/cliente';
import { type ApiDeExportacoes, criarApiDeExportacoes } from '../api/exportacoes';
import { type ApiDeImagens, type ApiDeTexturas, criarApiDeFontes, criarApiDeImagens, criarApiDeTexturas } from '../api/imagens';
import { type ApiDeLotes, criarApiDeLotes } from '../api/lotes';
import { criarApiDePecas, type ResultadoDeAbrir } from '../api/pecas';
import { type ApiDeTarefas, criarApiDeTarefas } from '../api/tarefas';
import type { FamiliaDeFonte } from './ambiente';
import type { RecursosDoRender } from './canvas/motor';
import { criarRecursosDoRender } from './canvas/recursos';

export interface FonteDaPeca {
  abrir(id: string): Promise<ResultadoDeAbrir>;
  /** Envio de lote, desfazer e refazer. Ausente: a peça abre SÓ PARA LEITURA. */
  lotes?: ApiDeLotes;
  /** Envio de imagem e importação de SVG. Ausente: não dá para inserir arquivo. */
  arquivos?: EnvioDeArquivos;
  /** Relatório, pedido e consulta de exportação. Ausente: o botão Exportar fica desligado. */
  exportacoes?: ApiDeExportacoes;
  /** A tarefa do Otto: pedir, acompanhar, o "pode" e a revisão. Ausente: o painel do Otto fica vazio. */
  tarefas?: ApiDeTarefas;
  /** Renomear a peça (o nome é do registro, não da árvore). Ausente: o nome não se troca daqui. */
  renomear?(id: string, nome: string): Promise<{ ok: true; nome: string } | { ok: false; codigo: string }>;
  /** Busca no banco de imagens e trazer para a conta. Ausente: o editor não oferece a busca. */
  imagens?: ApiDeImagens;
  /** As texturas da biblioteca. Ausente: o editor não as oferece. */
  texturas?: ApiDeTexturas;
  /** Bytes de imagem e de fonte para o motor. */
  recursos: RecursosDoRender;
  /** A biblioteca e, se houver, o catálogo (`naBiblioteca: false` é o que ainda não foi baixado). */
  listarFontes(): Promise<FamiliaDeFonte[]>;
  /** Traz uma família do catálogo. Ausente: só há a biblioteca. */
  trazerFonte?(familia: string, peso: number): Promise<boolean>;
}

export function criarFonteDaApi(pecaId: string): FonteDaPeca {
  const cliente = criarCliente();
  let fontes: Promise<FamiliaDeFonte[]> | undefined;
  const pecas = criarApiDePecas(cliente);
  const catalogo = criarApiDeFontes(cliente);
  return {
    abrir: pecas.abrir,
    renomear: pecas.renomear,
    arquivos: criarApiDeArquivos(cliente),
    exportacoes: criarApiDeExportacoes(cliente, pecaId),
    tarefas: criarApiDeTarefas(cliente, pecaId),
    lotes: criarApiDeLotes(cliente, pecaId),
    imagens: criarApiDeImagens(cliente),
    texturas: criarApiDeTexturas(cliente),
    recursos: criarRecursosDoRender(),
    listarFontes() {
      // uma busca só por sessão; lista vazia é falha (a biblioteca nunca é vazia): a próxima chamada tenta de novo
      fontes ??= catalogo.catalogo().then((itens) => {
        if (itens.length === 0) fontes = undefined;
        return itens;
      });
      return fontes;
    },
    async trazerFonte(familia, peso) {
      const chegou = await catalogo.trazer(familia, peso);
      // dali em diante ela é da biblioteca, para quem listar de novo
      if (chegou && fontes) fontes = fontes.then((lista) => lista.map((f) => (f.familia === familia ? { ...f, naBiblioteca: true } : f)));
      return chegou;
    },
  };
}
