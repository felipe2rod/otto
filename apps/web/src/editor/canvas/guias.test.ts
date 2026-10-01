import { describe, expect, it } from 'vitest';
import { caixaDoConteudo, disporPranchetas, guiasDoStory, VAO_ENTRE_PRANCHETAS } from './guias';

const feed = { id: 'feed', largura: 1080, altura: 1350 };
const story = { id: 'story', largura: 1080, altura: 1920 };

describe('disposição das pranchetas', () => {
  it('põe as pranchetas lado a lado, com um vão entre elas', () => {
    const posicoes = disporPranchetas([feed, story]);
    expect(posicoes.get('feed')).toEqual({ x: 0, y: 0 });
    expect(posicoes.get('story')).toEqual({ x: 1080 + VAO_ENTRE_PRANCHETAS, y: 0 });
  });

  it('a caixa do conteúdo cobre todas as pranchetas', () => {
    expect(caixaDoConteudo([feed, story])).toEqual({ x: 0, y: 0, largura: 1080 + VAO_ENTRE_PRANCHETAS + 1080, altura: 1920 });
  });

  it('sem prancheta não há caixa', () => {
    expect(caixaDoConteudo([])).toBeUndefined();
  });
});

describe('guias da zona da interface no story', () => {
  it('prancheta 9:16 ganha a faixa de cima e a de baixo, proporcionais à altura', () => {
    expect(guiasDoStory(story)).toEqual({ topo: 250, base: 340 });
    expect(guiasDoStory({ id: 's', largura: 540, altura: 960 })).toEqual({ topo: 125, base: 170 });
  });

  it('prancheta de outra proporção não tem guia', () => {
    expect(guiasDoStory(feed)).toBeNull();
  });
});
