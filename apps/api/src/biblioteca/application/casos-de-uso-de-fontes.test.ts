import { CODIGOS_DE_ERRO } from '@otto/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { ErroDaAplicacao } from '../../plataforma/erros/erro-da-aplicacao';
import { BibliotecaDeFontesEmMemoria } from '../infrastructure/memoria/biblioteca-de-fontes-em-memoria';
import { CasosDeUsoDeFontes } from './casos-de-uso-de-fontes';

let fontes: CasosDeUsoDeFontes;
const bytes = (n: number) => Uint8Array.from([n, n, n]);

beforeEach(async () => {
  const biblioteca = new BibliotecaDeFontesEmMemoria();
  await biblioteca.registrar({ familia: 'IBM Plex Sans', peso: 400, nomePostScript: 'IBMPlexSans', licenca: null, conteudo: bytes(4) });
  await biblioteca.registrar({ familia: 'IBM Plex Sans', peso: 700, nomePostScript: 'IBMPlexSans-Bold', licenca: null, conteudo: bytes(7) });
  await biblioteca.registrar({ familia: 'Anton', peso: 400, nomePostScript: 'Anton-Regular', licenca: null, conteudo: bytes(1) });
  fontes = new CasosDeUsoDeFontes(biblioteca);
});

describe('fontes da biblioteca', () => {
  it('lista as famílias com os pesos, e filtra pela busca', async () => {
    expect(await fontes.listar()).toEqual({
      itens: [
        { familia: 'Anton', pesos: [400] },
        { familia: 'IBM Plex Sans', pesos: [400, 700] },
      ],
    });
    expect((await fontes.listar('plex')).itens.map((f) => f.familia)).toEqual(['IBM Plex Sans']);
  });

  it('detalhe: devolve o peso que existe mais perto do pedido e o endereço dos bytes', async () => {
    expect(await fontes.detalhe('IBM Plex Sans', 600)).toEqual({ familia: 'IBM Plex Sans', peso: 700, nomePostScript: 'IBMPlexSans-Bold', arquivo: '/api/fontes/IBM%20Plex%20Sans/700/arquivo' });
  });

  it('arquivo: os bytes do peso mais próximo, com o hash para o cache', async () => {
    const a = await fontes.arquivo('IBM Plex Sans', 300);
    expect([Array.from(a.bytes), a.peso]).toEqual([[4, 4, 4], 400]);
    expect(a.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('família desconhecida e peso que não é número são "não encontrado"', async () => {
    for (const tentativa of [fontes.detalhe('Comic Sans', 400), fontes.arquivo('Comic Sans', 400), fontes.arquivo('Anton', Number.NaN), fontes.detalhe('Anton', -1)]) {
      const e = await tentativa.then(
        () => undefined,
        (erro: unknown) => erro,
      );
      expect(e).toBeInstanceOf(ErroDaAplicacao);
      expect((e as ErroDaAplicacao).codigo).toBe(CODIGOS_DE_ERRO.naoEncontrado);
    }
  });
});
