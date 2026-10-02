// Banco de imagens (ADR 032) e catálogo de fontes (docs/mvp/backend.md, 17.12).
// O editor não conhece banco nem catálogo pelo nome: mostra o `nome` que o servidor devolve e manda de
// volta o `id`. A prévia é rota nossa; o endereço do arquivo no banco nunca chega aqui.
import {
  FonteDaBiblioteca,
  type FonteDaLista,
  ImagemTrazida,
  ListaDeFontes,
  ListaDeTexturas,
  type OrientacaoDeImagem,
  type PedidoDeTrazerImagem,
  ResultadoDaBuscaDeImagens,
  type Textura,
  TexturaTrazida,
} from '@otto/shared';
import { type Feito, recusa } from './cadastros';
import type { Cliente } from './cliente';

export interface ApiDeImagens {
  buscar(texto: string, orientacao: OrientacaoDeImagem): Promise<Feito<{ resultado: ResultadoDaBuscaDeImagens }>>;
  /** A imagem vira arquivo da conta. Só vale para resultado de busca das últimas 24 horas. */
  trazer(pedido: PedidoDeTrazerImagem): Promise<Feito<{ imagem: ImagemTrazida }>>;
}

export function criarApiDeImagens(cliente: Cliente): ApiDeImagens {
  return {
    async buscar(texto, orientacao) {
      const r = await cliente.ler(ResultadoDaBuscaDeImagens, `/api/imagens/busca?q=${encodeURIComponent(texto.trim())}&orientacao=${orientacao}`);
      return r.ok ? { ok: true, resultado: r.dados } : recusa(r);
    },
    async trazer(pedido) {
      const r = await cliente.escrever(ImagemTrazida, 'POST', '/api/imagens/trazer', pedido);
      return r.ok ? { ok: true, imagem: r.dados } : recusa(r);
    },
  };
}

export interface ApiDeFontes {
  /** A biblioteca e o catálogo: `naBiblioteca: false` é família que ainda não foi baixada. */
  catalogo(): Promise<FonteDaLista[]>;
  /** Pede a família; na primeira vez o servidor a baixa (segundos). Verdadeiro se ela está na biblioteca depois disso. */
  trazer(familia: string, peso: number): Promise<boolean>;
}

export function criarApiDeFontes(cliente: Cliente): ApiDeFontes {
  return {
    async catalogo() {
      const r = await cliente.ler(ListaDeFontes, '/api/fontes?catalogo=1');
      return r.ok ? r.dados.itens : [];
    },
    async trazer(familia, peso) {
      return (await cliente.ler(FonteDaBiblioteca, `/api/fontes/${encodeURIComponent(familia)}/${peso}`)).ok;
    },
  };
}

export interface ApiDeTexturas {
  /** Indefinido se a leitura falhou. */
  listar(): Promise<Textura[] | undefined>;
  /** A textura vira arquivo da conta; o nó volta pronto, com o modo de mesclagem e a opacidade de costume. */
  trazer(nome: string): Promise<Feito<{ textura: TexturaTrazida }>>;
}

export function criarApiDeTexturas(cliente: Cliente): ApiDeTexturas {
  return {
    async listar() {
      const r = await cliente.ler(ListaDeTexturas, '/api/texturas');
      return r.ok ? r.dados.itens : undefined;
    },
    async trazer(nome) {
      const r = await cliente.escrever(TexturaTrazida, 'POST', `/api/texturas/${encodeURIComponent(nome)}/trazer`, {});
      return r.ok ? { ok: true, textura: r.dados } : recusa(r);
    },
  };
}
