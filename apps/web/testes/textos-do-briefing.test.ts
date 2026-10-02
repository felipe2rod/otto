// Guarda do que o formulário de briefing, as marcas, a busca de imagens e as fontes NÃO dizem:
// modelo, token, custo, "IA", nem o nome de um banco de imagens ou de um catálogo de fontes (o nome que
// a tela mostra é o que o servidor devolve; ADR 020). Percorre TODO texto de textos/briefing.ts,
// chamando as funções com valores de exemplo.
import { describe, expect, it } from 'vitest';
import { briefing, fontes, imagens, marcas } from '../src/textos/briefing';
import { frases } from './frasesDosTextos';

const PROIBIDO = [
  /\bIA\b/,
  /intelig[êe]ncia artificial/i,
  /\bmodelos?\b/i,
  /\btokens?\b/i,
  /\bcust(o|os|a|am|ou)\b/i,
  /R\$|US\$|\bd[óo]lar|\bcentavo/i,
  /\bcr[ée]ditos?\b/i,
  /claude|sonnet|opus|haiku|anthropic|openai|gpt|kimi|llm|digitalocean/i,
  /pixabay|unsplash|pexels|shutterstock|getty|freepik|google|adobe fonts/i,
  /photoshop|illustrator|adobe/i,
];
const proibidas = (todas: [string, string][]) => todas.filter(([, frase]) => PROIBIDO.some((p) => p.test(frase)));

describe('textos do briefing, das marcas, do banco de imagens e das fontes', () => {
  const todas = [...frases(briefing, 'briefing'), ...frases(marcas, 'marcas'), ...frases(imagens, 'imagens'), ...frases(fontes, 'fontes')];

  it('o percurso acha os textos (o teste não passa por não ter lido nada)', () => {
    expect(todas.length).toBeGreaterThan(200);
    for (const parte of ['briefing.rodape.faltas', 'briefing.imagens', 'briefing.cuidado', 'marcas.campos', 'imagens.erros', 'fontes.baixando'])
      expect(todas.some(([caminho]) => caminho.startsWith(parte))).toBe(true);
  });

  it('a guarda pega o que tem de pegar', () => {
    expect(proibidas([['x', 'Imagens do Pixabay']])).toHaveLength(1);
    expect(proibidas([['x', 'Fontes do Google']])).toHaveLength(1);
    expect(proibidas([['x', 'Gasta menos tokens']])).toHaveLength(1);
    expect(proibidas([['x', 'Imagens de Banco de Teste. Licença livre.']])).toHaveLength(0);
  });

  it('nenhuma frase fala de modelo, token, custo, "IA", nem cita banco de imagens ou catálogo de fontes pelo nome', () => {
    expect(proibidas(todas)).toEqual([]);
  });

  it('a origem das imagens é dita com o nome que o servidor manda, e a frase leva a licença', () => {
    expect(imagens.origem('Banco de Teste', 'Licença livre')).toContain('Banco de Teste');
    expect(imagens.origem('Banco de Teste', 'Licença livre')).toContain('Licença livre');
  });

  it('o cuidado tem três opções, e nenhuma promete tempo em número (ainda não foi medido)', () => {
    expect(Object.keys(briefing.cuidado.opcoes)).toEqual(['direto', 'cuidadoso', 'autoral']);
    for (const frase of Object.values(briefing.cuidado.oQueE)) expect(frase).not.toMatch(/\d/);
  });
});
