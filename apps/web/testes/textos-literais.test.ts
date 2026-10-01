// Texto visível é texto público (CLAUDE.md): mora em src/textos/ e passa pelo guardião da marca.
// Componente não tem texto literal. Este teste falha se achar.
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { arquivosDeCodigo } from '../../../testes/fronteira/varredura';
import { textosLiteraisEm } from './textosLiterais';

const SRC = path.resolve(import.meta.dirname, '../src');
const achar = (fonte: string, arquivo = 'src/editor/Algo.tsx') => textosLiteraisEm(fonte, arquivo).map((a) => `${a.onde}: ${a.trecho}`);

describe('detector de texto literal', () => {
  it('acha texto solto entre etiquetas', () => {
    expect(achar('const A = () => <p>Nenhuma peça ainda</p>;')).toEqual(['filho: Nenhuma peça ainda']);
  });

  it('acha texto literal dentro de chaves, em aspas ou em crase', () => {
    expect(achar("const A = () => <p>{'Salvo'}</p>;")).toEqual(['filho: Salvo']);
    // biome-ignore lint/suspicious/noTemplateCurlyInString: o texto de teste é código-fonte com uma crase dentro
    expect(achar('const A = ({ n }: { n: number }) => <p>{`${n} formatos`}</p>;')).toEqual(['filho: formatos']);
  });

  it('acha texto em atributo que a pessoa lê ou ouve', () => {
    expect(achar('const A = () => <button aria-label="Fechar aviso" title="Fechar" />;')).toEqual(['atributo aria-label: Fechar aviso', 'atributo title: Fechar']);
    expect(achar('const A = () => <img alt={"Logo da marca"} src="/logo.svg" />;')).toEqual(['atributo alt: Logo da marca']);
    expect(achar('const A = () => <input placeholder="marca.com.br" />;')).toEqual(['atributo placeholder: marca.com.br']);
  });

  it('acha título e descrição de página escritos direto no arquivo da rota', () => {
    expect(achar("export const metadata = { title: 'Peças', description: 'Suas peças' };", 'src/app/editor/page.tsx')).toEqual(['metadado title: Peças', 'metadado description: Suas peças']);
  });

  it('aceita texto que vem de variável, sinal sem letra e atributo que ninguém lê', () => {
    expect(achar('const A = ({ t }: { t: { vazio: string } }) => <p className="vazio" data-estado="aberta">{t.vazio} · ×</p>;')).toEqual([]);
    expect(achar('const A = ({ t }: { t: string }) => <button type="button" aria-label={t} role="tab" />;')).toEqual([]);
  });

  it('não confunde genérico nem comparação com etiqueta', () => {
    expect(achar('const maior = (a: number, b: number) => a > b; const lista: Array<string> = []; export const A = () => <output>{lista.length}</output>;')).toEqual([]);
  });

  it('diz a linha', () => {
    expect(textosLiteraisEm('const A = () => (\n  <p>\n    Texto\n  </p>\n);', 'x.tsx')[0]?.linha).toBe(2);
  });
});

describe('o web não tem texto literal em componente', () => {
  const arquivos = arquivosDeCodigo(SRC).filter((a) => !/\.test\.tsx?$/.test(a) && !a.startsWith(path.join(SRC, 'textos')));

  it('há componentes para conferir (a suíte não passa por falta do que olhar)', () => {
    expect(arquivos.filter((a) => a.endsWith('.tsx')).length).toBeGreaterThan(5);
  });

  it('nenhum arquivo de src/ fora de textos/ traz texto visível escrito à mão', () => {
    const violacoes = arquivos.flatMap((arquivo) => textosLiteraisEm(readFileSync(arquivo, 'utf8'), arquivo).map((a) => `${path.relative(SRC, arquivo)}:${a.linha} ${a.onde}: ${a.trecho}`));
    expect(violacoes).toEqual([]);
  });
});

describe('todo texto visível é rascunho até passar pelo guardião da marca', () => {
  it('cada arquivo de textos/ se declara RASCUNHO', () => {
    const pasta = path.join(SRC, 'textos');
    // plural.ts não tem texto: é a regra que escolhe entre os textos
    const semMarca = readdirSync(pasta)
      .filter((nome) => nome.endsWith('.ts') && nome !== 'plural.ts')
      .filter((nome) => !readFileSync(path.join(pasta, nome), 'utf8').startsWith('// RASCUNHO'));
    expect(semMarca).toEqual([]);
  });
});
