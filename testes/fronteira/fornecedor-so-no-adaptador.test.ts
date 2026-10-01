// Nenhum nome de fornecedor fora do adaptador (ADR 020, item 1). O nome pode aparecer em quatro
// lugares: arquivo do adaptador, configuração do módulo que escolhe o adaptador, variável de
// ambiente e migração. Aqui se conferem os dois primeiros; os outros dois não são código.
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { arquivosDeCodigo, ler, nomesDeFornecedorEm, RAIZ, relativo } from './varredura';

const PASTAS = ['apps/api/src', 'apps/web/src', 'apps/web/app', 'packages/documento/src', 'packages/render/src', 'packages/psd/src', 'packages/agente/src', 'packages/shared/src'];

/** Onde o nome de fornecedor é permitido. */
const PERMITIDO = [/\/adaptadores\//, /^apps\/api\/src\/plataforma\/config\//];

describe('nome de fornecedor só em adaptador', () => {
  it('nenhum arquivo fora de adaptadores/ e da configuração cita fornecedor', () => {
    const violacoes = PASTAS.flatMap((pasta) => arquivosDeCodigo(path.join(RAIZ, pasta)))
      .filter((arquivo) => !PERMITIDO.some((p) => p.test(relativo(arquivo))))
      .flatMap((arquivo) => nomesDeFornecedorEm(ler(arquivo)).map((nome) => `${relativo(arquivo)} cita "${nome}"`));
    expect(violacoes).toEqual([]);
  });
});
