// @vitest-environment jsdom

import type { Documento, Operacao } from '@otto/documento';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { editor as textos } from '../../textos/editor';
import { montarDocumentoDeExemplo } from '../bancada/documentoDeExemplo';
import { criarArmazem } from '../nucleo/armazem';
import { criarInterface } from '../nucleo/interface';
import type { SessaoDoDocumento } from '../nucleo/sessaoDoDocumento';
import { criarVisao } from '../nucleo/visao';
import { AreaDoCanvas } from './AreaDoCanvas';
import { criarArmazemDaPrevia } from './controleDeGestos';
import type { FabricaDeMotor, MotorDeRender, RecursosEmFalta } from './motor';

beforeAll(() => {
  // o jsdom não tem canvas: sem contexto 2D, as sobreposições simplesmente não desenham
  HTMLCanvasElement.prototype.getContext = (() => null) as unknown as HTMLCanvasElement['getContext'];
});
afterEach(cleanup);

const EXEMPLO = montarDocumentoDeExemplo({ hash: 'a'.repeat(64), largura: 1200, altura: 800 });

function motorFalso() {
  let aoPerder: (() => void) | undefined;
  let aoFaltar: ((f: RecursosEmFalta) => void) | undefined;
  const motor = {
    redimensionar: vi.fn(),
    definirDocumento: vi.fn(),
    definirPrevia: vi.fn(),
    definirCamera: vi.fn(),
    prepararRecursos: vi.fn(async () => undefined),
    medidor: { tinta: () => ({ x: 0, y: 0, w: 0, h: 0 }) },
    emFalta: { fontes: [], imagens: [] },
    aoMudarEmFalta: vi.fn((aviso: (f: RecursosEmFalta) => void) => {
      aoFaltar = aviso;
      return () => {};
    }),
    sentinela: 'motor-de-teste',
    contadores: { composicoesDePrancheta: 0, partes: 0, quadros: 0 },
    renderizarReferencia: vi.fn(),
    aoPerderContexto: vi.fn((aviso: () => void) => {
      aoPerder = aviso;
    }),
    destruir: vi.fn(),
  } satisfies MotorDeRender;
  return { motor, perderContexto: () => aoPerder?.(), faltar: (f: RecursosEmFalta) => aoFaltar?.(f) };
}

function montar() {
  const { motor, perderContexto } = motorFalso();
  const criarMotor = vi.fn<FabricaDeMotor>(async () => motor);
  const visao = criarVisao();
  const iface = criarInterface();
  const documento = criarArmazem<Documento | undefined>(undefined);
  const previa = criarArmazemDaPrevia();
  let renderizacoes = 0;
  function Contador() {
    renderizacoes++;
    return <AreaDoCanvas visao={visao} interface={iface} documento={documento} previa={previa} criarMotor={criarMotor} />;
  }
  const tela = render(<Contador />);
  return { motor, perderContexto, criarMotor, visao, iface, documento, previa, tela, renderizacoes: () => renderizacoes };
}

