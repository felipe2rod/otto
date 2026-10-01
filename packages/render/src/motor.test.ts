// A porta MotorDeRender, que o editor consome. Aqui ela roda sobre uma tela de CPU: o WebGL só existe no navegador,
// e o que muda lá é a tela (navegador.ts), não o motor.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { aplicarLote, type Documento, type NoTexto, type Prancheta } from '@otto/documento';
import type { CanvasKit } from 'canvaskit-wasm';
import { beforeAll, describe, expect, it } from 'vitest';
import { canvasKitDeTeste, diferencaMaxima, FOTO, fontesDeTeste, forma, idDe, imagem, imagensDeTeste, peca, pixel, texto } from './apoio-de-teste';
import { renderizarPrancheta } from './compositor';
import { criarMotorSobreTela, type MotorDeRender, type OpcoesDoMotor, type RecursosDoRender, telaDeCpu } from './motor';
import { SENTINELA_DO_MOTOR } from './sentinela';
import { criarSessao } from './sessao';

let ck: CanvasKit;
beforeAll(async () => {
  ck = await canvasKitDeTeste();
});

/** Recursos de mentira: entrega os arquivos de teste e anota o que foi pedido. */
function recursosDeTeste(): RecursosDoRender & { pedidos: string[] } {
  const pedidos: string[] = [];
  return {
    pedidos,
    async imagem(hash) {
      pedidos.push(`imagem ${hash.slice(0, 8)}`);
      const achada = imagensDeTeste().find((i) => i.arquivo === hash);
      if (!achada) throw new Error('404');
      return achada.bytes.slice().buffer;
    },
    async fonte(familia, peso) {
      pedidos.push(`fonte ${familia} ${peso}`);
      const achada = fontesDeTeste().find((f) => f.familia === familia && f.peso === peso);
      if (!achada) throw new Error('404');
      return achada.bytes.slice().buffer;
    },
  };
}

function montar(largura = 400, altura = 300, opcoes: OpcoesDoMotor = {}) {
  const quadros: (() => void)[] = [];
  const recursos = recursosDeTeste();
  const tela = telaDeCpu(ck, largura, altura);
  const motor: MotorDeRender = criarMotorSobreTela(ck, tela, recursos, { ...opcoes, agendar: (quadro) => quadros.push(quadro) });
  const rodar = (): number => {
    const pendentes = quadros.splice(0);
    for (const q of pendentes) q();
    return pendentes.length;
  };
  const em = (x: number, y: number) => {
    const s = tela.superficie();
    const rgba = s
      .getCanvas()
      .readPixels(0, 0, { width: s.width(), height: s.height(), colorType: ck.ColorType.RGBA_8888, alphaType: ck.AlphaType.Unpremul, colorSpace: ck.ColorSpace.SRGB }) as Uint8Array;
    return pixel(rgba, s.width(), x, y);
  };
  return { motor, recursos, rodar, em, tela };
}

const cena = () =>
  peca([
    forma('fundo', 0, 0, 200, 200, '#ff0000'),
    imagem('foto', FOTO, 20, 20, 60, 60),
    texto('titulo', 'Otto', { x: 20, y: 100, largura: 160, altura: 60, fonte: 'Anton', tamanho: 48, cor: '#ffffff', trechos: [{ inicio: 0, fim: 1, fonte: 'IBM Plex Sans', peso: 700 }] }),
  ]);

