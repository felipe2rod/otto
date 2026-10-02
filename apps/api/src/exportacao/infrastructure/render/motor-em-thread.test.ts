// O motor de exportação fora do laço principal: render e PSD de verdade, cada exportação numa thread.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { aplicarLote, type Documento, documentoVazio } from '@otto/documento';
import { afterAll, describe, expect, it } from 'vitest';
import { MotorDeExportacaoEmThread, MotorInterrompido } from './motor-em-thread';

const RECURSOS = path.resolve(import.meta.dirname, '../../../../../../packages/render/recursos-de-teste');
const FONTE = readFileSync(path.join(RECURSOS, 'fontes/Anton-Regular.ttf'));
const FOTO = readFileSync(path.join(RECURSOS, 'imagens/foto-paisagem.jpg'));
const SHA = 'f'.repeat(64);

function arvore(lado = 400): Documento {
  const r = aplicarLote(
    documentoVazio(),
    [
      { op: 'criarPrancheta', nome: 'Feed', largura: lado, altura: lado, fundo: '#fff7e6' },
      { op: 'criarPrancheta', nome: 'Story', largura: lado, altura: lado, fundo: '#101010' },
      { op: 'criarNo', prancheta: 'Feed', no: { tipo: 'imagem', nome: 'Foto', x: 0, y: 0, largura: lado, altura: lado * 0.6, arquivo: SHA, larguraOriginal: 1200, alturaOriginal: 800 } },
      { op: 'criarNo', prancheta: 'Feed', no: { tipo: 'texto', nome: 'Título', x: 20, y: lado * 0.7, largura: lado - 40, altura: 80, conteudo: 'Otto', fonte: 'Anton', tamanho: 60, cor: '#112233' } },
      { op: 'criarNo', prancheta: 'Story', no: { tipo: 'forma', nome: 'Faixa', forma: 'retangulo', x: 0, y: 0, largura: lado, altura: lado / 2, preenchimento: '#cc3300' } },
    ],
    { autoria: { tipo: 'designer' }, idDoLote: 'lote-de-teste', gerarId: (i) => `n${i}` },
  );
  if (!r.ok) throw new Error(r.erro.mensagem);
  return r.doc;
}

const recursos = () => ({ fontes: [{ familia: 'Anton', peso: 400, bytes: FONTE, postScript: 'Anton-Regular' }], imagens: [{ arquivo: SHA, bytes: FOTO, tipo: 'image/jpeg' as const }] });
const assinatura = (bytes: Uint8Array, n: number) => Buffer.from(bytes.subarray(0, n)).toString('latin1');
const semPausa = async () => {};