describe('área do canvas', () => {
  it('cria o motor uma vez, com o elemento canvas, e entrega a câmera atual', async () => {
    const { criarMotor, motor, visao } = montar();

    await waitFor(() => expect(motor.definirCamera).toHaveBeenCalled());

    expect(criarMotor).toHaveBeenCalledTimes(1);
    expect(criarMotor.mock.calls[0]?.[0]).toBeInstanceOf(HTMLCanvasElement);
    expect(motor.definirCamera).toHaveBeenLastCalledWith(visao.camera.obter());
  });

  it('mover a câmera chega ao motor sem renderizar componente nenhum', async () => {
    const { motor, visao, renderizacoes } = montar();
    await waitFor(() => expect(motor.definirCamera).toHaveBeenCalled());
    const antes = renderizacoes();

    act(() => visao.camera.definir({ x: 40, y: 30, zoom: 1 }));

    expect(motor.definirCamera).toHaveBeenLastCalledWith({ x: 40, y: 30, zoom: 1 });
    expect(renderizacoes()).toBe(antes);
  });

  it('o indicador de zoom acompanha a câmera', async () => {
    const { visao, motor } = montar();
    await waitFor(() => expect(motor.definirCamera).toHaveBeenCalled());

    act(() => visao.camera.definir({ x: 0, y: 0, zoom: 0.62 }));

    expect(screen.getByRole('status').textContent).toBe(textos.canvas.porcentagem(0.62));
  });

  it('o documento chega ao motor quando existe, e de novo quando muda', async () => {
    const { motor, documento } = montar();
    await waitFor(() => expect(motor.definirCamera).toHaveBeenCalled());
    expect(motor.definirDocumento).not.toHaveBeenCalled();

    const doc = EXEMPLO;
    act(() => documento.definir(doc));

    expect(motor.definirDocumento).toHaveBeenCalledWith(doc);
    expect(motor.prepararRecursos).toHaveBeenCalledWith(doc);
  });

  it('o botão de enquadrar ajusta a câmera ao conteúdo', async () => {
    const { motor, documento, visao } = montar();
    await waitFor(() => expect(motor.definirCamera).toHaveBeenCalled());
    visao.definirArea({ largura: 1000, altura: 800 });
    act(() => documento.definir(EXEMPLO));

    act(() => screen.getByRole('button', { name: textos.canvas.enquadrar }).click());

    expect(visao.camera.obter().zoom).toBeLessThan(1);
  });

  it('comparar com outra peça (ver o antes) não mexe na câmera do designer, nem ao voltar', async () => {
    const { motor } = motorFalso();
    const visao = criarVisao();
    const documento = criarArmazem<Documento | undefined>(undefined);
    let comparando = false;
    render(<AreaDoCanvas visao={visao} interface={criarInterface()} documento={documento} criarMotor={async () => motor} semEnquadrar={() => comparando} />);
    await waitFor(() => expect(motor.definirCamera).toHaveBeenCalled());
    visao.definirArea({ largura: 1000, altura: 800 });
    act(() => documento.definir(EXEMPLO));
    // o designer aproximou para olhar um detalhe
    const doDesigner = { x: -300, y: -200, zoom: 2 };
    act(() => visao.camera.definir(doDesigner));

    comparando = true;
    act(() => documento.definir({ ...EXEMPLO, pranchetas: [] }));
    expect(motor.definirDocumento).toHaveBeenLastCalledWith(expect.objectContaining({ pranchetas: [] }));
    comparando = false;
    act(() => documento.definir(EXEMPLO));

    expect(visao.camera.obter()).toEqual(doDesigner);
  });

  it('a prévia do arraste chega ao motor, e o fim dela também', async () => {
    const { motor, previa } = montar();
    await waitFor(() => expect(motor.definirCamera).toHaveBeenCalled());

    act(() => previa.definir({ ids: ['a'], dx: 12, dy: -4 }));
    expect(motor.definirPrevia).toHaveBeenLastCalledWith({ ids: ['a'], dx: 12, dy: -4 });

    act(() => previa.definir(null));
    expect(motor.definirPrevia).toHaveBeenLastCalledWith(null);
  });

  it('avisa quem montou quando o motor fica pronto e quando ele some', async () => {
    const { motor } = motorFalso();
    const aoTerMotor = vi.fn();
    const tela = render(
      <AreaDoCanvas visao={criarVisao()} interface={criarInterface()} documento={criarArmazem<Documento | undefined>(undefined)} criarMotor={async () => motor} aoTerMotor={aoTerMotor} />,
    );
    await waitFor(() => expect(aoTerMotor).toHaveBeenCalledWith(motor));

    tela.unmount();
    expect(aoTerMotor).toHaveBeenLastCalledWith(null);
  });

  it('motor que não carrega vira aviso; se a causa for falta de WebGL, o aviso é o de WebGL', async () => {
    const semWebGL = Object.assign(new Error('sem contexto'), { name: 'ErroSemWebGL' });
    const armazens = () => ({ visao: criarVisao(), interface: criarInterface(), documento: criarArmazem<Documento | undefined>(undefined) });

    const a = render(<AreaDoCanvas {...armazens()} criarMotor={() => Promise.reject(semWebGL)} />);
    expect((await screen.findByRole('alert')).textContent).toContain(textos.avisos.semWebGL.titulo);
    a.unmount();

    render(<AreaDoCanvas {...armazens()} criarMotor={() => Promise.reject(new Error('rede'))} />);
    expect((await screen.findByRole('alert')).textContent).toContain(textos.avisos.motorNaoCarregou.titulo);
  });

  it('repassa o que o motor avisa que faltou', async () => {
    const { motor, faltar } = motorFalso();
    const aoMudarEmFalta = vi.fn();
    render(
      <AreaDoCanvas visao={criarVisao()} interface={criarInterface()} documento={criarArmazem<Documento | undefined>(undefined)} criarMotor={async () => motor} aoMudarEmFalta={aoMudarEmFalta} />,
    );
    await waitFor(() => expect(motor.aoMudarEmFalta).toHaveBeenCalled());

    const falta = { fontes: [{ familia: 'Didot', peso: 700, camadas: ['Feed/Título'] }], imagens: [] };
    faltar(falta);
    expect(aoMudarEmFalta).toHaveBeenCalledWith(falta);
  });

  it('soltar arquivos sobre o canvas entrega os arquivos e a prancheta sob o ponteiro', async () => {
    const { motor } = motorFalso();
    const visao = criarVisao();
    const aoSoltarArquivos = vi.fn();
    const tela = render(
      <AreaDoCanvas visao={visao} interface={criarInterface()} documento={criarArmazem<Documento | undefined>(EXEMPLO)} criarMotor={async () => motor} aoSoltarArquivos={aoSoltarArquivos} />,
    );
    await waitFor(() => expect(motor.definirDocumento).toHaveBeenCalled());
    act(() => visao.camera.definir({ x: 0, y: 0, zoom: 1 }));
    const area = tela.container.querySelector('[data-area-do-canvas]') as HTMLElement;
    const arquivo = new File([new Uint8Array(4)], 'foto.png', { type: 'image/png' });

    // o jsdom não põe posição em evento de arrastar: o evento é montado à mão, com a posição do ponteiro
    const soltar = new MouseEvent('drop', { bubbles: true, cancelable: true, clientX: 300, clientY: 400 });
    Object.defineProperty(soltar, 'dataTransfer', { value: { files: [arquivo], types: ['Files'] } });
    fireEvent(area, soltar);

    expect(aoSoltarArquivos).toHaveBeenCalledWith([arquivo], { pranchetaId: EXEMPLO.pranchetas[0]?.id, x: 300, y: 400 });
  });

  it('avisa quando o navegador derruba o contexto gráfico', async () => {
    const { motor, perderContexto } = montar();
    await waitFor(() => expect(motor.aoPerderContexto).toHaveBeenCalled());

    act(() => perderContexto());

    expect(screen.getByRole('alert').textContent).toContain(textos.avisos.contextoPerdido.titulo);
  });

  it('destrói o motor ao desmontar e para de mandar câmera', async () => {
    const { motor, tela, visao } = montar();
    await waitFor(() => expect(motor.definirCamera).toHaveBeenCalled());
    const chamadas = motor.definirCamera.mock.calls.length;

    tela.unmount();
    visao.camera.definir({ x: 1, y: 1, zoom: 1 });

    expect(motor.destruir).toHaveBeenCalledTimes(1);
    expect(motor.definirCamera).toHaveBeenCalledTimes(chamadas);
  });

  it('se desmontar antes de o motor ficar pronto, destrói assim que ele chega', async () => {
    const { motor } = motorFalso();
    let entregar: (m: MotorDeRender) => void = () => {};
    const criarMotor = vi.fn(() => new Promise<MotorDeRender>((ok) => (entregar = ok)));
    const tela = render(<AreaDoCanvas visao={criarVisao()} interface={criarInterface()} documento={criarArmazem<Documento | undefined>(undefined)} criarMotor={criarMotor} />);

    tela.unmount();
    entregar(motor);
    await Promise.resolve();

    expect(motor.destruir).toHaveBeenCalledTimes(1);
    expect(motor.definirCamera).not.toHaveBeenCalled();
  });
});

