// As regras do lint, com meios de mentira (apoio-de-teste.ts). Os meios de verdade, com o motor,
// são testados em @otto/render: aqui se prova a regra, lá se prova a medida.
import { describe, expect, it } from 'vitest';
import { aplicar, meiosDeMentira, novoDocumento } from './apoio-de-teste';
import type { Documento } from './esquema';
import { razaoDeContraste, verificarDocumento } from './lint';

const texto = (nome: string, extra: object = {}) => ({
  tipo: 'texto',
  nome,
  x: 80,
  y: 80,
  largura: 900,
  altura: 200,
  conteudo: 'Promoção',
  fonte: 'Anton',
  tamanho: 120,
  cor: 'token:primaria',
  ...extra,
});
const forma = (nome: string, extra: object = {}) => ({ tipo: 'forma', forma: 'retangulo', nome, x: 0, y: 0, largura: 100, altura: 100, preenchimento: '#000000', ...extra });

function base(): Documento {
  return novoDocumento([
    { op: 'definirToken', nome: 'primaria', valor: '#0F3B2C' },
    { op: 'criarPrancheta', nome: 'Feed', largura: 1080, altura: 1350, fundo: '#ffffff' },
    { op: 'criarNo', prancheta: 'Feed', no: texto('Título') },
  ]);
}
const regras = (d: Documento): string[] => verificarDocumento(d, meiosDeMentira).map((a) => `${a.regra}:${a.camada ?? ''}`);

describe('verificar', () => {
  it('o lint não conhece motor de render: recebe diagramação e render por porta', () => {
    const chamadas = { diagramar: 0, renderizar: 0 };
    verificarDocumento(base(), {
      diagramar: (no) => {
        chamadas.diagramar++;
        return meiosDeMentira.diagramar(no);
      },
      renderizar: (doc, p, opcoes) => {
        chamadas.renderizar++;
        return meiosDeMentira.renderizar(doc, p, opcoes);
      },
    });
    expect(chamadas.diagramar).toBeGreaterThan(0);
    expect(chamadas.renderizar).toBeGreaterThan(0);
  });

  it('acusa texto transbordando e contraste baixo, medido no render', () => {
    const d = aplicar(base(), [
      {
        op: 'criarNo',
        prancheta: 'Feed',
        no: texto('Legenda', { y: 1100, largura: 300, altura: 40, conteudo: 'um texto longo demais para caber nesta caixa pequena', fonte: 'IBM Plex Sans', tamanho: 32, cor: '#eeeeee' }),
      },
    ]);
    expect(regras(d)).toContain('texto-transbordando:Legenda');
    expect(regras(d)).toContain('contraste:Legenda');
    expect(regras(d)).not.toContain('contraste:Título');
  });

  it('acusa palavra mais larga que a caixa', () => {
    const d = aplicar(base(), [{ op: 'criarNo', prancheta: 'Feed', no: texto('Estreito', { y: 700, largura: 100, conteudo: 'Paralelepípedo', tamanho: 60, cor: '#000000' }) }]);
    const aviso = verificarDocumento(d, meiosDeMentira).find((a) => a.regra === 'texto-transbordando');
    expect(aviso?.mensagem).toContain('Paralelepípedo');
  });

  it('acusa fonte ausente', () => {
    const d = aplicar(base(), [{ op: 'alterar', alvo: 'Feed/Título', props: { fonte: 'Fonte Que Não Existe' } }]);
    expect(regras(d)).toContain('fonte-ausente:Título');
  });

  it('acusa texto de botão fora do centro vertical da forma', () => {
    const botao = (yTexto: number) => {
      const d = aplicar(base(), [
        { op: 'criarNo', prancheta: 'Feed', no: forma('Botão', { x: 80, y: 1000, largura: 400, altura: 110, raio: 55, preenchimento: '#0F3B2C' }) },
        {
          op: 'criarNo',
          prancheta: 'Feed',
          no: texto('Texto do botão', { y: yTexto, largura: 400, altura: 110, conteudo: 'Compre agora', fonte: 'IBM Plex Sans', peso: 700, tamanho: 36, alinhamento: 'centro', cor: '#ffffff' }),
        },
      ]);
      return verificarDocumento(d, meiosDeMentira).filter((a) => a.regra === 'texto-descentralizado');
    };
    expect(botao(1000)).toHaveLength(1);
    // na tipografia de mentira, o centro ótico (topo da tinta até a linha de base) fica a 0,55 corpo do topo da caixa
    expect(botao(1055 - 36 * 0.55)).toHaveLength(0);
    // texto logo abaixo do botão, encostando nele, não é texto do botão
    expect(botao(1110)).toHaveLength(0);
  });

  it('acusa texto pequeno demais para a largura da prancheta', () => {
    const d = aplicar(base(), [{ op: 'criarNo', prancheta: 'Feed', no: texto('Miúdo', { y: 1200, largura: 600, altura: 40, conteudo: 'rodapé', tamanho: 18 }) }]);
    expect(
      verificarDocumento(d, meiosDeMentira)
        .filter((a) => a.regra === 'texto-pequeno')
        .map((a) => a.camada),
    ).toEqual(['Miúdo']);
  });

  it('não acusa valor solto quando a cor vem de token, e acusa quando o valor do token aparece solto', () => {
    expect(regras(base()).filter((r) => r.startsWith('valor-solto'))).toEqual([]);
    const d = aplicar(base(), [{ op: 'criarNo', prancheta: 'Feed', no: forma('Faixa', { y: 600, largura: 1080, altura: 300, preenchimento: '#0f3b2c' }) }]);
    expect(regras(d)).toContain('valor-solto:Faixa');
  });

  it('acusa faixa de baixo do story vazia e aceita quando a cor sangra', () => {
    const story = (altura: number) =>
      verificarDocumento(
        novoDocumento([
          { op: 'criarPrancheta', nome: 'Story', largura: 1080, altura: 1920, fundo: '#ffffff' },
          { op: 'criarNo', prancheta: 'Story', no: forma('Faixa', { largura: 1080, altura, preenchimento: '#0F3B2C' }) },
        ]),
        meiosDeMentira,
      ).filter((a) => a.regra === 'faixa-vazia');
    expect(story(1000)).toHaveLength(1);
    expect(story(1920)).toHaveLength(0);
  });

  it('acusa botão colado numa faixa grande', () => {
    const d = aplicar(base(), [
      { op: 'criarNo', prancheta: 'Feed', no: forma('Botão', { x: 80, y: 900, largura: 400, altura: 90, raio: 45, preenchimento: '#F4C430' }) },
      { op: 'criarNo', prancheta: 'Feed', no: forma('Faixa', { y: 996, largura: 1080, altura: 354, preenchimento: '#0F3B2C' }) },
    ]);
    expect(verificarDocumento(d, meiosDeMentira).some((a) => a.regra === 'ritmo' && a.camada === 'Botão')).toBe(true);
  });

  it('filtra por prancheta, pelo id ou pelo nome', () => {
    const d = aplicar(base(), [{ op: 'criarPrancheta', nome: 'Vazia', largura: 100, altura: 100, fundo: '#ffffff' }]);
    expect(verificarDocumento(d, meiosDeMentira, 'Vazia').map((a) => a.regra)).toEqual(['prancheta-vazia']);
  });
});

