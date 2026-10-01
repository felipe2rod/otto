// Fronteira do escopo (ADR 023, item 6.4). Estático.
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { arquivosDeCodigo, ler, relativo } from '../../../../testes/fronteira/varredura';

const SRC = path.resolve(import.meta.dirname, '../../src');
const fontes = arquivosDeCodigo(SRC).filter((a) => !a.endsWith('.test.ts') && !a.endsWith('.contrato.ts'));
const fora = (pasta: string) => fontes.filter((a) => !relativo(a).startsWith(`apps/api/src/${pasta}/`));
const citam = (arquivos: string[], padrao: RegExp) => arquivos.filter((a) => padrao.test(ler(a))).map(relativo);

describe('fronteira do escopo', () => {
  it('há código para conferir', () => {
    expect(fontes.length).toBeGreaterThan(5);
  });

  it('o cliente do Prisma só é importado dentro de plataforma/persistencia', () => {
    expect(citam(fora('plataforma/persistencia'), /PrismaClient|@prisma\/client|@prisma\/adapter-pg|persistencia\/gerado/)).toEqual([]);
  });

  it('o driver do banco só é importado dentro de plataforma/persistencia e do adaptador da fila', () => {
    const permitido = (a: string) => relativo(a).startsWith('apps/api/src/plataforma/fila/adaptadores/pg-boss/');
    expect(
      citam(
        fora('plataforma/persistencia').filter((a) => !permitido(a)),
        /from\s+['"]pg['"]/,
      ),
    ).toEqual([]);
  });

  it('EscopoDaConta só é aberto dentro de plataforma/escopo (pela requisição ou pelo trabalho da fila)', () => {
    expect(citam(fora('plataforma/escopo'), /EscopoDaConta\.abrir\(/)).toEqual([]);
  });

  it('ninguém seta o escopo fora de transação: nada de set_config(..., false) nem de SET sem LOCAL', () => {
    expect(citam(fontes, /set_config\([^)]*,\s*false\s*\)/)).toEqual([]);
    expect(citam(fontes, /\bSET\s+(?!LOCAL\b)app\./i)).toEqual([]);
  });

  it('ninguém usa SQL cru sem parâmetro', () => {
    expect(citam(fontes, /\$queryRawUnsafe|\$executeRawUnsafe/)).toEqual([]);
  });

  it('process.env é lido em um lugar só: a entrada do processo (API, worker, comandos) e a configuração', () => {
    const permitido = new Set([
      'apps/api/src/main.ts',
      'apps/api/src/worker.ts',
      'apps/api/src/comandos/semear-biblioteca.ts',
      'apps/api/src/comandos/importar-da-poc.ts',
      'apps/api/src/comandos/montar.ts',
      'apps/api/src/comandos/preparar-fila.ts',
    ]);
    expect(citam(fora('plataforma/config'), /process\.env/).filter((a) => !permitido.has(a))).toEqual([]);
  });

  it('casos de uso e portas (application/ e domain/) não importam NestJS além de Injectable e Inject', () => {
    const nucleoDaApi = fontes.filter((a) => /\/(application|domain)\//.test(a));
    const violacoes = nucleoDaApi.flatMap((a) =>
      [...ler(a).matchAll(/import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+['"]@nestjs\/[^'"]+['"]/g)]
        .flatMap((m) => (m[1] as string).split(',').map((s) => s.trim().replace(/^type\s+/, '')))
        .filter((nome) => nome && nome !== 'Injectable' && nome !== 'Inject')
        .map((nome) => `${relativo(a)} importa ${nome}`),
    );
    expect(violacoes).toEqual([]);
  });
});
