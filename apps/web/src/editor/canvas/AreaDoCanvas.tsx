'use client';

// O canvas não é React. Este componente só monta os elementos e liga as assinaturas: o motor
// recebe câmera, documento e prévia direto dos armazéns, e nenhum movimento do mouse passa por
// estado do React. O que renderiza aqui é o indicador de zoom e o aviso de falha.
import type { Documento, Operacao } from '@otto/documento';
import { useEffect, useRef, useState } from 'react';
import { editor as textos } from '../../textos/editor';
import type { Armazem } from '../nucleo/armazem';
import { useArmazem } from '../nucleo/armazem';
import { ferramentaEmUso, type Interface } from '../nucleo/interface';
import type { SessaoDoDocumento } from '../nucleo/sessaoDoDocumento';
import type { Visao } from '../nucleo/visao';
import estilos from './AreaDoCanvas.module.css';
import { caixasDaSelecao } from './alvo';
import { ligarControleDaCamera } from './controleDaCamera';
import { criarArmazemDaPrevia, ligarControleDeGestos } from './controleDeGestos';
import { caixaDoConteudo } from './guias';
import { criarMotor as criarMotorPadrao, ehFaltaDeWebGL, type FabricaDeMotor, type MotorDeRender, type PreviaDeGesto, type RecursosDoRender } from './motor';
import { criarRecursosDoRender } from './recursos';
import { desenharSobreposicoes } from './sobreposicoes';

const SEM_TOCADOS: ReadonlySet<string> = new Set();
const SEM_SESSAO = () => undefined;

type Falha = 'contextoPerdido' | 'motorNaoCarregou' | 'semWebGL';

export interface PropriedadesDaArea {
  visao: Visao;
  interface: Interface;
  /** O documento visível: o `visivel` da sessão do documento. */
  documento: Pick<Armazem<Documento | undefined>, 'obter' | 'assinar'>;
  /** A sessão da peça aberta, para os gestos virarem lote. Sem ela, o canvas só navega. */
  sessao?: () => SessaoDoDocumento<Documento, Operacao> | undefined;
  /** A prévia do arraste. Quem monta pode passar a sua, para ler de fora. */
  previa?: Armazem<PreviaDeGesto | null>;
  criarMotor?: FabricaDeMotor;
  recursos?: RecursosDoRender;
  /** Avisa quando o motor fica pronto (e null quando ele some). O medidor de tinta é dele. */
  aoTerMotor?: (motor: MotorDeRender | null) => void;
  /** Chamado cada vez que o motor termina de buscar fontes e imagens: é a hora de ler `motor.emFalta`. */
  aoPrepararRecursos?: (motor: MotorDeRender) => void;
}

const assinaturaDasPranchetas = (doc: Documento | undefined): string => doc?.pranchetas.map((p) => `${p.id}:${p.largura}x${p.altura}`).join('|') ?? '';

