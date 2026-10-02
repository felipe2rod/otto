import { describe, expect, it } from 'vitest';
import {
  ESFORCOS_CRIATIVOS,
  esforcoDaOpcao,
  FATORES,
  lerEsforco,
  MECANICA_PADRAO,
  mecanicaDoEsforco,
  NIVEIS_DE_ESFORCO_CRIATIVO,
  notaDeEsforcoParaODiretor,
  OPCOES_DE_CUIDADO,
  secaoDeEsforcoCriativo,
  secaoDeEsforcoParaORevisor,
} from './esforco';

describe('escala de esforço criativo (sete níveis no código)', () => {
  it('tem os sete níveis, na ordem, de SIMPLE a ICONIC', () => {
    expect(ESFORCOS_CRIATIVOS).toEqual(['SIMPLE', 'STANDARD', 'REFINED', 'CREATIVE', 'ADVANCED', 'CONCEPTUAL', 'ICONIC']);
    expect(ESFORCOS_CRIATIVOS.map((e) => NIVEIS_DE_ESFORCO_CRIATIVO[e].ordem)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('cada fator só sobe (ou fica) de um nível para o seguinte', () => {
    for (const f of FATORES) {
      const faixas = ESFORCOS_CRIATIVOS.map((e) => NIVEIS_DE_ESFORCO_CRIATIVO[e].fatores[f]);
      for (let i = 1; i < faixas.length; i++) expect(faixas[i] as number, `${f}: ${ESFORCOS_CRIATIVOS[i]}`).toBeGreaterThanOrEqual(faixas[i - 1] as number);
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
      expect((m[i] as (typeof m)[number]).tetoDeVoltas).toBeGreaterThanOrEqual((m[i - 1] as (typeof m)[number]).tetoDeVoltas);
      expect((m[i] as (typeof m)[number]).maximoDeChamadas).toBeGreaterThanOrEqual((m[i - 1] as (typeof m)[number]).maximoDeChamadas);
    }
  });

  it('lê o nível em qualquer caixa e recusa o resto', () => {
    expect(lerEsforco('ICONIC')).toBe('ICONIC');
    expect(lerEsforco(' creative ')).toBe('CREATIVE');
    expect(lerEsforco('MAXIMO')).toBeUndefined();
    expect(lerEsforco(7)).toBeUndefined();
  });
});

describe('as três opções da tela', () => {
  it('são direto, cuidadoso e autoral, com o do meio como padrão', () => {
    expect(OPCOES_DE_CUIDADO.map((o) => o.opcao)).toEqual(['direto', 'cuidadoso', 'autoral']);
    expect(OPCOES_DE_CUIDADO.filter((o) => o.padrao).map((o) => o.opcao)).toEqual(['cuidadoso']);
  });

  it('cada opção cai num dos sete níveis, em ordem crescente', () => {
    expect(esforcoDaOpcao('direto')).toBe('STANDARD');
    expect(esforcoDaOpcao('cuidadoso')).toBe('REFINED');
    expect(esforcoDaOpcao('autoral')).toBe('CONCEPTUAL');
    const ordens = OPCOES_DE_CUIDADO.map((o) => NIVEIS_DE_ESFORCO_CRIATIVO[o.esforco].ordem);
    expect([...ordens].sort((a, b) => a - b)).toEqual(ordens);
  });

  it('opção desconhecida não vira nível nenhum', () => {
    expect(esforcoDaOpcao('caprichado')).toBeUndefined();
    expect(esforcoDaOpcao(undefined)).toBeUndefined();
  });
});

describe('seções de esforço nos prompts', () => {
  it('dizem o que o nível não determina e que esforço não é mais elementos, em todo nível', () => {
    for (const e of ESFORCOS_CRIATIVOS) {
      const s = secaoDeEsforcoCriativo(e);
      expect(s).toContain('Ele NÃO determina:');
      expect(s).toContain('- quantidade de elementos.');
      expect(s).toContain('Maior esforço não significa adicionar mais elementos');
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

  it('o revisor só recebe o que enxerga no render, e não cobra o nível de cima', () => {
    const s = secaoDeEsforcoParaORevisor('ADVANCED');
    expect(s).toContain('Originalidade buscada');
    expect(s).not.toContain('Ciclos de refinamento');
    expect(secaoDeEsforcoParaORevisor('SIMPLE')).toContain('Não cobre de uma peça SIMPLE a profundidade de um nível acima');
  });

  it('a nota ao diretor diz o nível e que esforço não é mais elementos', () => {
    expect(notaDeEsforcoParaODiretor('CONCEPTUAL')).toContain('CONCEPTUAL (6 de 7)');
    expect(notaDeEsforcoParaODiretor('CONCEPTUAL')).toContain('mais esforço nunca significa mais elementos');
  });
});
