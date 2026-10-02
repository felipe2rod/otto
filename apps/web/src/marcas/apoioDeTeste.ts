// Serviços de mentira para os testes das telas de formulário (marcas e nova peça).
import type { DadosDaMarca, DadosDoBriefingSalvo, LimitesDeTarefa, Marca } from '@otto/shared';
import { type Mock, vi } from 'vitest';
import type { Servicos } from '../produto/servicos';

export const QUANDO = '2026-10-02T12:00:00.000Z';
export const SHA = 'a'.repeat(64);
export const SHB = 'b'.repeat(64);
export const ID_DA_MARCA = '0199a000-0000-7000-8000-00000000000a';
export const ID_DO_BRIEFING = '0199a000-0000-7000-8000-00000000000b';
export const ID_DA_PECA = '0199a000-0000-7000-8000-00000000000c';

export const CAFE: Marca = {
  id: ID_DA_MARCA,
  nome: 'Café Aurora',
  cores: { primaria: '#0f3b2c', destaque: '#f4c430' },
  fonteDeTitulo: 'DM Serif Display',
  fonteDeTexto: 'IBM Plex Sans',
  logo: { arquivo: SHA },
  rodape: '@cafeaurora',
  restricoes: ['nunca foto de pessoa'],
  criadaEm: QUANDO,
  alteradaEm: QUANDO,
};
export const LIMITES: LimitesDeTarefa = { podeEnviar: true, tarefasHoje: 2, tarefasPorDia: 30, naFila: 0, naFilaNoMaximo: 3 };

let seq = 0;
const novoId = () => `0199a000-0000-7000-8000-${String(++seq).padStart(12, '0')}`;

// biome-ignore lint/suspicious/noExplicitAny: o tipo de uma função qualquer, para o Mock
type Funcao = (...args: any[]) => any;
/** Cada chamada como mentira do vitest, para o teste conferir o que foi pedido. */
type Mentiras<T> = { [K in keyof T]: T[K] extends Funcao ? Mock<T[K]> : never };

type Parcial = { [K in keyof Servicos]?: K extends 'tarefas' ? Partial<ReturnType<Servicos['tarefas']>> : Partial<Servicos[K]> };

export function servicosDeMentira(parcial: Parcial = {}, inicial: { marcas?: Marca[] } = {}) {
  let marcas = [...(inicial.marcas ?? [])];
  const tarefas = {
    limites: vi.fn(async () => LIMITES as LimitesDeTarefa | undefined),
    daPeca: vi.fn(async () => ({ itens: [] }) as never),
    ...parcial.tarefas,
  };
  const servicos = {
    cadastros: {
      marcas: vi.fn(async () => marcas as Marca[] | undefined),
      salvarMarca: vi.fn(async (dados: DadosDaMarca, id?: string) => {
        const marca: Marca = { ...dados, id: id ?? novoId(), criadaEm: QUANDO, alteradaEm: QUANDO };
        marcas = id ? marcas.map((m) => (m.id === id ? marca : m)) : [...marcas, marca];
        return { ok: true as const, marca };
      }),
      apagarMarca: vi.fn(async (id: string) => {
        marcas = marcas.filter((m) => m.id !== id);
        return { ok: true as const };
      }),
      briefings: vi.fn(async () => [] as never),
      briefing: vi.fn(async () => undefined as never),
      salvarBriefing: vi.fn(async (dados: DadosDoBriefingSalvo, id?: string) => ({
        ok: true as const,
        briefing: { ...dados, id: id ?? ID_DO_BRIEFING, usos: 0, criadoEm: QUANDO, alteradoEm: QUANDO },
      })),
      apagarBriefing: vi.fn(async () => ({ ok: true as const })),
      ...parcial.cadastros,
    },
    arquivos: {
      enviarImagem: vi.fn(async () => ({ ok: true as const, arquivo: { sha256: SHB, largura: 800, altura: 600 } })),
      importarSvg: vi.fn(async (arquivo: File) => ({
        ok: true as const,
        no: { tipo: 'vetor' as const, moldura: [200, 100] as [number, number], caminhos: [{ d: 'M0 0Z' }] as never, origem: { arquivo: SHA, nome: arquivo.name } },
        avisos: [] as string[],
        miniatura: '<svg xmlns="http://www.w3.org/2000/svg"/>',
      })),
      dados: vi.fn(async (sha256: string) => ({ sha256, especie: 'imagem' as const, tipo: 'image/png', bytes: 10, largura: 800, altura: 600 })),
      vetor: vi.fn(async () => undefined),
      ...parcial.arquivos,
    },
    fontes: {
      catalogo: vi.fn(async () => [
        { familia: 'Anton', pesos: [400], naBiblioteca: true },
        { familia: 'Bitter', pesos: [400, 700], naBiblioteca: false },
      ]),
      trazer: vi.fn(async () => true),
      ...parcial.fontes,
    },
    imagens: {
      buscar: vi.fn(async () => ({ ok: false as const, codigo: 'banco_de_imagens_indisponivel' })),
      trazer: vi.fn(async () => ({ ok: false as const, codigo: 'imagem_nao_buscada' })),
      ...parcial.imagens,
    },
    pecas: {
      criar: vi.fn(async (nome?: string) => ({ ok: true as const, peca: { id: ID_DA_PECA, nome: nome ?? 'Sem título', formatos: 0, alteradoEm: QUANDO } })),
      criarComTarefa: vi.fn(async () => ({ ok: true as const, pecaId: ID_DA_PECA })),
      ...parcial.pecas,
    },
    tarefas: vi.fn(() => tarefas),
  };
  return {
    servicos: servicos as unknown as Servicos & { tarefas: Mock<Servicos['tarefas']> },
    cadastros: servicos.cadastros as unknown as Mentiras<Servicos['cadastros']>,
    arquivos: servicos.arquivos as unknown as Mentiras<Servicos['arquivos']>,
    fontes: servicos.fontes as unknown as Mentiras<Servicos['fontes']>,
    imagens: servicos.imagens as unknown as Mentiras<Servicos['imagens']>,
    pecas: servicos.pecas as unknown as Mentiras<Servicos['pecas']>,
    tarefas: tarefas as unknown as Mentiras<ReturnType<Servicos['tarefas']>>,
  };
}
