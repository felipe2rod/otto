import { describe, expect, it } from 'vitest';
import { direcaoEmTexto, lerDirecao } from '../direcao';

const VALIDA = {
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

describe('direção de arte vinda do modelo', () => {
  it('aceita JSON cercado de texto e de cerca de código', () => {
    const r = lerDirecao(`Aqui está a direção:\n\`\`\`json\n${JSON.stringify(VALIDA)}\n\`\`\`\nBom trabalho.`);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.direcao.arquetipo).toBe('A');
  });

  it('recusa com o campo que faltou, para devolver ao modelo', () => {
    const { paleta: _p, ...sem } = VALIDA;
    const r = lerDirecao(JSON.stringify(sem));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro).toContain('paleta');
  });

  it('recusa cor que não é #RRGGBB', () => {
    const r = lerDirecao(JSON.stringify({ ...VALIDA, paleta: { ...VALIDA.paleta, apoio: 'roxo' } }));
    expect(r.ok).toBe(false);
  });

  it('resposta sem JSON é recusada', () => {
    expect(lerDirecao('não sei').ok).toBe(false);
  });

  it('texto para o agente traz conceito, arquétipo, papéis de cor e o que evitar', () => {
    const r = lerDirecao(JSON.stringify(VALIDA));
    if (!r.ok) throw new Error(r.erro);
    const t = direcaoEmTexto(r.direcao);
    expect(t).toContain('Arquétipo A');
    expect(t).toContain('#8D0DE3');
    expect(t).toContain('duotone');
    expect(t).toContain('Assinatura visual da peça');
  });
});
