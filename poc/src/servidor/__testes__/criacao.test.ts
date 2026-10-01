import { describe, expect, it } from 'vitest';
import { mensagemDeCriacao, textosEntreAspas } from '../prompt';

describe('textosEntreAspas', () => {
  it('pega o texto entre aspas retas e curvas, que entra literal na peça', () => {
    expect(textosEntreAspas('story da Crové, título "Chegou o verão" e rodapé “crove.com”')).toEqual(['Chegou o verão', 'crove.com']);
  });
  it('sem aspas, não há texto obrigatório', () => {
    expect(textosEntreAspas('post de café gelado, tom acolhedor')).toEqual([]);
  });
});

describe('mensagemDeCriacao', () => {
  it('pede uma prancheta só, com o feed como formato padrão', () => {
    const m = mensagemDeCriacao('post de café');
    expect(m).toContain('Uma prancheta só');
    expect(m).toContain('1080×1350');
    expect(m).not.toContain('<direcao>');
  });
  it('anexa a direção de arte com o cabeçalho que o revisor corta', () => {
    expect(mensagemDeCriacao('post de café', 'Conceito: x')).toMatch(/\n\nA direção de arte da peça[\s\S]*<\/direcao>/);
  });
});