// cada thread sobe em cerca de 1 s neste ambiente (TypeScript transformado na hora); com a suíte inteira em paralelo, mais
describe('MotorDeExportacaoEmThread', { timeout: 60_000 }, () => {
  const motor = new MotorDeExportacaoEmThread({ threads: 2 });
  afterAll(() => motor.fechar());

  it('exporta os quatro formatos, com os mesmos nomes e assinaturas do motor no laço principal', async () => {
    const doc = arvore();
    const [psd] = await motor.psd(doc, recursos(), { nome: 'Promoção - Feed', pranchetas: ['n0'], arquivos: 'por-prancheta' }, semPausa);
    const [png] = await motor.png(doc, recursos(), { nome: 'Promoção - Story', pranchetas: ['n1'], escala: 2, semFundo: false }, semPausa);
    const [svg] = await motor.svg(doc, recursos(), { nome: 'Promoção - Feed', pranchetas: ['n0'] }, semPausa);
    const [pdf] = await motor.pdf(doc, recursos(), { nome: 'Promoção', pranchetas: ['n0', 'n1'], arquivos: 'juntas' }, semPausa);
    expect([psd?.nome, png?.nome, svg?.nome, pdf?.nome]).toEqual(['Promoção - Feed.psd', 'Promoção - Story.png', 'Promoção - Feed.svg', 'Promoção.pdf']);
    expect(assinatura(psd?.bytes as Uint8Array, 4)).toBe('8BPS');
    expect(assinatura(png?.bytes as Uint8Array, 4)).toBe('\x89PNG');
    expect(Buffer.from(png?.bytes as Uint8Array).readUInt32BE(16)).toBe(800);
    expect(new TextDecoder().decode(svg?.bytes)).toContain('<text');
    expect(assinatura(pdf?.bytes as Uint8Array, 5)).toBe('%PDF-');
  });

  it('os recursos de quem chama continuam inteiros depois da exportação (a thread recebe cópia)', async () => {
    const r = recursos();
    await motor.png(arvore(), r, { nome: 'x', pranchetas: ['n0'], escala: 1, semFundo: false }, semPausa);
    expect(r.fontes[0]?.bytes.byteLength).toBe(FONTE.byteLength);
    expect(r.imagens[0]?.bytes.byteLength).toBe(FOTO.byteLength);
  });

  it('o laço principal continua respondendo enquanto a exportação roda (é o que deixa sair sinal de vida e a rota de saúde)', async () => {
    const doc = arvore(1600);
    let maiorPausa = 0;
    let ultimo = performance.now();
    const relogio = setInterval(() => {
      const agora = performance.now();
      maiorPausa = Math.max(maiorPausa, agora - ultimo);
      ultimo = agora;
    }, 10);
    const inicio = performance.now();
    await motor.png(doc, recursos(), { nome: 'grande', pranchetas: ['n0', 'n1'], escala: 2, semFundo: false }, semPausa);
    const duracao = performance.now() - inicio;
    clearInterval(relogio);
    expect(duracao).toBeGreaterThan(300);
    // a cópia dos recursos e do resultado custa alguns milissegundos; o render, que custa a duração inteira, não está aqui
    expect(maiorPausa).toBeLessThan(duracao / 3);
    expect(maiorPausa).toBeLessThan(250);
  }, 60_000);

  it('duas exportações ao mesmo tempo rodam em threads diferentes, e uma terceira espera uma vaga', async () => {
    const doc = arvore(1200);
    const intervalos: [number, number][] = [];
    const exportar = async () => {
      const comeco = performance.now();
      await motor.png(doc, recursos(), { nome: 'x', pranchetas: ['n0', 'n1'], escala: 2, semFundo: false }, semPausa);
      intervalos.push([comeco, performance.now()]);
    };
    await Promise.all([exportar(), exportar(), exportar()]);
    expect(intervalos).toHaveLength(3);
    expect(motor.threadsNoMaximo).toBe(2);
  });

  it('a thread que morre no meio rejeita a exportação dela com MotorInterrompido, e a seguinte roda numa thread nova', async () => {
    const doc = arvore(2000);
    const emCurso = motor.png(doc, recursos(), { nome: 'x', pranchetas: ['n0', 'n1'], escala: 2, semFundo: false }, semPausa);
    await new Promise((ok) => setTimeout(ok, 150));
    await motor.derrubarThreads();
    await expect(emCurso).rejects.toBeInstanceOf(MotorInterrompido);
    const [png] = await motor.png(arvore(), recursos(), { nome: 'depois', pranchetas: ['n0'], escala: 1, semFundo: false }, semPausa);
    expect(png?.nome).toBe('depois.png');
  });

  it('erro do motor (prancheta que não existe) chega como erro, com o tipo, e a thread continua de pé', async () => {
    await expect(motor.psd(arvore(), recursos(), { nome: 'x', pranchetas: ['nao-existe'], arquivos: 'por-prancheta' }, semPausa)).rejects.toThrow();
    const [png] = await motor.png(arvore(), recursos(), { nome: 'ainda', pranchetas: ['n0'], escala: 1, semFundo: false }, semPausa);
    expect(png?.nome).toBe('ainda.png');
  });

  it('a thread usada e parada é encerrada (a memória do render volta ao sistema) e outra já fica de prontidão para a próxima exportação', async () => {
    const outro = new MotorDeExportacaoEmThread({ threads: 1, ociosaPorMs: 100 });
    expect(outro.threadsVivas).toBe(0);
    // chamadas seguidas (as pranchetas de uma exportação) usam a mesma thread: subir uma thread custa mais que renderizar uma prancheta leve
    for (const prancheta of ['n0', 'n1', 'n0']) await outro.png(arvore(), recursos(), { nome: 'x', pranchetas: [prancheta], escala: 1, semFundo: false }, semPausa);
    expect(outro.threadsCriadas).toBe(1);
    // parada por mais que o tempo de ociosidade: é encerrada, e a substituta sobe
    await new Promise((ok) => setTimeout(ok, 500));
    expect(outro.threadsVivas).toBe(1);
    expect(outro.threadsCriadas).toBe(2);
    // a substituta, que nunca foi usada, não é encerrada por ociosidade (não ficaria trocando de thread à toa)
    await new Promise((ok) => setTimeout(ok, 400));
    expect(outro.threadsCriadas).toBe(2);
    await outro.fechar();
    expect(outro.threadsVivas).toBe(0);
  });

  it('depois de fechar, não aceita mais exportação', async () => {
    const outro = new MotorDeExportacaoEmThread({ threads: 1 });
    await outro.png(arvore(), recursos(), { nome: 'x', pranchetas: ['n0'], escala: 1, semFundo: false }, semPausa);
    await outro.fechar();
    await expect(outro.png(arvore(), recursos(), { nome: 'x', pranchetas: ['n0'], escala: 1, semFundo: false }, semPausa)).rejects.toBeInstanceOf(MotorInterrompido);
  });
});