describe('MotorDeRender', () => {
  it('prepararRecursos busca só as fontes e imagens que o documento usa, uma vez cada', async () => {
    const { motor, recursos } = montar();
    const { doc } = cena();
    await motor.prepararRecursos(doc);
    expect([...recursos.pedidos].sort()).toEqual(['fonte Anton 400', 'fonte IBM Plex Sans 700', `imagem ${FOTO.slice(0, 8)}`]);
    await motor.prepararRecursos(doc);
    expect(recursos.pedidos).toHaveLength(3);
    expect(motor.emFalta).toEqual({ fontes: [], imagens: [] });
    motor.destruir();
  });

  it('recurso que a porta não entrega não derruba o motor: fica listado em emFalta, com a camada', async () => {
    const { motor } = montar();
    const { doc } = peca([texto('Legenda', 'sem fonte', { fonte: 'Helvetica' }), imagem('Foto', 'f'.repeat(64), 0, 0, 50, 50)]);
    await motor.prepararRecursos(doc);
    motor.definirDocumento(doc);
    expect(motor.emFalta.fontes).toEqual([{ familia: 'Helvetica', peso: 400, camadas: ['P/Legenda'] }]);
    expect(motor.emFalta.imagens).toEqual([{ arquivo: 'f'.repeat(64), camadas: ['P/Foto'] }]);
    motor.destruir();
  });

  it('desenha o documento na posição da câmera: x e y em pixels de tela, zoom em pixels por unidade', async () => {
    const { motor, rodar, em } = montar();
    const { doc } = cena();
    await motor.prepararRecursos(doc);
    motor.redimensionar(400, 300, 1);
    motor.definirDocumento(doc);
    motor.definirCamera({ x: 100, y: 50, zoom: 0.5 });
    expect(rodar()).toBe(1);
    // a prancheta de 200 × 200 ocupa de (100, 50) a (200, 150) na tela
    expect(em(150, 140)).toEqual([255, 0, 0, 255]);
    expect(em(50, 100)).not.toEqual([255, 0, 0, 255]);
    expect(em(250, 100)).not.toEqual([255, 0, 0, 255]);
    motor.destruir();
  });

  it('agenda um quadro só por rodada, por mais que mude, e nenhum quando nada muda', async () => {
    const { motor, rodar } = montar();
    const { doc } = cena();
    await motor.prepararRecursos(doc);
    motor.definirDocumento(doc);
    for (let i = 0; i < 10; i++) motor.definirCamera({ x: i, y: 0, zoom: 1 });
    expect(rodar()).toBe(1);
    expect(rodar()).toBe(0);
    expect(motor.contadores.quadros).toBe(1);
    motor.destruir();
  });

  it('arrastar não recompõe prancheta; soltar recompõe só a que mudou', async () => {
    const { motor, rodar } = montar();
    const { doc } = cena();
    await motor.prepararRecursos(doc);
    motor.definirDocumento(doc);
    rodar();
    expect(motor.contadores.composicoesDePrancheta).toBe(1);
    const id = idDe(doc, 'titulo');
    for (let i = 0; i < 20; i++) {
      motor.definirPrevia({ ids: [id], dx: i, dy: i });
      rodar();
    }
    expect(motor.contadores.composicoesDePrancheta).toBe(1);
    // o título é a camada do topo: as partes são duas (abaixo e a camada), montadas uma vez
    expect(motor.contadores.partes).toBe(2);
    const r = aplicarLote(doc, [{ op: 'mover', alvo: id, x: 39, y: 119 }], { autoria: { tipo: 'designer' }, idDoLote: 'l1' });
    if (!r.ok) throw new Error(r.erro.mensagem);
    motor.definirDocumento(r.doc, { tocados: new Set(r.tocados) });
    motor.definirPrevia(null);
    rodar();
    expect(motor.contadores.composicoesDePrancheta).toBe(2);
    motor.definirDocumento(r.doc);
    rodar();
    expect(motor.contadores.composicoesDePrancheta).toBe(2);
    motor.destruir();
  });

  it('o medidor é o do motor de texto, pronto para o aplicarLote local', async () => {
    const { motor } = montar();
    const { doc } = cena();
    await motor.prepararRecursos(doc);
    const no = doc.pranchetas[0]?.filhos[2] as NoTexto;
    const tinta = motor.medidor.tinta(no);
    expect(tinta.w).toBeGreaterThan(40);
    expect(tinta.y).toBeGreaterThan(no.y);
    const r = aplicarLote(doc, [{ op: 'alinhar', alvos: [no.id], borda: 'topo', valor: 10 }], { autoria: { tipo: 'designer' }, idDoLote: 'l2', medidor: motor.medidor });
    expect(r.ok && Math.round(motor.medidor.tinta(r.doc.pranchetas[0]?.filhos[2] as NoTexto).y)).toBe(10);
    motor.destruir();
  });

  it('renderizarReferencia devolve o render de CPU, idêntico ao do servidor', async () => {
    const { motor } = montar();
    const { doc, p } = cena();
    await motor.prepararRecursos(doc);
    motor.definirDocumento(doc);
    const sessao = criarSessao(ck, { fontes: fontesDeTeste(), imagens: imagensDeTeste() });
    const esperado = renderizarPrancheta(sessao, doc, p);
    const r = await motor.renderizarReferencia(p.id);
    expect([r.largura, r.altura]).toEqual([200, 200]);
    expect(diferencaMaxima(r.rgba, esperado.rgba)).toBe(0);
    expect((await motor.renderizarReferencia(p.id, { escala: 0.5, regiao: { x: 0, y: 0, w: 100, h: 100 } })).largura).toBe(50);
    await expect(motor.renderizarReferencia('nao-existe')).rejects.toThrow(/prancheta/);
    sessao.destruir();
    motor.destruir();
  });

  it('redimensionar leva em conta a densidade da tela', async () => {
    const { motor, rodar, em, tela } = montar();
    const doc: Documento = cena().doc;
    await motor.prepararRecursos(doc);
    motor.redimensionar(200, 150, 2);
    expect([tela.superficie().width(), tela.superficie().height()]).toEqual([400, 300]);
    motor.definirDocumento(doc);
    motor.definirCamera({ x: 50, y: 25, zoom: 0.5 });
    rodar();
    // em pixel de tela a prancheta vai de (50, 25) a (150, 125); no canvas de densidade 2, de (100, 50) a (300, 250)
    expect(em(290, 240)).toEqual([255, 0, 0, 255]);
    expect(em(310, 240)).not.toEqual([255, 0, 0, 255]);
    motor.destruir();
  });

  it('depois de destruir, não agenda nem desenha', async () => {
    const { motor, rodar } = montar();
    const { doc } = cena();
    await motor.prepararRecursos(doc);
    motor.definirDocumento(doc);
    motor.destruir();
    motor.definirCamera({ x: 1, y: 1, zoom: 1 });
    rodar();
    expect(motor.contadores.quadros).toBe(0);
  });

  it('a prancheta do teste existe (sanidade do apoio)', () => {
    const p: Prancheta = cena().p;
    expect(p.filhos).toHaveLength(3);
  });

  it('fundo: a cor pedida atrás das pranchetas, ou transparente, para o editor pôr o próprio fundo por baixo do canvas', async () => {
    const { doc } = cena();
    for (const [fundo, esperado] of [
      ['#102030', [16, 32, 48, 255]],
      ['transparente', [0, 0, 0, 0]],
    ] as const) {
      const { motor, rodar, em } = montar(400, 300, { fundo });
      await motor.prepararRecursos(doc);
      motor.redimensionar(400, 300, 1);
      motor.definirDocumento(doc);
      motor.definirCamera({ x: 100, y: 50, zoom: 0.5 });
      rodar();
      expect(em(50, 100)).toEqual(esperado);
      expect(em(150, 140)).toEqual([255, 0, 0, 255]);
      // arrastar com fundo transparente não deixa rastro: a região suja é limpa antes de redesenhar
      motor.definirPrevia({ ids: [idDe(doc, 'foto')], dx: 0, dy: 0 });
      rodar();
      motor.definirPrevia({ ids: [idDe(doc, 'foto')], dx: 300, dy: 0 });
      rodar();
      expect(em(50, 100)).toEqual(esperado);
      expect(em(300, 100)).toEqual(esperado);
      motor.destruir();
    }
  });

  it('fundo que não é cor nem "transparente" é erro de quem chama, dito na hora', () => {
    expect(() => montar(10, 10, { fundo: 'vermelho' })).toThrow(/fundo/);
  });

  it('carrega a sentinela do motor, que o teste do pacote público procura nos scripts das páginas públicas', () => {
    const { motor } = montar();
    expect(motor.sentinela).toBe(SENTINELA_DO_MOTOR);
    expect(SENTINELA_DO_MOTOR).toMatch(/^otto-sentinela-do-motor-[0-9a-f]{8}$/);
    // o arquivo não importa nada: o script de conferência o lê sem empacotador
    expect(readFileSync(path.resolve(import.meta.dirname, 'sentinela.ts'), 'utf8')).not.toMatch(/\bimport\b/);
    motor.destruir();
  });

  it('prévia de redimensionar e de girar: nenhuma prancheta é recomposta durante o gesto, e a camada aparece com a caixa nova', async () => {
    const { motor, rodar, em } = montar(200, 200);
    const { doc } = peca([forma('fundo', 0, 0, 200, 200, '#ffffff'), forma('caixa', 20, 20, 40, 40, '#ff0000'), forma('outra', 150, 150, 30, 30, '#0000ff')]);
    await motor.prepararRecursos(doc);
    motor.redimensionar(200, 200, 1);
    motor.definirDocumento(doc);
    motor.definirCamera({ x: 0, y: 0, zoom: 1 });
    rodar();
    const compostas = motor.contadores.composicoesDePrancheta;
    const id = idDe(doc, 'caixa');
    for (let i = 1; i <= 10; i++) {
      motor.definirPrevia({ ids: [id], dx: 0, dy: 0, caixas: { [id]: { x: 20, y: 20, largura: 40 + i * 10, altura: 40 + i * 5 } } });
      expect(rodar()).toBe(1);
    }
    expect(motor.contadores.composicoesDePrancheta).toBe(compostas);
    // a caixa cresceu até 140 × 90: o ponto (150, 100) agora é vermelho, e a outra camada continua no lugar
    expect(em(150, 100)).toEqual([255, 0, 0, 255]);
    expect(em(165, 165)).toEqual([0, 0, 255, 255]);
    motor.definirPrevia(null);
    rodar();
    expect(em(150, 100)).toEqual([255, 255, 255, 255]);
    motor.destruir();
  });

  describe('aviso quando o que está em falta muda', () => {
    it('avisa ao receber um documento com recurso em falta, e de novo quando o recurso chega; não repete sem mudança', async () => {
      const { motor } = montar();
      const { doc } = cena();
      const avisos: number[] = [];
      motor.aoMudarEmFalta((emFalta) => avisos.push(emFalta.fontes.length + emFalta.imagens.length));
      motor.definirDocumento(doc);
      // duas fontes e uma imagem ainda não foram entregues
      expect(avisos).toEqual([3]);
      motor.definirDocumento(doc);
      motor.definirCamera({ x: 1, y: 1, zoom: 1 });
      expect(avisos).toEqual([3]);
      await motor.prepararRecursos(doc);
      expect(avisos).toEqual([3, 0]);
      await motor.prepararRecursos(doc);
      expect(avisos).toEqual([3, 0]);
      motor.destruir();
    });

    it('a mudança pode vir do documento: uma camada nova com fonte que o motor não tem', async () => {
      const { motor } = montar();
      const { doc } = cena();
      await motor.prepararRecursos(doc);
      motor.definirDocumento(doc);
      const avisos: string[][] = [];
      const cancelar = motor.aoMudarEmFalta((emFalta) => avisos.push(emFalta.fontes.map((f) => f.familia)));
      const r = aplicarLote(doc, [{ op: 'alterar', alvo: 'P/titulo', props: { fonte: 'Helvetica', trechos: [] } }], { autoria: { tipo: 'designer' }, idDoLote: 'troca-de-fonte' });
      if (!r.ok) throw new Error(r.erro.mensagem);
      motor.definirDocumento(r.doc);
      expect(avisos).toEqual([['Helvetica']]);
      cancelar();
      motor.definirDocumento(doc);
      expect(avisos).toHaveLength(1);
      motor.destruir();
    });
  });
});
