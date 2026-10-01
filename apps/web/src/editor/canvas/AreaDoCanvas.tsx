'use client';

// O canvas não é React. Este componente só monta os elementos e liga as assinaturas: o motor
// recebe câmera, documento e prévia direto dos armazéns, e nenhum movimento do mouse passa por
// estado do React. O que renderiza aqui é o indicador de zoom, o convite de soltar e o aviso de falha.
import { acharEm, type Documento, disporPranchetas, type Operacao } from '@otto/documento';
import { useEffect, useRef, useState } from 'react';
import { editor as textos } from '../../textos/editor';
import type { Armazem } from '../nucleo/armazem';
import { useArmazem } from '../nucleo/armazem';
import { paraDocumento } from '../nucleo/camera';
import { ferramentaEmUso, type Interface } from '../nucleo/interface';
import type { SessaoDoDocumento } from '../nucleo/sessaoDoDocumento';
import type { Visao } from '../nucleo/visao';
import estilos from './AreaDoCanvas.module.css';
import { caixasDaSelecao, noDaAlca } from './alvo';
import { ligarControleDaCamera } from './controleDaCamera';
import { criarArmazemAoVivo, criarArmazemDaPrevia, ligarControleDeGestos } from './controleDeGestos';
import { caixaDoConteudo } from './guias';
import { criarMotor as criarMotorPadrao, ehFaltaDeWebGL, type FabricaDeMotor, type MotorDeRender, type PreviaDeGesto, type RecursosDoRender, type RecursosEmFalta } from './motor';
import { criarRecursosDoRender } from './recursos';
import { desenharSobreposicoes } from './sobreposicoes';

const SEM_TOCADOS: ReadonlySet<string> = new Set();
const SEM_SESSAO = () => undefined;
const PASSO_DO_FUNDO = 22;

type Falha = 'contextoPerdido' | 'motorNaoCarregou' | 'semWebGL';

/** Onde os arquivos foram soltos: a prancheta sob o ponteiro e o ponto dentro dela. */
export interface OndeSoltou {
  pranchetaId?: string;
  x: number;
  y: number;
}

export interface PropriedadesDaArea {
  visao: Visao;
  interface: Interface;
  /** O documento visível: o `visivel` da sessão do documento. */
  documento: Pick<Armazem<Documento | undefined>, 'obter' | 'assinar'>;
  /** A sessão da peça aberta, para os gestos virarem lote. Sem ela, o canvas só navega. */
  sessao?: () => SessaoDoDocumento<Documento, Operacao> | undefined;
  /** A prévia do arraste. Quem monta pode passar a sua, para ler de fora. */
  previa?: Armazem<PreviaDeGesto | null>;
  /** O documento temporário de um redimensionamento em andamento. Quem monta pode passar o seu. */
  aoVivo?: Armazem<Documento | null>;
  criarMotor?: FabricaDeMotor;
  recursos?: RecursosDoRender;
  /** Avisa quando o motor fica pronto (e null quando ele some). O medidor de tinta é dele. */
  aoTerMotor?: (motor: MotorDeRender | null) => void;
  /** O motor avisa quando muda a lista de fonte e imagem que não chegou. */
  aoMudarEmFalta?: (emFalta: RecursosEmFalta) => void;
  /** Arquivos soltos sobre o canvas. `onde` ausente: fora de toda prancheta, quem recebe decide. */
  aoSoltarArquivos?: (arquivos: File[], onde: OndeSoltou | undefined) => void;
}

const assinaturaDasPranchetas = (doc: Documento | undefined): string => doc?.pranchetas.map((p) => `${p.id}:${p.largura}x${p.altura}`).join('|') ?? '';

