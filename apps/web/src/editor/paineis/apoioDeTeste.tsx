// Apoio dos testes de painel: um ambiente do editor de mentira, com documento, seleção e um
// `aplicar` que guarda os lotes pedidos e, se quiser, os aplica de verdade pelo catálogo.
import { aplicarLote, type Documento, documentoVazio } from '@otto/documento';
import type { ReactNode } from 'react';
import { vi } from 'vitest';
import { type AmbienteDoEditor, ProvedorDoEditor } from '../ambiente';
import { type FaltasDoRender, SEM_FALTAS } from '../casca/AvisosDoRender';
import type { LoteParaAplicar } from '../nucleo/acoes';
import { criarArmazem } from '../nucleo/armazem';
import { criarInterface } from '../nucleo/interface';

export function documentoDeTeste(operacoes: unknown[]): Documento {
  const r = aplicarLote(documentoVazio(), operacoes, { autoria: { tipo: 'designer' }, idDoLote: 'teste-de-painel' });
  if (!r.ok) throw new Error(`${r.erro.op}: ${r.erro.mensagem}`);
  return r.doc;
}

export function ambienteDeTeste(
  doc: Documento | undefined,
  opcoes: { somenteLeitura?: boolean; faltas?: FaltasDoRender; tocadosPeloOtto?: readonly string[]; trazerFonte?: (familia: string, peso: number) => Promise<boolean> } = {},
) {
  const documento = criarArmazem<Documento | undefined>(doc);
  const iface = criarInterface();
  const lotes: LoteParaAplicar[] = [];
  let n = 0;
  const ambiente: AmbienteDoEditor = {
    interface: iface,
    documento,
    somenteLeitura: criarArmazem(opcoes.somenteLeitura ?? false),
    aplicar(lote) {
      if (!lote) return false;
      lotes.push(lote);
      const atual = documento.obter();
      if (!atual) return false;
      const r = aplicarLote(atual, lote.operacoes, { autoria: { tipo: 'designer' }, idDoLote: `lote-de-teste-${++n}` });
      if (r.ok) documento.definir(r.doc);
      return r.ok;
    },
    faltas: criarArmazem<FaltasDoRender>(opcoes.faltas ?? SEM_FALTAS),
    avisar: vi.fn(),
    tocadosPeloOtto: criarArmazem<ReadonlySet<string>>(new Set(opcoes.tocadosPeloOtto ?? [])),
    trocarImagem: vi.fn(async () => undefined),
    inserirArquivos: vi.fn(async () => undefined),
    listarFontes: async () => [
      { familia: 'Anton', pesos: [400] },
      { familia: 'IBM Plex Sans', pesos: [400, 700] },
      // do catálogo, ainda não baixada
      { familia: 'Bitter', pesos: [400, 700], naBiblioteca: false },
    ],
    trazerFonte: vi.fn(opcoes.trazerFonte ?? (async () => true)),
    inserirImagemTrazida: vi.fn(() => true),
    inserirTextura: vi.fn(() => true),
  };
  const Moldura = ({ children }: { children: ReactNode }) => <ProvedorDoEditor ambiente={ambiente}>{children}</ProvedorDoEditor>;
  return { ambiente, iface, documento, lotes, Moldura };
}
