// O que acontece quando o lote não entra: a peça foi alterada por fora, a conexão caiu, ou o
// servidor fala um catálogo de operações mais novo que o da página.
import { editor as textos } from '../src/textos/editor';
import { erros } from '../src/textos/erros';
import { camada } from './apoio/api';
import { CORES, expect, test } from './apoio/teste';

const NO_BLOCO = { x: 300, y: 250 };

test.describe('lote que não entra', () => {
  test.beforeEach(async ({ criarPeca, editor }) => {
    await editor.abrir(await criarPeca());
    await editor.esperarCor(NO_BLOCO, CORES.bloco);
  });

  test('peça alterada por fora: o editor avisa, recarrega a versão atual e a alteração seguinte entra', async ({ editor, api }) => {
    const peca = await editor.servidor();
    // "outra aba" muda o Disco de lugar
    await api.lote(peca.id, [{ op: 'mover', alvo: camada(peca, 'Disco').id, x: 600, y: 900 }], 'outra aba');

    await editor.clicar(NO_BLOCO);
    await editor.teclar('ArrowRight');
    await expect(editor.alerta).toContainText(erros.doCodigo('versao_desatualizada'));
    // a alteração feita sobre a versão velha não entrou; a de fora chegou à tela
    expect(camada(await editor.servidor(), 'Bloco').x).toBe(100);
    await editor.esperarCor({ x: 750, y: 1050 }, CORES.disco);

    await editor.teclar('ArrowRight');
    await expect.poll(async () => camada(await editor.servidor(), 'Bloco').x).toBe(101);
  });

  test('sem conexão: o topo diz, a edição trava, e o lote parado entra quando a conexão volta', async ({ editor, context }) => {
    await editor.clicar(NO_BLOCO);
    await context.setOffline(true);
    await editor.teclar('ArrowRight');
    await expect(editor.salvamento).toHaveText(textos.topo.salvamento['sem-conexao']);

    // com a edição travada, outra seta não vira lote
    await editor.teclar('ArrowRight');
    expect(camada(await editor.servidor(), 'Bloco').x).toBe(100);

    await context.setOffline(false);
    await expect(editor.salvamento).toHaveText(textos.topo.salvamento.salvo, { timeout: 30_000 });
    // entrou UMA vez: a segunda seta foi recusada na hora, e o reenvio usa o mesmo id de lote
    expect(camada(await editor.servidor(), 'Bloco').x).toBe(101);
  });

  test('catálogo desatualizado: a edição trava e a tela pede para recarregar, sem sumir', async ({ editor }) => {
    let lotes = 0;
    await editor.page.route('**/api/documentos/*/lotes', async (rota) => {
      lotes++;
      await rota.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ codigo: 'catalogo_desatualizado', detalhe: { catalogoDoServidor: 99 } }) });
    });

    await editor.clicar(NO_BLOCO);
    await editor.teclar('ArrowRight');
    await expect(editor.alerta.getByRole('button', { name: textos.avisos.recarregar })).toBeVisible();
    await expect(editor.salvamento).toHaveText(textos.topo.salvamento.leitura);

    await editor.teclar('ArrowRight');
    expect(lotes).toBe(1);
    expect(camada(await editor.servidor(), 'Bloco').x).toBe(100);
  });
});
