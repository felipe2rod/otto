// O que o Otto alcança durante uma tarefa além da peça: banco de imagens, texturas e catálogo de fontes.
// São as portas opcionais do ciclo (@otto/agente, portas.ts): ausente aqui, o ciclo nem recebe a ferramenta.
// Quem implementa são os casos de uso de cada módulo; a tarefa só os chama sob a conta do trabalho.
import type { FamiliaDeFonte, TexturaDaBiblioteca } from '@otto/agente';
import type { OrientacaoDeImagem } from '@otto/shared';
import type { EscopoDaConta } from '../../plataforma/escopo/escopo-da-conta';

export interface ImagensDoOtto {
  /** A busca no banco de imagens, com o cache e os limites de qualquer busca. */
  buscar(
    escopo: EscopoDaConta,
    consulta: string,
    orientacao: OrientacaoDeImagem,
  ): Promise<{ banco: string; itens: { id: string; descricao: string; largura: number; altura: number; autor: string }[] }>;
  /** Traz a imagem para o armazenamento da conta e devolve o nó pronto para criarNo. */
  trazer(escopo: EscopoDaConta, banco: string, id: string): Promise<{ sha256: string; largura: number; altura: number; no: Record<string, unknown> }>;
}

export interface TexturasDoOtto {
  paraOOtto(escopo: EscopoDaConta): Promise<TexturaDaBiblioteca[]>;
}

export interface FontesDoOtto {
  /** O catálogo de onde a biblioteca traz família sob demanda. */
  buscar(consulta: string, categoria?: string): Promise<FamiliaDeFonte[]>;
}
