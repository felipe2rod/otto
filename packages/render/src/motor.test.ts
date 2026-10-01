// A porta MotorDeRender, que o editor consome. Aqui ela roda sobre uma tela de CPU: o WebGL só existe no navegador,
// e o que muda lá é a tela (navegador.ts), não o motor.
import { aplicarLote, type Documento, type NoTexto, type Prancheta } from '@otto/documento';
import type { CanvasKit } from 'canvaskit-wasm';
import { beforeAll, describe, expect, it } from 'vitest';
import { canvasKitDeTeste, diferencaMaxima, FOTO, fontesDeTeste, forma, idDe, imagem, imagensDeTeste, peca, pixel, texto } from './apoio-de-teste';
import { renderizarPrancheta } from './compositor';
import { criarMotorSobreTela, type MotorDeRender, type RecursosDoRender, telaDeCpu } from './motor';
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

function montar(largura = 400, altura = 300) {
  const quadros: (() => void)[] = [];
  const recursos = recursosDeTeste();
  const tela = telaDeCpu(ck, largura, altura);
  const motor: MotorDeRender = criarMotorSobreTela(ck, tela, recursos, { agendar: (quadro) => quadros.push(quadro) });
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
});
