// De onde o editor tira a peça, os recursos e para onde manda cada lote. Em /editor/p/[id] é a
// API; na bancada de desenvolvimento, um documento de exemplo local. O editor não sabe qual é.
import { ListaDeFontes } from '@otto/shared';
import { criarCliente } from '../api/cliente';
import { type ApiDeLotes, criarApiDeLotes } from '../api/lotes';
import { criarApiDePecas, type ResultadoDeAbrir } from '../api/pecas';
import type { FamiliaDeFonte } from './ambiente';
import type { RecursosDoRender } from './canvas/motor';
import { criarRecursosDoRender } from './canvas/recursos';

export interface FonteDaPeca {
  abrir(id: string): Promise<ResultadoDeAbrir>;
  /** Envio de lote, desfazer e refazer. Ausente: a peça abre SÓ PARA LEITURA. */
  lotes?: ApiDeLotes;
  /** Bytes de imagem e de fonte para o motor. */
  recursos: RecursosDoRender;
  listarFontes(): Promise<FamiliaDeFonte[]>;
}

export function criarFonteDaApi(pecaId: string): FonteDaPeca {
  const cliente = criarCliente();
  let fontes: Promise<FamiliaDeFonte[]> | undefined;
  return {
    abrir: criarApiDePecas(cliente).abrir,
    lotes: criarApiDeLotes(cliente, pecaId),
    recursos: criarRecursosDoRender(),
    listarFontes() {
      // a biblioteca não muda durante a sessão: uma busca só. Se falhar, a próxima chamada tenta de novo
      fontes ??= cliente.ler(ListaDeFontes, '/api/fontes').then((r) => {
        if (!r.ok) fontes = undefined;
        return r.ok ? r.dados.itens : [];
      });
      return fontes;
    },
  };
}
