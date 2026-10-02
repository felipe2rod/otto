// A escolha do que fazer com cada fonte que o arquivo pede (packages/shared/src/importacao.ts).
import { type FonteDoPsd, PedidoDeImportacao } from '@otto/shared';
import { describe, expect, it } from 'vitest';
import { contarDestinos, escolhaPadrao, escolhasParaOPedido, opcoesDe, trocasSemFonte } from './fontesDoPsd';

const TEM: FonteDoPsd = { postScript: 'Anton-Regular', situacao: 'na_biblioteca', familia: 'Anton', peso: 400 };
const CATALOGO: FonteDoPsd = { postScript: 'Bitter-Bold', situacao: 'no_catalogo', familia: 'Bitter', peso: 700 };
const FALTA: FonteDoPsd = { postScript: 'Gotham-Black', situacao: 'em_falta' };
const PARECIDA: FonteDoPsd = { postScript: 'IBMPlexSans-Black', situacao: 'em_falta', sugestao: { familia: 'IBM Plex Sans', peso: 700 } };
const FONTES = [TEM, CATALOGO, FALTA, PARECIDA];

describe('fontes do PSD', () => {
  it('o padrão de cada situação: a da biblioteca não tem escolha, a do catálogo é baixada, a que falta vira imagem', () => {
    expect(opcoesDe(TEM)).toEqual([]);
    expect(escolhaPadrao(TEM)).toBeUndefined();
    expect(opcoesDe(CATALOGO)).toEqual(['baixar', 'substituir', 'imagem']);
    expect(escolhaPadrao(CATALOGO)).toEqual({ fazer: 'baixar' });
    expect(opcoesDe(FALTA)).toEqual(['substituir', 'imagem']);
    expect(escolhaPadrao(FALTA)).toEqual({ fazer: 'imagem' });
  });

  it('sem escolha nenhuma, o pedido não cita fonte: vale o padrão do servidor', () => {
    expect(escolhasParaOPedido(FONTES, {})).toEqual([]);
    // escolher o que já é o padrão também não vai
    expect(escolhasParaOPedido(FONTES, { 'Bitter-Bold': { fazer: 'baixar' }, 'Gotham-Black': { fazer: 'imagem' } })).toEqual([]);
  });

  it('só o que foge do padrão vai no pedido, no formato que o servidor aceita', () => {
    const fontes = escolhasParaOPedido(FONTES, {
      'Bitter-Bold': { fazer: 'imagem' },
      'Gotham-Black': { fazer: 'substituir', familia: 'Anton', peso: 400 },
      // escolha para fonte que não está no arquivo (ou que o Otto já tem) é ignorada
      'Anton-Regular': { fazer: 'imagem' },
      Fantasma: { fazer: 'imagem' },
    });
    expect(fontes).toEqual([
      { postScript: 'Bitter-Bold', fazer: 'imagem' },
      { postScript: 'Gotham-Black', fazer: 'substituir', por: { familia: 'Anton', peso: 400 } },
    ]);
    expect(PedidoDeImportacao.safeParse({ fontes }).success).toBe(true);
  });

  it('troca sem fonte escolhida não vai no pedido, e é contada para a tela não deixar importar', () => {
    const escolhas = { 'Gotham-Black': { fazer: 'substituir' as const, familia: '', peso: 400 }, 'IBMPlexSans-Black': { fazer: 'substituir' as const, familia: 'IBM Plex Sans', peso: 700 } };
    expect(trocasSemFonte(FONTES, escolhas)).toEqual(['Gotham-Black']);
    expect(escolhasParaOPedido(FONTES, escolhas)).toEqual([{ postScript: 'IBMPlexSans-Black', fazer: 'substituir', por: { familia: 'IBM Plex Sans', peso: 700 } }]);
  });

  it('conta quantas fontes vêm editáveis e quantas viram imagem, com as escolhas de agora', () => {
    expect(contarDestinos(FONTES, {})).toEqual({ editaveis: 2, imagens: 2 });
    expect(contarDestinos(FONTES, { 'Gotham-Black': { fazer: 'substituir', familia: 'Anton', peso: 400 }, 'Bitter-Bold': { fazer: 'imagem' } })).toEqual({ editaveis: 2, imagens: 2 });
    expect(contarDestinos(FONTES, { 'Gotham-Black': { fazer: 'substituir', familia: 'Anton', peso: 400 }, 'IBMPlexSans-Black': { fazer: 'substituir', familia: 'IBM Plex Sans', peso: 700 } })).toEqual(
      { editaveis: 4, imagens: 0 },
    );
  });
});
