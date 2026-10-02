// Guarda do que o painel do Otto NÃO mostra: modelo, token, custo, "IA" e nome de fornecedor. O
// designer vê o tempo e o que foi feito. O teste percorre TODO texto de textos/otto.ts e as frases
// de erro da tarefa, chamando as funções com valores de exemplo.
//
// O que vem do servidor (a fala do Otto, o resumo, a pendência que ele declarou) não passa por aqui:
// é do prompt, e quem guarda é o treinador-do-otto.
import { describe, expect, it } from 'vitest';
import { erros } from '../src/textos/erros';
import { duracao, otto } from '../src/textos/otto';
import { pecas } from '../src/textos/pecas';
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
  /photoshop|illustrator|adobe/i,
];
const proibidas = (todas: [string, string][]) => todas.filter(([, frase]) => PROIBIDO.some((p) => p.test(frase)));

describe('textos do Otto', () => {
  const todas = frases(otto, 'otto');

  it('o percurso acha os textos (o teste não passa por não ter lido nada)', () => {
    expect(todas.length).toBeGreaterThan(150);
    for (const parte of ['pedir', 'espera.etapa', 'pode', 'revisao.naoTerminou', 'pendencia.doTipo', 'aba', 'aviso']) expect(todas.some(([caminho]) => caminho.startsWith(`otto.${parte}`))).toBe(true);
  });

  it('a guarda pega o que tem de pegar', () => {
    expect(proibidas([['x', 'Usei 1.200 tokens']])).toHaveLength(1);
    expect(proibidas([['x', 'Feito com IA']])).toHaveLength(1);
    expect(proibidas([['x', 'A tarefa custou R$ 0,40']])).toHaveLength(1);
    expect(proibidas([['x', 'O modelo não respondeu']])).toHaveLength(1);
    expect(proibidas([['x', 'Havia uma pendência na média']])).toHaveLength(0);
  });

  it('nenhuma frase fala de modelo, token, custo, "IA" nem de fornecedor', () => {
    expect(proibidas(todas)).toEqual([]);
  });

  it('as frases de erro da tarefa e o estado na lista de peças também não', () => {
    const codigos = ['documento_em_tarefa', 'revisao_pendente', 'tarefa_em_andamento', 'limite_de_tarefas', 'limite_diario', 'tarefa_fora_do_estado', 'editado_depois', 'prancheta_nao_descartavel'];
    expect(proibidas(codigos.map((c) => [c, erros.doCodigo(c)]))).toEqual([]);
    for (const codigo of codigos) expect(erros.doCodigo(codigo), codigo).not.toBe(erros.generico);
    expect(proibidas(frases(pecas, 'pecas'))).toEqual([]);
  });

  it('o designer vê o tempo, em segundos, minutos e horas, nunca uma porcentagem', () => {
    expect(duracao(45_000)).toBe('45 s');
    expect(duracao(8 * 60_000)).toBe('8 min');
    expect(duracao(65 * 60_000)).toBe('1 h 05 min');
    expect(todas.filter(([, frase]) => frase.includes('%'))).toEqual([]);
  });
});
