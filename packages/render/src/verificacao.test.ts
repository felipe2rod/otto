// O medidor e os meios de verificação de verdade: as portas de @otto/documento, implementadas pelo motor.
// As regras do lint são testadas lá, com meios de mentira; aqui se prova que a medida do motor serve a elas.
import { aplicarLote, type Documento, type No, type NoVisual, verificarDocumento } from '@otto/documento';
import { beforeAll, describe, expect, it } from 'vitest';
import { forma, novaSessao, peca, texto } from './apoio-de-teste';
import type { Sessao } from './sessao';
import { criarMedidor, criarMeiosDeVerificacao } from './verificacao';

/** Os filhos da prancheta de índice dado; falha com mensagem clara se ela não existe. */
function filhosDe(d: Documento, indice: number): No[] {
  const p = d.pranchetas[indice];
  if (!p) throw new Error(`o documento do teste não tem a prancheta ${indice}`);
  return p.filhos;
}

let sessao: Sessao;
beforeAll(async () => {
  ({ sessao } = await novaSessao());
});

describe('medidor do motor em alinhar e distribuir', () => {
  const doc = (): Documento =>
    peca(
      [
        texto('Sobretítulo', 'SOBRE', { x: 80, y: 100, largura: 900, altura: 40, peso: 700, tamanho: 26 }),
        texto('Título', 'Jazz', { x: 90, y: 300, largura: 900, altura: 200, fonte: 'DM Serif Display', tamanho: 180 }),
        forma('Botão', 120, 700, 300, 80, '#000000'),
      ],
      { largura: 1080, altura: 1350 },
    ).doc;
  const aplicar = (operacoes: unknown[]): Documento => {
    const r = aplicarLote(doc(), operacoes, { autoria: { tipo: 'designer' }, idDoLote: 'l', medidor: criarMedidor(sessao) });
    if (!r.ok) throw new Error(r.erro.mensagem);
    return r.doc;
  };
  const tinta = (d: Documento, nome: string) => criarMedidor(sessao).tinta(filhosDe(d, 0).find((n) => n.nome === nome) as NoVisual);

  it('distribuir põe espaço exato entre as tintas, sem mover o primeiro', () => {
    const d = aplicar([{ op: 'distribuir', alvos: ['P/Sobretítulo', 'P/Título', 'P/Botão'], eixo: 'vertical', espaco: 24 }]);
    const [a, b, c] = ['Sobretítulo', 'Título', 'Botão'].map((n) => tinta(d, n));
    expect((filhosDe(d, 0)[0] as NoVisual).y).toBe(100);
    expect(Math.round((b?.y ?? 0) - ((a?.y ?? 0) + (a?.h ?? 0)))).toBe(24);
    expect(Math.round((c?.y ?? 0) - ((b?.y ?? 0) + (b?.h ?? 0)))).toBe(24);
  });

  it('alinhar leva a borda esquerda das letras, não a da caixa, à do primeiro alvo', () => {
    const d = aplicar([{ op: 'alinhar', alvos: ['P/Sobretítulo', 'P/Título', 'P/Botão'], borda: 'esquerda' }]);
    expect(new Set(['Sobretítulo', 'Título', 'Botão'].map((n) => Math.round(tinta(d, n).x))).size).toBe(1);
    // a letra não começa na borda da caixa: a caixa do título teve de ir além da do botão
    expect((filhosDe(d, 0)[1] as NoVisual).x).not.toBe((filhosDe(d, 0)[2] as NoVisual).x);
  });

  it('grupo e forma medem pela caixa girada', () => {
    const { doc: d } = peca([forma('Selo', 100, 100, 200, 100, '#000000', { rotacao: 90 })]);
    const c = criarMedidor(sessao).tinta(filhosDe(d, 0)[0] as NoVisual);
    expect([Math.round(c.w), Math.round(c.h)]).toEqual([100, 200]);
  });
});

describe('lint com os meios do motor', () => {
  const regras = (d: Documento): string[] => verificarDocumento(d, criarMeiosDeVerificacao(sessao)).map((a) => `${a.regra}:${a.camada ?? ''}`);

  it('acusa texto transbordando e contraste baixo medido no render de referência, e não acusa o que está bem', () => {
    const { doc } = peca(
      [
        texto('Título', 'Promoção', { x: 80, y: 80, largura: 900, altura: 200, fonte: 'Anton', tamanho: 120, cor: '#0f3b2c' }),
        texto('Legenda', 'um texto longo demais para caber nesta caixa pequena', { x: 80, y: 1100, largura: 300, altura: 40, tamanho: 32, cor: '#eeeeee' }),
      ],
      { largura: 1080, altura: 1350 },
    );
    const r = regras(doc);
    expect(r).toContain('texto-transbordando:Legenda');
    expect(r).toContain('contraste:Legenda');
    expect(r).not.toContain('contraste:Título');
    expect(r).not.toContain('texto-transbordando:Título');
  });

  it('acusa texto de botão fora do centro vertical da forma, medido pela tinta', () => {
    const botao = (yTexto: number) => {
      const { doc } = peca(
        [
          forma('Botão', 80, 1000, 400, 110, '#0f3b2c', { raio: 55 }),
          texto('Texto do botão', 'Compre agora', { x: 80, y: yTexto, largura: 400, altura: 110, peso: 700, tamanho: 36, alinhamento: 'centro', cor: '#ffffff' }),
        ],
        { largura: 1080, altura: 1350 },
      );
      return regras(doc).filter((x) => x.startsWith('texto-descentralizado'));
    };
    expect(botao(1000)).toHaveLength(1);
    // centralizado pela altura da maiúscula: topo da caixa em 1031 põe "Compre agora" no meio do botão
    expect(botao(1031)).toHaveLength(0);
  });

  it('acusa camada coberta por outra e fonte ausente', () => {
    const { doc } = peca(
      [
        forma('Produto', 300, 400, 300, 400, '#ff0000'),
        forma('Gota', 200, 300, 600, 800, '#306dd8'),
        texto('Sem fonte', 'abc', { x: 80, y: 80, largura: 400, altura: 80, fonte: 'Helvetica', tamanho: 60 }),
      ],
      { largura: 1080, altura: 1350, fundo: '#0037a6' },
    );
    const avisos = verificarDocumento(doc, criarMeiosDeVerificacao(sessao));
    expect(avisos.find((a) => a.regra === 'camada-invisivel' && a.camada === 'Produto')?.mensagem).toContain('Gota');
    expect(avisos.some((a) => a.regra === 'fonte-ausente' && a.camada === 'Sem fonte')).toBe(true);
  });

  it('acusa palavra mais larga que a caixa, que o Skia partiria no meio', () => {
    const { doc } = peca([texto('Estreito', 'Paralelepípedo', { x: 80, y: 700, largura: 120, altura: 300, tamanho: 60 })], { largura: 1080, altura: 1350 });
    const aviso = verificarDocumento(doc, criarMeiosDeVerificacao(sessao)).find((a) => a.regra === 'texto-transbordando');
    expect(aviso?.mensagem).toContain('Paralelepípedo');
  });
});