export function AreaDoCanvas({
  visao,
  interface: iface,
  documento,
  sessao = SEM_SESSAO,
  previa: previaDeFora,
  criarMotor = criarMotorPadrao,
  recursos,
  aoTerMotor,
  aoPrepararRecursos,
}: PropriedadesDaArea) {
  const areaRef = useRef<HTMLDivElement>(null);
  const cenaRef = useRef<HTMLCanvasElement>(null);
  const sobreposicoesRef = useRef<HTMLCanvasElement>(null);
  const motorRef = useRef<MotorDeRender | null>(null);
  const [previaPropria] = useState(criarArmazemDaPrevia);
  const previa = previaDeFora ?? previaPropria;
  const [falha, setFalha] = useState<Falha | null>(null);
  const zoom = useArmazem(visao.camera, (c) => textos.canvas.porcentagem(c.zoom));

  // Sobreposições, tamanho e gestos: tudo por assinatura, um desenho por quadro.
  useEffect(() => {
    const area = areaRef.current;
    const tela = sobreposicoesRef.current;
    if (!area || !tela) return;
    let quadro = 0;
    let enquadrado = '';

    const desenhar = () => {
      quadro = 0;
      area.dataset.ferramenta = ferramentaEmUso(iface.armazem.obter());
      const ctx = tela.getContext('2d');
      if (!ctx) return;
      const doc = documento.obter();
      const { selecao } = iface.armazem.obter();
      desenharSobreposicoes(ctx, {
        camera: visao.camera.obter(),
        area: visao.area(),
        pixelsPorPonto: window.devicePixelRatio || 1,
        pranchetas: doc?.pranchetas ?? [],
        selecao,
        caixasDaSelecao: doc ? caixasDaSelecao(doc, selecao, previa.obter()) : [],
        tocados: SEM_TOCADOS,
        rotuloDaZonaDaInterface: textos.canvas.zonaDaInterface,
      });
    };
    const agendar = () => {
      if (!quadro) quadro = requestAnimationFrame(desenhar);
    };

    const medir = () => {
      const { width: largura, height: altura } = area.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      visao.definirArea({ largura, altura });
      tela.width = Math.round(largura * dpr);
      tela.height = Math.round(altura * dpr);
      motorRef.current?.redimensionar(largura, altura, dpr);
      agendar();
    };

    // enquadra quando o conjunto de pranchetas muda, não a cada lote
    const aoMudarODocumento = () => {
      const assinatura = assinaturaDasPranchetas(documento.obter());
      if (assinatura && assinatura !== enquadrado) visao.enquadrar(caixaDoConteudo(documento.obter()?.pranchetas ?? []));
      enquadrado = assinatura;
      agendar();
    };

    medir();
    aoMudarODocumento();
    const observador = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(medir);
    observador?.observe(area);
    const desligar = [
      visao.camera.assinar(agendar),
      iface.armazem.assinar(agendar),
      previa.assinar(agendar),
      documento.assinar(aoMudarODocumento),
      ligarControleDaCamera(area, visao, iface),
      ligarControleDeGestos(area, { visao, interface: iface, sessao, previa, descrever: textos.historico.mover }),
    ];
    return () => {
      observador?.disconnect();
      for (const f of desligar) f();
      if (quadro) cancelAnimationFrame(quadro);
    };
  }, [visao, iface, documento, sessao, previa]);

  // Ciclo de vida do motor. Criar é assíncrono (o motor baixa o WebAssembly): se o componente
  // desmontar antes, o motor é destruído assim que chegar.
  useEffect(() => {
    const canvas = cenaRef.current;
    if (!canvas) return;
    let desmontado = false;
    let motor: MotorDeRender | undefined;
    let desligar: (() => void)[] = [];

    criarMotor(canvas, recursos ?? criarRecursosDoRender()).then(
      (pronto) => {
        if (desmontado) {
          pronto.destruir();
          return;
        }
        motor = pronto;
        motorRef.current = pronto;
        pronto.aoPerderContexto(() => setFalha('contextoPerdido'));
        const area = visao.area();
        pronto.redimensionar(area.largura, area.altura, window.devicePixelRatio || 1);
        pronto.definirCamera(visao.camera.obter());

        const entregarDocumento = () => {
          const doc = documento.obter();
          if (!doc) return;
          pronto.definirDocumento(doc);
          // o que a porta não entregar aparece em motor.emFalta; o motor desenha o que tem
          pronto.prepararRecursos(doc).then(
            () => !desmontado && aoPrepararRecursos?.(pronto),
            () => undefined,
          );
        };
        entregarDocumento();
        // A ordem destas assinaturas é a ordem ao soltar um arraste: a sessão publica o documento
        // novo, o motor o recebe, e só depois a prévia encerra. Ao contrário, a camada pisca.
        desligar = [visao.camera.assinar(() => pronto.definirCamera(visao.camera.obter())), documento.assinar(entregarDocumento), previa.assinar(() => pronto.definirPrevia(previa.obter()))];
        aoTerMotor?.(pronto);
      },
      (erro: unknown) => {
        if (!desmontado) setFalha(ehFaltaDeWebGL(erro) ? 'semWebGL' : 'motorNaoCarregou');
      },
    );

    return () => {
      desmontado = true;
      for (const f of desligar) f();
      motorRef.current = null;
      if (motor) aoTerMotor?.(null);
      motor?.destruir();
    };
  }, [criarMotor, recursos, visao, documento, previa, aoTerMotor, aoPrepararRecursos]);

  return (
    // tabIndex -1: recebe foco por clique, para os atalhos do canvas, mas fica fora da ordem do Tab
    <div ref={areaRef} className={estilos.area} tabIndex={-1} data-area-do-canvas="">
      <canvas ref={cenaRef} className={estilos.camada} />
      <canvas ref={sobreposicoesRef} className={estilos.camada} />
      <div className={estilos.zoom}>
        <button type="button" title={textos.canvas.dicaDeEnquadrar} onClick={() => visao.enquadrar(caixaDoConteudo(documento.obter()?.pranchetas ?? []))}>
          {textos.canvas.enquadrar}
        </button>
        <output aria-label={textos.canvas.zoom}>{zoom}</output>
      </div>
      {falha && (
        <div className={estilos.falha} role="alert">
          <strong>{textos.avisos[falha].titulo}</strong>
          <p>{textos.avisos[falha].texto}</p>
          <button type="button" onClick={() => window.location.reload()}>
            {textos.avisos.recarregar}
          </button>
        </div>
      )}
    </div>
  );
}
