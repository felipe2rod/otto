// Guarda do que a tela de importar PSD pode dizer. A regra desta tela:
//
// 1. "PSD" e "PSB" são nomes de formato de arquivo: aparecem à vontade.
// 2. O nome do programa (Photoshop) aparece SÓ em `recusa.comoConverter`: é a instrução do que a pessoa faz
//    no programa dela para o arquivo passar (o caminho do menu), e não promete nada sobre o resultado.
// 3. Em nenhum outro lugar o programa é citado; Illustrator e Adobe, em lugar nenhum.
// 4. Nenhuma frase promete que a peça fica igual, idêntica ou fiel ao arquivo, nem que "abre" ou "funciona" em
//    outro programa. O que a tela afirma é o que o Otto fez: veio editável, virou imagem, ficou de fora.
// 5. Como nas outras telas: nada de modelo, token, custo ou "IA".
//
// O teste percorre TODO texto de textos/importar.ts, chamando as funções com valores de exemplo.
import { describe, expect, it } from 'vitest';
import { exportar } from '../src/textos/exportar';
import { importar } from '../src/textos/importar';
import { frases } from './frasesDosTextos';

const PROGRAMA = /photoshop/i;
const NUNCA = [
  /illustrator|adobe/i,
  /\bIA\b/,
  /intelig[êe]ncia artificial/i,
  /\bmodelos?\b/i,
  /\btokens?\b/i,
  /\bcust(o|os|a|am|ou)\b/i,
  /R\$|US\$/,
  /claude|sonnet|opus|haiku|anthropic|openai|gpt|llm/i,
];
/** Promessa de fidelidade: "fica igual ao", "idêntico", "fiel", "exatamente como". */
const PROMESSA = /\b(id[êe]ntic[oa]s?|fiel|fi[ée]is|exatamente (como|igual)|igual(zinho)? (ao|à|a como)|sem (nenhuma )?diferen[çc]a|100%)\b/i;
const ONDE_O_PROGRAMA_PODE = 'importar.recusa.comoConverter.';

describe('textos de importar PSD', () => {
  const todas = frases(importar, 'importar');

  it('o percurso acha os textos (o teste não passa por não ter lido nada)', () => {
    expect(todas.length).toBeGreaterThan(150);
    for (const parte of ['importar.recusa.motivos', 'importar.recusa.comoConverter', 'importar.fontes.opcoes', 'importar.relatorio.virouImagem.motivos', 'importar.falhou.codigos'])
      expect(todas.some(([caminho]) => caminho.startsWith(parte))).toBe(true);
  });

  it('a guarda pega o que tem de pegar', () => {
    expect(PROMESSA.test('A peça fica idêntica ao arquivo')).toBe(true);
    expect(PROMESSA.test('Fica igual ao que o programa mostra')).toBe(true);
    expect(PROMESSA.test('A peça pode ficar diferente do arquivo: confira com o original')).toBe(false);
    expect(PROGRAMA.test('Abre no Photoshop')).toBe(true);
  });

  it('o nome do programa só aparece na instrução de como converter um arquivo recusado', () => {
    const fora = todas.filter(([caminho, frase]) => PROGRAMA.test(frase) && !caminho.startsWith(ONDE_O_PROGRAMA_PODE));
    expect(fora).toEqual([]);
    // e lá ele é instrução (um caminho de menu), não promessa
    const instrucoes = todas.filter(([caminho, frase]) => caminho.startsWith(ONDE_O_PROGRAMA_PODE) && PROGRAMA.test(frase));
    expect(instrucoes.length).toBeGreaterThan(0);
    for (const [, frase] of instrucoes) expect(frase).toMatch(/Imagem > Modo > /);
  });

  it('nenhuma frase cita Illustrator ou Adobe, nem fala de modelo, token, custo ou "IA"', () => {
    expect(todas.filter(([, frase]) => NUNCA.some((p) => p.test(frase)))).toEqual([]);
  });

  it('nenhuma frase promete que a peça fica igual, idêntica ou fiel ao arquivo', () => {
    expect(todas.filter(([, frase]) => PROMESSA.test(frase))).toEqual([]);
  });

  it('CMYK e 16 bits dizem como converter; todo motivo de recusa do contrato tem frase própria', async () => {
    const { MOTIVOS_DE_PSD_RECUSADO } = await import('@otto/shared');
    for (const motivo of MOTIVOS_DE_PSD_RECUSADO) expect(importar.recusa.motivos[motivo], motivo).toBeTruthy();
    expect(importar.recusa.comoConverter['modo-de-cor']).toContain('RGB');
    expect(importar.recusa.comoConverter.profundidade).toContain('8 Bits');
  });

  it('o aviso novo da exportação vetorial (imagem em resolução menor) tem frase, e ela não cita programa nenhum', () => {
    const frase = exportar.relatorio.observacoes.doCodigo['imagem-em-resolucao-menor'];
    expect(frase).toBeTruthy();
    expect(frase).not.toMatch(/photoshop|illustrator|adobe/i);
  });
});
