// Guarda do que a tela de exportar NÃO pode afirmar: que o arquivo abre editável no Photoshop ou no
// Illustrator. Nenhum dos dois programas abriu um arquivo do Otto até hoje. O teste percorre TODO
// texto de textos/exportar.ts e as frases de erro, chamando as funções com valores de exemplo.
import { describe, expect, it } from 'vitest';
import { erros } from '../src/textos/erros';
import { exportar } from '../src/textos/exportar';
import { frases } from './frasesDosTextos';

const PROGRAMAS = /photoshop|illustrator|adobe/i;

describe('textos de exportar', () => {
  const todas = frases(exportar, 'exportar');

  it('o percurso acha os textos (o teste não passa por não ter lido nada)', () => {
    expect(todas.length).toBeGreaterThan(60);
    expect(todas.some(([caminho]) => caminho.includes('relatorio.deFora'))).toBe(true);
    expect(todas.some(([caminho]) => caminho.includes('pacote'))).toBe(true);
  });

  it('nenhuma frase cita o Photoshop nem o Illustrator: ninguém abriu um arquivo do Otto neles ainda', () => {
    expect(todas.filter(([, frase]) => PROGRAMAS.test(frase))).toEqual([]);
  });

  it('nenhuma frase promete que o arquivo fica "editável" fora do Otto', () => {
    expect(todas.filter(([, frase]) => /edit[áa]vel|editáveis/i.test(frase))).toEqual([]);
  });

  it('as frases de erro da exportação também não citam os programas', () => {
    const codigos = [
      'nada_para_exportar',
      'prancheta_desconhecida',
      'limite_de_exportacoes',
      'fila_indisponivel',
      'exportacao_expirada',
      'exportacao_nao_pronta',
      'exportacao_falhou',
      'abandonada',
      'interrompida',
    ];
    for (const codigo of codigos) expect(erros.doCodigo(codigo)).not.toMatch(PROGRAMAS);
    // os dois estados novos têm frase própria, não a genérica
    expect(erros.doCodigo('abandonada')).not.toBe(erros.generico);
    expect(erros.doCodigo('interrompida')).not.toBe(erros.generico);
  });
});
