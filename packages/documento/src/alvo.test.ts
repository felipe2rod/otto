import { describe, expect, it } from 'vitest';
import { acharEm, noContemPonto } from './alvo';
import { novoDocumento } from './apoio-de-teste';
import type { NoVisual } from './esquema';
import { VAO_ENTRE_PRANCHETAS } from './geometria';
import { acharNo } from './operacoes';

const forma = (nome: string, x: number, y: number, extra: Record<string, unknown> = {}) => ({
  tipo: 'forma',
  nome,
  forma: 'retangulo',
  x,
  y,
  largura: 200,
  altura: 100,
  preenchimento: '#ff5b1f',
  ...extra,
});

const doc = novoDocumento([
  { op: 'criarPrancheta', nome: 'Feed', largura: 1080, altura: 1350, fundo: '#ffffff' },
  { op: 'criarPrancheta', nome: 'Story', largura: 1080, altura: 1920, fundo: '#ffffff' },
  { op: 'criarNo', prancheta: 'Feed', no: forma('Baixo', 100, 100) },
  { op: 'criarNo', prancheta: 'Feed', no: forma('Cima', 200, 150) },
  { op: 'criarNo', prancheta: 'Feed', no: forma('Travada', 600, 100, { bloqueado: true }) },
  { op: 'criarNo', prancheta: 'Feed', no: forma('Oculta', 600, 400, { visivel: false }) },
  // 200 × 100 girada 90 graus em torno do centro (200, 650): passa a ocupar x de 150 a 250 e y de 550 a 750
  { op: 'criarNo', prancheta: 'Feed', no: forma('Girada', 100, 600, { rotacao: 90 }) },
  { op: 'criarNo', prancheta: 'Feed', no: forma('Elipse', 500, 600, { forma: 'elipse' }) },
  { op: 'criarNo', prancheta: 'Feed', no: forma('Arredondada', 800, 600, { raio: 50 }) },
  { op: 'criarNo', prancheta: 'Feed', no: forma('Inclinada', 400, 900, { rotacao: 45 }) },
  { op: 'criarNo', prancheta: 'Feed', no: forma('No grupo', 100, 1100) },
  { op: 'criarNo', prancheta: 'Feed', no: forma('No grupo travado', 400, 1100) },
  { op: 'criarNo', prancheta: 'Feed', no: forma('No grupo oculto', 700, 1100) },
  { op: 'agrupar', alvos: ['Feed/No grupo'], nome: 'G' },
  { op: 'agrupar', alvos: ['Feed/No grupo travado'], nome: 'GT' },
  { op: 'agrupar', alvos: ['Feed/No grupo oculto'], nome: 'GO' },
  { op: 'alterar', alvo: 'Feed/GT', props: { bloqueado: true } },
  { op: 'alterar', alvo: 'Feed/GO', props: { visivel: false } },
  { op: 'criarNo', prancheta: 'Feed', no: { tipo: 'ajuste', nome: 'Ajuste', ajuste: { tipo: 'preto-e-branco' } } },
  { op: 'criarNo', prancheta: 'Story', no: forma('No story', 50, 50) },
]);
const nome = (alvo: ReturnType<typeof acharEm>) => alvo?.no?.nome ?? alvo?.prancheta.nome ?? null;
const em = (x: number, y: number, opcoes?: Parameters<typeof acharEm>[2]) => nome(acharEm(doc, { x, y }, opcoes));