describe('área do canvas: o que os testes de navegador leem', () => {
  it('a câmera fica num atributo da área, atualizado a cada quadro: é como um teste converte ponto do documento em ponto da tela', async () => {
    const { visao, tela } = montar();
    const area = tela.container.querySelector('[data-area-do-canvas]') as HTMLElement;
    act(() => visao.camera.definir({ x: 12.5, y: -30, zoom: 0.35 }));
    await waitFor(() => expect(area.dataset.camera).toBe('12.5,-30,0.35'));
  });
});

describe('área do canvas: editar texto no lugar', () => {
  const titulo = EXEMPLO.pranchetas[0]?.filhos.find((n) => n.tipo === 'texto' && n.nome === 'Título');
  if (titulo?.tipo !== 'texto') throw new Error('o documento de exemplo precisa do Título');

  function montarComSessao(opcoes: { somenteLeitura?: boolean } = {}) {
    const { motor } = motorFalso();
    const iface = criarInterface();
    const documento = criarArmazem<Documento | undefined>(EXEMPLO);
    const aplicar = vi.fn((_descricao: string, _operacoes: unknown[]) => ({ ok: true as const }));
    const sessao = { obter: () => ({ visivel: EXEMPLO, somenteLeitura: opcoes.somenteLeitura ?? false }), aplicar } as unknown as SessaoDoDocumento<Documento, Operacao>;
    const visao = criarVisao();
    render(
      <AreaDoCanvas
        visao={visao}
        interface={iface}
        documento={documento}
        sessao={() => sessao}
        criarMotor={async () => motor}
        recursos={{ imagem: async () => new ArrayBuffer(0), fonte: async () => new ArrayBuffer(0) }}
      />,
    );
    return { iface, aplicar, visao };
  }
  const campo = () => screen.getByRole('textbox', { name: textos.canvas.editarTexto('Título') }) as HTMLTextAreaElement;

  it('pedir a edição abre um campo com o texto da camada, com o foco nele', () => {
    const { iface } = montarComSessao();
    expect(screen.queryByRole('textbox')).toBeNull();
    act(() => iface.editarTexto(titulo.id));
    expect(campo().value).toBe(titulo.conteudo);
    expect(document.activeElement).toBe(campo());
    expect(screen.getByText(textos.canvas.dicaDeEditarTexto)).toBeDefined();
  });

  it('Ctrl+Enter confirma: UM lote `alterar` com o texto novo, e o campo fecha', () => {
    const { iface, aplicar } = montarComSessao();
    act(() => iface.editarTexto(titulo.id));
    fireEvent.change(campo(), { target: { value: 'Camadas de fato' } });
    fireEvent.keyDown(campo(), { key: 'Enter', ctrlKey: true });

    expect(aplicar).toHaveBeenCalledTimes(1);
    expect(aplicar.mock.calls[0]?.[1]).toEqual([{ op: 'alterar', alvo: titulo.id, props: { conteudo: 'Camadas de fato' } }]);
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(iface.armazem.obter().editandoTexto).toBeNull();
  });

  it('Enter sozinho é quebra de linha, não confirma; sair do campo confirma', () => {
    const { iface, aplicar } = montarComSessao();
    act(() => iface.editarTexto(titulo.id));
    fireEvent.keyDown(campo(), { key: 'Enter' });
    expect(aplicar).not.toHaveBeenCalled();
    expect(campo()).toBeDefined();

    fireEvent.change(campo(), { target: { value: 'Outra\nlinha' } });
    fireEvent.blur(campo());
    expect(aplicar.mock.calls[0]?.[1]).toEqual([{ op: 'alterar', alvo: titulo.id, props: { conteudo: 'Outra\nlinha' } }]);
  });

  it('Esc desiste: nenhum lote, e o campo fecha', () => {
    const { iface, aplicar } = montarComSessao();
    act(() => iface.editarTexto(titulo.id));
    fireEvent.change(campo(), { target: { value: 'Não vale' } });
    fireEvent.keyDown(campo(), { key: 'Escape' });
    expect(aplicar).not.toHaveBeenCalled();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('texto sem mudança não vira lote', () => {
    const { iface, aplicar } = montarComSessao();
    act(() => iface.editarTexto(titulo.id));
    fireEvent.keyDown(campo(), { key: 'Enter', ctrlKey: true });
    expect(aplicar).not.toHaveBeenCalled();
  });

  it('peça só para leitura, camada bloqueada ou camada que não é de texto: o campo não abre', () => {
    const leitura = montarComSessao({ somenteLeitura: true });
    act(() => leitura.iface.editarTexto(titulo.id));
    expect(screen.queryByRole('textbox')).toBeNull();
    cleanup();

    const outra = montarComSessao();
    const forma = EXEMPLO.pranchetas[0]?.filhos.find((n) => n.tipo !== 'texto');
    act(() => outra.iface.editarTexto(forma?.id ?? ''));
    expect(screen.queryByRole('textbox')).toBeNull();
  });
});
