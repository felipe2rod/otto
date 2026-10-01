// O núcleo é puro (ADR 008, ADR 020): documento, render, psd, agente e shared não importam
// NestJS, Prisma, Next, React nem driver de banco. Os que rodam no navegador não tocam módulo do Node.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { arquivosDeCodigo, importsDe, ler, PACOTES_DO_NUCLEO, RAIZ, relativo, violacoesDoNucleo } from './varredura';

describe('o núcleo não importa framework', () => {
  for (const pacote of PACOTES_DO_NUCLEO) {
    const pasta = path.join(RAIZ, 'packages', pacote);
    // psd e agente ainda não existem na fatia 0: entram sozinhos nesta suíte quando a pasta nascer
    it.skipIf(!existsSync(pasta))(`packages/${pacote}: nenhum import proibido no código`, () => {
      const violacoes = arquivosDeCodigo(pasta).flatMap((arquivo) => violacoesDoNucleo(pacote, importsDe(ler(arquivo))).map((modulo) => `${relativo(arquivo)} importa ${modulo}`));
      expect(violacoes).toEqual([]);
    });

    it.skipIf(!existsSync(pasta))(`packages/${pacote}: nenhuma dependência proibida no package.json`, () => {
      const manifesto = JSON.parse(readFileSync(path.join(pasta, 'package.json'), 'utf8')) as { dependencies?: Record<string, string>; peerDependencies?: Record<string, string> };
      const dependencias = Object.keys({ ...manifesto.dependencies, ...manifesto.peerDependencies });
      // módulo do Node não aparece em package.json: aqui só valem as proibições de framework
      expect(violacoesDoNucleo('render', dependencias)).toEqual([]);
    });
  }

  it('pelo menos documento, render e shared existem (a suíte não passa por falta do que conferir)', () => {
    for (const pacote of ['documento', 'render', 'shared']) expect(arquivosDeCodigo(path.join(RAIZ, 'packages', pacote)).length).toBeGreaterThan(0);
  });
});
