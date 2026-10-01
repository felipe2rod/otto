// @vitest-environment jsdom

import type { Documento } from '@otto/documento';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { editor as textos } from '../../textos/editor';
import { montarDocumentoDeExemplo } from '../bancada/documentoDeExemplo';
import { criarArmazem } from '../nucleo/armazem';
import { criarInterface } from '../nucleo/interface';
import { criarVisao } from '../nucleo/visao';
import { AreaDoCanvas } from './AreaDoCanvas';
import { criarArmazemDaPrevia } from './controleDeGestos';
import type { FabricaDeMotor, MotorDeRender } from './motor';

beforeAll(() => {
  // o jsdom não tem canvas: sem contexto 2D, as sobreposições simplesmente não desenham
  HTMLCanvasElement.prototype.getContext = (() => null) as unknown as HTMLCanvasElement['getContext'];
});
afterEach(cleanup);

const EXEMPLO = montarDocumentoDeExemplo({ hash: 'a'.repeat(64), largura: 1200, altura: 800 });

function motorFalso() {
  let aoPerder: (() => void) | undefined;
  const motor = {
    redimensionar: vi.fn(),
    definirDocumento: vi.fn(),
    definirPrevia: vi.fn(),
    definirCamera: vi.fn(),
    prepararRecursos: vi.fn(async () => undefined),
    medidor: { tinta: () => ({ x: 0, y: 0, w: 0, h: 0 }) },
    emFalta: { fontes: [], imagens: [] },
    aoMudarEmFalta: vi.fn(() => () => {}),
    sentinela: 'motor-de-teste',
    contadores: { composicoesDePrancheta: 0, partes: 0, quadros: 0 },
    renderizarReferencia: vi.fn(),
    aoPerderContexto: vi.fn((aviso: () => void) => {
      aoPerder = aviso;
    }),
    destruir: vi.fn(),
  } satisfies MotorDeRender;
  return { motor, perderContexto: () => aoPerder?.() };
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