describe('verificar: camada que não aparece', () => {
  const doc = (ops: unknown[]): Documento => novoDocumento([{ op: 'criarPrancheta', nome: 'Feed', largura: 1080, altura: 1350, fundo: '#0037a6' }, ...ops]);
  const invisiveis = (d: Documento) => verificarDocumento(d, meiosDeMentira).filter((a) => a.regra === 'camada-invisivel');

  it('acusa camada coberta por outra e diz qual cobre', () => {
    const [a] = invisiveis(
      doc([
        { op: 'criarNo', prancheta: 'Feed', no: forma('Produto', { x: 300, y: 400, largura: 300, altura: 400, preenchimento: '#ff0000' }) },
        { op: 'criarNo', prancheta: 'Feed', no: forma('Gota', { x: 200, y: 300, largura: 600, altura: 800, preenchimento: '#306dd8' }) },
      ]),
    );
    expect(a?.camada).toBe('Produto');
    expect(a?.mensagem).toContain('Gota');
  });

  it('acusa logo da mesma cor do fundo', () => {
    const [a] = invisiveis(
      doc([
        {
          op: 'criarNo',
          prancheta: 'Feed',
          no: { tipo: 'vetor', nome: 'Logo', x: 300, y: 100, largura: 400, altura: 200, moldura: [2, 1], caminhos: [{ d: 'M0 0C0 0 2 0 2 0C2 0 2 1 2 1C2 1 0 1 0 1Z', preenchimento: '#0037a6' }] },
        },
      ]),
    );
    expect(a?.camada).toBe('Logo');
    expect(a?.mensagem).toContain('cor');
  });

  it('não acusa o que aparece, nem um fio fino', () => {
    expect(
      invisiveis(
        doc([
          { op: 'criarNo', prancheta: 'Feed', no: forma('Gota', { forma: 'elipse', x: 200, y: 300, largura: 600, altura: 700, preenchimento: '#306dd8' }) },
          { op: 'criarNo', prancheta: 'Feed', no: forma('Fio', { x: 72, y: 1268, largura: 64, altura: 4, preenchimento: '#ffffff' }) },
        ]),
      ),
    ).toEqual([]);
  });
});

describe('contraste', () => {
  it('preto sobre branco dá 21:1', () => {
    expect(razaoDeContraste(1, 0)).toBeCloseTo(21, 5);
  });
});
