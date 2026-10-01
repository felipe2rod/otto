// O motor de verdade: render em CPU e PSD de verdade, com fonte e imagem de teste. Sem banco e sem fila.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { aplicarLote, type Documento, documentoVazio } from '@otto/documento';
import { describe, expect, it } from 'vitest';
import { MotorDeExportacaoComRender } from './motor-de-exportacao-com-render';

const RECURSOS = path.resolve(import.meta.dirname, '../../../../../../packages/render/recursos-de-teste');
const FONTE = readFileSync(path.join(RECURSOS, 'fontes/Anton-Regular.ttf'));
const FOTO = readFileSync(path.join(RECURSOS, 'imagens/foto-paisagem.jpg'));
const SHA = 'f'.repeat(64);

function arvore(): Documento {
  const prancheta = (nome: string, largura: number, altura: number) => ({ op: 'criarPrancheta', nome, largura, altura, fundo: '#fff7e6' });
  const r = aplicarLote(
    documentoVazio(),
    [
      prancheta('Feed', 400, 500),
      prancheta('Story', 360, 640),
      { op: 'criarNo', prancheta: 'Feed', no: { tipo: 'imagem', nome: 'Foto', x: 0, y: 0, largura: 400, altura: 300, arquivo: SHA, larguraOriginal: 1200, alturaOriginal: 800 } },
      { op: 'criarNo', prancheta: 'Feed', no: { tipo: 'texto', nome: 'Título', x: 20, y: 320, largura: 360, altura: 80, conteudo: 'Otto', fonte: 'Anton', tamanho: 60, cor: '#112233' } },
      { op: 'criarNo', prancheta: 'Story', no: { tipo: 'forma', nome: 'Faixa', forma: 'retangulo', x: 0, y: 500, largura: 360, altura: 140, preenchimento: '#cc3300' } },
    ],
    { autoria: { tipo: 'designer' }, idDoLote: 'lote-de-teste', gerarId: (i) => `n${i}` },
  );
  if (!r.ok) throw new Error(r.erro.mensagem);
  return r.doc;
}

const recursos = { fontes: [{ familia: 'Anton', peso: 400, bytes: FONTE, postScript: 'Anton-Regular' }], imagens: [{ arquivo: SHA, bytes: FOTO, tipo: 'image/jpeg' as const }] };
const assinatura = (bytes: Uint8Array, n: number) => Buffer.from(bytes.subarray(0, n)).toString('latin1');

describe('MotorDeExportacaoComRender', () => {
  const motor = new MotorDeExportacaoComRender();
  const doc = arvore();

  it('PSD de uma prancheta: um arquivo PSD com o nome pedido, cedendo a vez entre as etapas', async () => {
    let etapas = 0;
    const [arquivo, ...resto] = await motor.psd(doc, recursos, { nome: 'Promoção - Feed', pranchetas: ['n0'], arquivos: 'por-prancheta' }, async () => void etapas++);
    expect(resto).toEqual([]);
    expect(arquivo?.nome).toBe('Promoção - Feed.psd');
    expect(assinatura(arquivo?.bytes as Uint8Array, 4)).toBe('8BPS');
    expect(etapas).toBeGreaterThan(0);
  });

  it('PSD com as pranchetas juntas: um arquivo só', async () => {
    const arquivos = await motor.psd(doc, recursos, { nome: 'Promoção', pranchetas: ['n0', 'n1'], arquivos: 'juntas' }, async () => {});
    expect(arquivos.map((a) => a.nome)).toEqual(['Promoção (todas as pranchetas).psd']);
    expect(assinatura(arquivos[0]?.bytes as Uint8Array, 4)).toBe('8BPS');
  });

  it('PNG: na escala pedida', async () => {
    const [um] = await motor.png(doc, recursos, { nome: 'Promoção', pranchetas: ['n1'], escala: 1, semFundo: false }, async () => {});
    const [dois] = await motor.png(doc, recursos, { nome: 'Promoção', pranchetas: ['n1'], escala: 2, semFundo: true }, async () => {});
    expect(um?.nome).toBe('Promoção.png');
    const largura = (png: Uint8Array) => Buffer.from(png).readUInt32BE(16);
    expect(assinatura(um?.bytes as Uint8Array, 4)).toBe('\x89PNG');
    expect([largura(um?.bytes as Uint8Array), largura(dois?.bytes as Uint8Array)]).toEqual([360, 720]);
  });

  it('carrega o WebAssembly uma vez só por processo', () => {
    expect(motor.cargasDoMotor).toBe(1);
  });

  it('prancheta que o documento não tem: lança (o caso de uso transforma em falha da prancheta)', async () => {
    await expect(motor.psd(doc, recursos, { nome: 'x', pranchetas: ['nao-existe'], arquivos: 'por-prancheta' }, async () => {})).rejects.toThrow();
  });
});