describe('teste de alvo: que camada está sob o ponto', () => {
  it('acha a camada sob o ponto; onde duas se sobrepõem, vale a de cima', () => {
    expect(em(110, 110)).toBe('Baixo');
    expect(em(250, 180)).toBe('Cima');
  });

  it('ponto na prancheta, fora de qualquer camada, acha só a prancheta; fora das pranchetas, nada', () => {
    const alvo = acharEm(doc, { x: 900, y: 1300 });
    expect(alvo?.no).toBeUndefined();
    expect(alvo?.prancheta.nome).toBe('Feed');
    expect(acharEm(doc, { x: 1080 + VAO_ENTRE_PRANCHETAS / 2, y: 100 })).toBeUndefined();
    expect(acharEm(doc, { x: -5, y: 100 })).toBeUndefined();
  });

  it('camada bloqueada ou oculta não é alvo, nem o que está em grupo bloqueado ou oculto', () => {
    expect(em(650, 150)).toBe('Feed');
    expect(em(650, 450)).toBe('Feed');
    expect(em(150, 1150)).toBe('No grupo');
    expect(em(450, 1150)).toBe('Feed');
    expect(em(750, 1150)).toBe('Feed');
  });

  it('com "comBloqueadas", a bloqueada responde (é o que a lista de camadas e o agente usam)', () => {
    expect(em(650, 150, { comBloqueadas: true })).toBe('Travada');
    expect(em(450, 1150, { comBloqueadas: true })).toBe('No grupo travado');
  });

  it('camada de ajuste não tem caixa: nunca é alvo', () => {
    expect(em(1000, 20)).toBe('Feed');
  });

  it('desconta a posição da prancheta no plano do editor', () => {
    const x0 = 1080 + VAO_ENTRE_PRANCHETAS;
    expect(em(x0 + 60, 60)).toBe('No story');
    expect(em(x0 + 600, 600)).toBe('Story');
  });

  describe('rotação', () => {
    it('a camada girada 90 graus responde onde ela aparece, e não onde a caixa sem rotação estava', () => {
      // dentro da caixa sem rotação (x 100 a 300, y 600 a 700), mas fora da camada como ela aparece (x 150 a 250)
      expect(em(120, 650)).toBe('Feed');
      expect(em(280, 650)).toBe('Feed');
      // fora da caixa sem rotação, dentro da camada girada (y 550 a 750)
      expect(em(200, 560)).toBe('Girada');
      expect(em(200, 740)).toBe('Girada');
      expect(em(200, 650)).toBe('Girada');
    });

    it('a 45 graus, o canto da caixa que a envolve fica de fora', () => {
      // centro (500, 950). A caixa que envolve a camada vai de x 393,9 a 606,1 e de y 843,9 a 1056,1
      expect(em(500, 950)).toBe('Inclinada');
      expect(em(400, 850)).toBe('Feed');
      expect(em(600, 1050)).toBe('Feed');
      // ao longo do eixo maior, que agora desce da esquerda para a direita: 90 unidades do centro ainda é dentro
      expect(em(500 + 64, 950 + 64)).toBe('Inclinada');
      // no eixo menor (meia altura de 50): 60 unidades do centro já é fora
      expect(em(500 + 43, 950 - 43)).toBe('Feed');
    });
  });

  describe('forma da camada', () => {
    it('elipse: o canto da caixa não é alvo', () => {
      expect(em(600, 650)).toBe('Elipse');
      expect(em(505, 605)).toBe('Feed');
      expect(em(695, 695)).toBe('Feed');
      expect(em(502, 650)).toBe('Elipse');
    });

    it('retângulo arredondado: o canto fora do raio não é alvo', () => {
      expect(em(900, 650)).toBe('Arredondada');
      expect(em(803, 603)).toBe('Feed');
      expect(em(820, 620)).toBe('Arredondada');
    });
  });

  it('folga: aumenta a área de cada camada, para pegar o que é fino em zoom baixo', () => {
    expect(em(95, 110)).toBe('Feed');
    expect(em(95, 110, { folga: 6 })).toBe('Baixo');
    // a folga gira junto
    expect(em(200, 546)).toBe('Feed');
    expect(em(200, 546, { folga: 6 })).toBe('Girada');
  });

  it('noContemPonto responde por um nó só, em coordenadas da prancheta', () => {
    const girada = acharNo(doc, 'Feed/Girada').no as NoVisual;
    expect(noContemPonto(girada, 200, 560)).toBe(true);
    expect(noContemPonto(girada, 120, 650)).toBe(false);
  });
});