export function AreaDoCanvas(props: PropriedadesDaArea) {
  const { visao, interface: iface, documento, sessao = SEM_SESSAO, criarMotor = criarMotorPadrao, recursos, aoTerMotor, aoMudarEmFalta, aoSoltarArquivos } = props;
  const areaRef = useRef<HTMLDivElement>(null);
  const cenaRef = useRef<HTMLCanvasElement>(null);
  const sobreposicoesRef = useRef<HTMLCanvasElement>(null);
  const motorRef = useRef<MotorDeRender | null>(null);
  const [previaPropria] = useState(criarArmazemDaPrevia);
  const previa = props.previa ?? previaPropria;
  const [aoVivoProprio] = useState(criarArmazemAoVivo);
  const aoVivo = props.aoVivo ?? aoVivoProprio;
  const [falha, setFalha] = useState<Falha | null>(null);
  const [soltando, setSoltando] = useState(false);
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
      const camera = visao.camera.obter();
      // o pontilhado do fundo acompanha a câmera: é o que mostra que a vista se moveu numa peça vazia
      const passo = Math.max(8, PASSO_DO_FUNDO * camera.zoom);
      area.style.setProperty('--fundo-passo', `${passo}px`);
      area.style.setProperty('--fundo-x', `${camera.x % passo}px`);
      area.style.setProperty('--fundo-y', `${camera.y % passo}px`);
      area.dataset.ferramenta = ferramentaEmUso(iface.armazem.obter());

      const ctx = tela.getContext('2d');
      if (!ctx) return;
      // durante um redimensionamento, o que vale na tela é o documento ao vivo
      const doc = aoVivo.obter() ?? documento.obter();
      const { selecao } = iface.armazem.obter();
      const editavel = sessao()?.obter().somenteLeitura === false;
      desenharSobreposicoes(ctx, {
        camera,
        area: visao.area(),
        pixelsPorPonto: window.devicePixelRatio || 1,
        pranchetas: doc?.pranchetas ?? [],
        selecao,
        caixasDaSelecao: doc ? caixasDaSelecao(doc, selecao, previa.obter()) : [],
        // as alças somem enquanto a camada é arrastada, e não existem em peça só para leitura
        alcas: doc && editavel && !previa.obter() ? noDaAlca(doc, selecao)?.caixaNoPlano : undefined,
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
      aoVivo.assinar(agendar),
      documento.assinar(aoMudarODocumento),
      ligarControleDaCamera(area, visao, iface),
      ligarControleDeGestos(area, { visao, interface: iface, sessao, previa, aoVivo }),
    ];
    return () => {
      observador?.disconnect();
      for (const f of desligar) f();
      if (quadro) cancelAnimationFrame(quadro);
    };
  }, [visao, iface, documento, sessao, previa, aoVivo]);

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
          // o que a porta não entregar aparece em motor.emFalta, e o motor avisa; ele desenha o que tem
          pronto.prepararRecursos(doc).catch(() => undefined);
        };
        // Redimensionar não tem prévia no motor: o documento temporário vai inteiro, a cada quadro, e
        // o motor recompõe a prancheta tocada. Usa os mesmos recursos, então não busca nada de novo.
        const entregarAoVivo = () => {
          const doc = aoVivo.obter() ?? documento.obter();
          if (doc) pronto.definirDocumento(doc);
        };
        entregarDocumento();
        // A ordem destas assinaturas é a ordem ao soltar um gesto: a sessão publica o documento
        // novo, o motor o recebe, e só depois a prévia (ou o documento ao vivo) encerra.
        desligar = [
          visao.camera.assinar(() => pronto.definirCamera(visao.camera.obter())),
          documento.assinar(entregarDocumento),
          aoVivo.assinar(entregarAoVivo),
          previa.assinar(() => pronto.definirPrevia(previa.obter())),
          pronto.aoMudarEmFalta((emFalta) => aoMudarEmFalta?.(emFalta)),
        ];
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
  }, [criarMotor, recursos, visao, documento, previa, aoVivo, aoTerMotor, aoMudarEmFalta]);

  const aoSoltar = (e: React.DragEvent<HTMLDivElement>) => {
    if (!aoSoltarArquivos) return;
    e.preventDefault();
    setSoltando(false);
    const arquivos = [...e.dataTransfer.files];
    if (arquivos.length === 0) return;
    const r = e.currentTarget.getBoundingClientRect();
    const ponto = paraDocumento(visao.camera.obter(), { x: e.clientX - r.left, y: e.clientY - r.top });
    const doc = documento.obter();
    // sem posição confiável (evento sem coordenada), não adivinha a prancheta: quem recebe decide
    const alvo = doc && Number.isFinite(ponto.x) && Number.isFinite(ponto.y) ? acharEm(doc, ponto, { comBloqueadas: true }) : undefined;
    const origem = doc && alvo && disporPranchetas(doc.pranchetas).get(alvo.prancheta.id);
    aoSoltarArquivos(arquivos, alvo && origem ? { pranchetaId: alvo.prancheta.id, x: Math.round(ponto.x - origem.x), y: Math.round(ponto.y - origem.y) } : undefined);
  };

  return (
    // tabIndex -1: recebe foco por clique, para os atalhos do canvas, mas fica fora da ordem do Tab.
    // biome-ignore lint/a11y/noStaticElementInteractions: soltar arquivo é atalho de mouse; pelo teclado, o mesmo se faz no botão de inserir da barra de ferramentas
    <div
      ref={areaRef}
      className={estilos.area}
      tabIndex={-1}
      data-area-do-canvas=""
      data-soltando={soltando ? 'sim' : undefined}
      data-convite={textos.envio.soltar}
      onDragOver={(e) => {
        if (!aoSoltarArquivos || !e.dataTransfer.types.includes('Files')) return;
        e.preventDefault();
        setSoltando(true);
      }}
      onDragLeave={() => setSoltando(false)}
      onDrop={aoSoltar}
    >
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
