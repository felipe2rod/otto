import { describe, expect, it } from 'vitest';
import { contextoParaORevisor } from '../agente';
import { dirigirArte } from '../direcao';
import {
  ESFORCOS_CRIATIVOS,
  FATORES,
  MECANICA_PADRAO,
  NIVEIS_DE_ESFORCO_CRIATIVO,
  lerEsforco,
  mecanicaDoEsforco,
  notaDeEsforcoParaODiretor,
  secaoDeEsforcoCriativo,
  secaoDeEsforcoParaORevisor,
} from '../esforco';
import type { MensagemDoModelo, ModeloDoAgente } from '../modelo';
import { CRITERIOS_DE_PORTFOLIO, PROMPT_DO_REVISOR, PROMPT_DO_SISTEMA, REGRAS_DE_DETALHE, montarPromptDoRevisor, montarPromptDoSistema } from '../prompt';

describe('escala de esforço criativo', () => {
  it('tem os sete níveis, na ordem, de SIMPLE a ICONIC', () => {
    expect(ESFORCOS_CRIATIVOS).toEqual(['SIMPLE', 'STANDARD', 'REFINED', 'CREATIVE', 'ADVANCED', 'CONCEPTUAL', 'ICONIC']);
    expect(ESFORCOS_CRIATIVOS.map((e) => NIVEIS_DE_ESFORCO_CRIATIVO[e].ordem)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('cada fator só sobe (ou fica) de um nível para o seguinte; SIMPLE é o mínimo e ICONIC o máximo em tudo', () => {
    for (const f of FATORES) {
      const faixas = ESFORCOS_CRIATIVOS.map((e) => NIVEIS_DE_ESFORCO_CRIATIVO[e].fatores[f]);
      for (let i = 1; i < faixas.length; i++) expect(faixas[i], `${f}: ${ESFORCOS_CRIATIVOS[i]} < ${ESFORCOS_CRIATIVOS[i - 1]}`).toBeGreaterThanOrEqual(faixas[i - 1]!);
      expect(NIVEIS_DE_ESFORCO_CRIATIVO.SIMPLE.fatores[f]).toBe(0);
      expect(NIVEIS_DE_ESFORCO_CRIATIVO.ICONIC.fatores[f]).toBe(3);
    }
  });

  it('a mecânica do ciclo acompanha o nível e, sem nível, é a de sempre', () => {
    expect(mecanicaDoEsforco()).toEqual({ rodadasDeRevisao: 1, tetoDeVoltas: 6, maximoDeChamadas: 60 });
    expect(mecanicaDoEsforco()).toBe(MECANICA_PADRAO);
    expect(mecanicaDoEsforco('ICONIC').rodadasDeRevisao).toBe(2);
    const m = ESFORCOS_CRIATIVOS.map((e) => mecanicaDoEsforco(e));
    for (let i = 1; i < m.length; i++) {
      expect(m[i]!.tetoDeVoltas).toBeGreaterThanOrEqual(m[i - 1]!.tetoDeVoltas);
      expect(m[i]!.maximoDeChamadas).toBeGreaterThanOrEqual(m[i - 1]!.maximoDeChamadas);
      expect(m[i]!.rodadasDeRevisao).toBeGreaterThanOrEqual(m[i - 1]!.rodadasDeRevisao);
    }
  });

  it('lê o nível em qualquer caixa e recusa o resto', () => {
    expect(lerEsforco('ICONIC')).toBe('ICONIC');
    expect(lerEsforco(' creative ')).toBe('CREATIVE');
    expect(lerEsforco('MAXIMO')).toBeUndefined();
    expect(lerEsforco('')).toBeUndefined();
    expect(lerEsforco(undefined)).toBeUndefined();
    expect(lerEsforco(7)).toBeUndefined();
  });
});

describe('seção de esforço no prompt do agente', () => {
  it('sem nível, o prompt do sistema é o de sempre, byte a byte', () => {
    expect(montarPromptDoSistema()).toBe(PROMPT_DO_SISTEMA);
    expect(montarPromptDoSistema(undefined)).toBe(PROMPT_DO_SISTEMA);
  });

  it('com nível, a seção entra depois do caráter e antes das receitas, e o repertório continua inteiro', () => {
    const p = montarPromptDoSistema('CREATIVE');
    expect(p).toContain('# CREATIVE EFFORT');
    expect(p).toContain('CREATIVE (4 de 7)');
    expect(p).toContain('Explora possibilidades.');
    const carater = p.indexOf('# CARÁTER');
    const secao = p.indexOf('# CREATIVE EFFORT');
    const receitas = p.indexOf('# Receitas do editor');
    expect(carater).toBeGreaterThan(0);
    expect(secao).toBeGreaterThan(carater);
    expect(receitas).toBeGreaterThan(secao);
    expect(p).toContain(CRITERIOS_DE_PORTFOLIO);
    expect(p).toContain(REGRAS_DE_DETALHE);
    // os critérios e as regras do prompt de sempre continuam lá
    expect(p).toContain('# REGRA DE ORIGINALIDADE');
    expect(p).toContain('# CRÍTICA INTERNA');
  });

  it('diz o que o nível não determina e que esforço não é mais elementos, em todo nível', () => {
    for (const e of ESFORCOS_CRIATIVOS) {
      const s = secaoDeEsforcoCriativo(e);
      expect(s).toContain('Ele NÃO determina:');
      expect(s).toContain('- estilo;');
      expect(s).toContain('- quantidade de elementos.');
      expect(s).toContain('Maior esforço não significa adicionar mais elementos');
      expect(s).toContain('Uma solução minimalista pode ser ICONIC');
      expect(s).toContain('Valem em todos os níveis');
      expect(s).toContain(`Processo esperado:\n${NIVEIS_DE_ESFORCO_CRIATIVO[e].processo.join(' → ')}`);
    }
  });

  it('esforço é profundidade de processo, não estilo: a seção não prescreve estética', () => {
    const estilos = ['neon', 'serif', 'gradiente', 'duotone', 'editorial', 'monumental', 'dramátic', 'colagem'];
    for (const e of ESFORCOS_CRIATIVOS) {
      const s = secaoDeEsforcoCriativo(e).toLowerCase();
      for (const palavra of estilos) expect(s, `${e} cita "${palavra}"`).not.toContain(palavra);
    }
  });

  it('SIMPLE dispensa a comparação de alternativas; ICONIC questiona a primeira solução', () => {
    expect(secaoDeEsforcoCriativo('SIMPLE')).toContain('não é preciso comparar alternativas');
    expect(secaoDeEsforcoCriativo('SIMPLE')).toContain('fique com a primeira solução coerente');
    expect(secaoDeEsforcoCriativo('ICONIC')).toContain('assuma que a primeira solução não é a melhor');
    expect(secaoDeEsforcoCriativo('ICONIC')).toContain('segunda crítica');
  });
});

describe('esforço no revisor', () => {
  it('sem nível, o prompt do revisor é o de sempre, byte a byte', () => {
    expect(montarPromptDoRevisor()).toBe(PROMPT_DO_REVISOR);
  });

  it('com nível, o revisor pergunta pela profundidade esperada e mantém os fundamentos e as regras de detalhe', () => {
    const p = montarPromptDoRevisor('SIMPLE');
    expect(p).toContain('Para o nível de esforço solicitado, esta peça atingiu a profundidade esperada?');
    expect(p).toContain('SIMPLE (1 de 7)');
    expect(p).toContain('O nível não muda o que é obrigatório.');
    expect(p).toContain('Não cobre de uma peça SIMPLE a profundidade de um nível acima');
    expect(p).toContain(REGRAS_DE_DETALHE);
    expect(p).toContain('# DIAGNÓSTICO');
    expect(p.indexOf('# CREATIVE EFFORT')).toBeLessThan(p.indexOf('## Grade e espaço'));
  });

  it('a seção do revisor só lista o que ele enxerga no render, não o processo interno', () => {
    const s = secaoDeEsforcoParaORevisor('ADVANCED');
    expect(s).toContain('Originalidade buscada');
    expect(s).toContain('Exploração compositiva');
    expect(s).not.toContain('Ciclos de refinamento');
    expect(s).not.toContain('Crítica interna:');
  });

  it('o contexto do revisor traz o nível e a rodada só quando existem, e tira a direção do pedido', () => {
    const pedido = 'Tarefa: crie a peça\n\nA direção de arte da peça está abaixo.\n\n<direcao>\nConceito: x\n</direcao>';
    const sem = contextoParaORevisor(pedido, 'Conceito: x', '- nenhum');
    expect(sem).not.toContain('Esforço criativo pedido');
    expect(sem).not.toContain('Rodada');
    expect(sem).not.toContain('<direcao>');
    expect(sem).toContain('Direção de arte que o designer devia executar:\nConceito: x');
    const com = contextoParaORevisor(pedido, 'Conceito: x', '- nenhum', 'ICONIC', 2);
    expect(com).toContain('Esforço criativo pedido: ICONIC');
    expect(com).toContain('Rodada 2 de revisão');
    expect(contextoParaORevisor(pedido, undefined, '- nenhum', 'ICONIC', 1)).not.toContain('Rodada');
  });
});

const DIRECAO_VALIDA = {
  leituraDaMarca: 'Roxo saturado sobre branco, grotesca geométrica pesada com tracking fechado, foto de gente real em luz natural, botão pílula.',
  conceito: 'Gente de verdade no meio do dia, com o título grande em branco por cima da foto.',
  assinatura: 'Título branco enorme em grotesca fechada, sempre sobre foto de gente real, com o roxo só no botão.',
  arquetipo: 'A',
  porque: 'É a linguagem do próprio site: foto sangrada e título grande em branco.',
  hierarquia: ['título', 'foto', 'chamada'],
  paleta: { dominante: '#FFFFFF', apoio: '#8D0DE3', acento: '#1E002F', texto: '#FFFFFF' },
  tipografia: { titulo: { familia: 'Inter', peso: 700, caixaAlta: false, espacamento: -25 }, texto: { familia: 'Inter', peso: 400 } },
  imagem: { papel: 'foto sangrada de pessoa real sorrindo', buscarPor: ['woman smiling phone city'], tratamento: 'quente, sem duotone' },
  forma: 'botão pílula roxo, cantos redondos 24',
  tecnicas: ['película em degradê só na faixa do texto'],
  evitar: ['duotone', 'serifa', 'caixa alta no título'],
};

function modeloFalso(recebidas: MensagemDoModelo[][]): ModeloDoAgente {
  return {
    nome: 'falso',
    capacidades: { imagem: true, ferramentas: true, cache: false },
    async responder(mensagens) {
      recebidas.push(structuredClone(mensagens));
      return { mensagem: { role: 'assistant', content: JSON.stringify(DIRECAO_VALIDA) }, uso: { entrada: 1, saida: 1, cacheLido: 0 } };
    },
  };
}

describe('esforço no diretor de arte', () => {
  const meios = () => ({ custo: { modelo: 'falso', chamadas: 0, tokensDeEntrada: 0, tokensDeSaida: 0, tokensDeCacheLidos: 0, imagensEnviadas: 0, voltasDeConferencia: 0, segundos: 0 }, sinal: new AbortController().signal });

  it('sem nível, a mensagem ao diretor é só o briefing e as referências', async () => {
    const recebidas: MensagemDoModelo[][] = [];
    await dirigirArte({ modelo: modeloFalso(recebidas), ...meios() }, 'briefing', [{ type: 'text', text: 'ref' }]);
    const usuario = recebidas[0]![1]!;
    expect(usuario.role).toBe('user');
    expect(usuario.content).toEqual([{ type: 'text', text: 'briefing' }, { type: 'text', text: 'ref' }]);
  });

  it('com nível, a nota de esforço entra entre o briefing e as referências, e o prompt do diretor não muda', async () => {
    const recebidas: MensagemDoModelo[][] = [];
    const r = await dirigirArte({ modelo: modeloFalso(recebidas), ...meios() }, 'briefing', [{ type: 'text', text: 'ref' }], 'CONCEPTUAL');
    expect(r?.arquetipo).toBe('A');
    const [sistema, usuario] = recebidas[0]!;
    expect(sistema!.content).not.toContain('CONCEPTUAL');
    expect(usuario!.content).toEqual([{ type: 'text', text: 'briefing' }, { type: 'text', text: notaDeEsforcoParaODiretor('CONCEPTUAL') }, { type: 'text', text: 'ref' }]);
    expect(notaDeEsforcoParaODiretor('CONCEPTUAL')).toContain('CONCEPTUAL (6 de 7)');
    expect(notaDeEsforcoParaODiretor('CONCEPTUAL')).toContain('mais esforço nunca significa mais elementos');
  });
});
