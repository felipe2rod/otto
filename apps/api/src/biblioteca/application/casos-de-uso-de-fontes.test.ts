import { readFileSync } from 'node:fs';
import path from 'node:path';
import { CODIGOS_DE_ERRO } from '@otto/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { ErroDaAplicacao } from '../../plataforma/erros/erro-da-aplicacao';
import { CatalogoDeMentira } from '../infrastructure/adaptadores/memoria/catalogo-de-mentira';
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

describe('fontes sob demanda, do catálogo', () => {
  const ANTON = new Uint8Array(readFileSync(path.resolve(import.meta.dirname, '../../../../../packages/render/recursos-de-teste/fontes/Anton-Regular.ttf')));
  let biblioteca: BibliotecaDeFontesEmMemoria;
  let catalogo: CatalogoDeMentira;
  let baixadas: { pesos: number; bytes: number }[];
  let comCatalogo: CasosDeUsoDeFontes;

  beforeEach(async () => {
    biblioteca = new BibliotecaDeFontesEmMemoria();
    await biblioteca.registrar({ familia: 'IBM Plex Sans', peso: 400, nomePostScript: 'IBMPlexSans', licenca: null, conteudo: bytes(4) });
    catalogo = new CatalogoDeMentira(ANTON);
    baixadas = [];
    comCatalogo = new CasosDeUsoDeFontes(biblioteca, catalogo, { aoBaixar: (b) => void baixadas.push({ pesos: b.pesos, bytes: b.bytes }) });
  });

  it('pedir uma família que só está no catálogo a traz para a biblioteca: os pesos de 300 a 700 que ela tem', async () => {
    const detalhe = await comCatalogo.detalhe('Poppins', 500);
    expect(detalhe).toMatchObject({ familia: 'Poppins', peso: 500, arquivo: '/api/fontes/Poppins/500/arquivo' });
    expect(catalogo.baixados).toEqual(['Poppins|300', 'Poppins|400', 'Poppins|500', 'Poppins|600', 'Poppins|700']);
    expect((await biblioteca.pesosDa('Poppins')).map((f) => f.peso)).toEqual([300, 400, 500, 600, 700]);
    expect(baixadas).toEqual([{ pesos: 5, bytes: ANTON.byteLength * 5 }]);
  });

  it('o nome PostScript e a licença são lidos do próprio arquivo baixado', async () => {
    await comCatalogo.detalhe('Lilita One', 400);
    const [fonte] = await biblioteca.pesosDa('Lilita One');
    expect(fonte?.nomePostScript).toBe('Anton-Regular');
    expect(fonte?.licenca).toMatch(/Open Font License|OFL/);
  });

  it('da segunda vez em diante sai da biblioteca: o catálogo não é chamado de novo', async () => {
    await comCatalogo.arquivo('Lilita One', 400);
    await comCatalogo.arquivo('Lilita One', 700);
    await comCatalogo.detalhe('Lilita One', 400);
    expect(catalogo.baixados).toEqual(['Lilita One|400']);
  });

  it('dois pedidos ao mesmo tempo pela mesma família baixam uma vez só', async () => {
    await Promise.all([comCatalogo.arquivo('Lilita One', 400), comCatalogo.arquivo('Lilita One', 400), comCatalogo.garantir(['Lilita One'])]);
    expect(catalogo.baixados).toEqual(['Lilita One|400']);
  });

  it('família que só tem peso fora da escala de 300 a 700 vem com o peso mais perto de 400', async () => {
    expect((await comCatalogo.detalhe('Peso Pesado', 400)).peso).toBe(900);
    expect(catalogo.baixados).toEqual(['Peso Pesado|900']);
  });

  it('família que já está na biblioteca não é procurada no catálogo, mesmo com menos pesos', async () => {
    expect((await comCatalogo.detalhe('IBM Plex Sans', 700)).peso).toBe(400);
    expect(catalogo.baixados).toEqual([]);
    expect(catalogo.listagens).toBe(0);
  });

  it('família que não existe em lugar nenhum continua "não encontrado"', async () => {
    await expect(comCatalogo.detalhe('Comic Sans', 400)).rejects.toMatchObject({ codigo: CODIGOS_DE_ERRO.naoEncontrado });
  });

  it('o que o catálogo entrega e não é fonte não entra na biblioteca', async () => {
    catalogo = new CatalogoDeMentira(new TextEncoder().encode('<html>não sou fonte</html>'));
    comCatalogo = new CasosDeUsoDeFontes(biblioteca, catalogo);
    await expect(comCatalogo.detalhe('Lilita One', 400)).rejects.toMatchObject({ codigo: CODIGOS_DE_ERRO.naoEncontrado });
    expect(await biblioteca.pesosDa('Lilita One')).toEqual([]);
  });

  it('catálogo fora do ar: o que está na biblioteca continua servindo, e o que não está é "não encontrado"', async () => {
    catalogo.foraDoAr = true;
    expect((await comCatalogo.detalhe('IBM Plex Sans', 400)).peso).toBe(400);
    await expect(comCatalogo.detalhe('Poppins', 400)).rejects.toMatchObject({ codigo: CODIGOS_DE_ERRO.naoEncontrado });
    await expect(comCatalogo.garantir(['Poppins'])).resolves.toBeUndefined();
    expect((await comCatalogo.listar('p', { catalogo: true })).itens.map((f) => f.familia)).toEqual(['IBM Plex Sans']);
  });

  it('garantir traz as famílias que um lote cita, e ignora o que passa de um punhado (lote hostil não vira download em massa)', async () => {
    await comCatalogo.garantir(['Lilita One', 'IBM Plex Sans', 'Comic Sans', ...Array.from({ length: 50 }, (_, i) => `Inventada ${i}`), 'Playfair Display']);
    expect(catalogo.baixados).toEqual(['Lilita One|400']);
  });

  it('há um teto de famílias novas por hora: pedir o catálogo inteiro pela rota não vira download em massa', async () => {
    let agora = 1_000_000;
    comCatalogo = new CasosDeUsoDeFontes(biblioteca, catalogo, { agora: () => agora, familiasNovasPorHora: 2 });
    await comCatalogo.detalhe('Lilita One', 400);
    await comCatalogo.detalhe('Peso Pesado', 900);
    await expect(comCatalogo.detalhe('Poppins', 400)).rejects.toMatchObject({ codigo: CODIGOS_DE_ERRO.naoEncontrado });
    expect(catalogo.baixados).toEqual(['Lilita One|400', 'Peso Pesado|900']);
    // o que já veio continua saindo, e passada a hora o teto se renova
    expect((await comCatalogo.detalhe('Lilita One', 400)).peso).toBe(400);
    agora += 3_600_001;
    expect((await comCatalogo.detalhe('Poppins', 400)).peso).toBe(400);
  });

  it('a busca com o catálogo mostra primeiro o que já está na biblioteca, depois o catálogo, com a categoria', async () => {
    const semCatalogo = await comCatalogo.listar('p');
    expect(semCatalogo.itens).toEqual([{ familia: 'IBM Plex Sans', pesos: [400] }]);
    const r = await comCatalogo.listar('p', { catalogo: true });
    expect(r.itens).toEqual([
      { familia: 'IBM Plex Sans', pesos: [400], naBiblioteca: true },
      { familia: 'Poppins', pesos: [100, 200, 300, 400, 500, 600, 700, 800, 900], categoria: 'sem serifa', naBiblioteca: false },
      { familia: 'Playfair Display', pesos: [400, 500, 600, 700, 800, 900], categoria: 'serifada', naBiblioteca: false },
      { familia: 'Peso Pesado', pesos: [900], categoria: 'display', naBiblioteca: false },
    ]);
    expect((await comCatalogo.listar(undefined, { catalogo: true, categoria: 'display' })).itens.map((f) => f.familia)).toEqual(['Lilita One', 'Peso Pesado']);
  });

  it('o que o Otto pode buscar: famílias do catálogo, por nome e categoria, no formato do ciclo', async () => {
    expect(await comCatalogo.buscarNoCatalogo('play', undefined)).toEqual([{ familia: 'Playfair Display', pesos: [400, 500, 600, 700, 800, 900], categoria: 'serifada' }]);
    expect((await comCatalogo.buscarNoCatalogo('', 'display')).map((f) => f.familia)).toEqual(['Lilita One', 'Peso Pesado']);
  });
});
