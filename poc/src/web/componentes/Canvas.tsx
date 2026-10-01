// O canvas não é React: é um desenho da árvore com o mesmo motor do servidor.
// React só cuida do elemento e dos eventos; todo gesto vira operação.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { camadasVisuaisVisiveis, type Documento, type No, type NoVisual, type Prancheta, todasAsCamadas } from '../../documento/esquema';
import { caixaDe } from '../../documento/operacoes';
import { type Ctx, renderizarPrancheta } from '../../render/render';
import { useEditor } from '../estado';
import { aoCarregarImagem, carregarFontes, carregarFontesDoDocumento, criarCanvasWeb, imagemDoArquivo } from '../recursos';

const VAO = 160;
const AMBAR = '#F4C430';
const SELECAO = '#FF5B1F';

interface Camera {
  x: number;
  y: number;
  zoom: number;
}

export function posicoesDasPranchetas(doc: Documento): Map<string, { x: number; y: number }> {
  const m = new Map<string, { x: number; y: number }>();
  let x = 0;
  for (const p of doc.pranchetas) {
    m.set(p.id, { x, y: 0 });
    x += p.largura + VAO;
  }
  return m;
}

function acharNoEm(doc: Documento, pos: Map<string, { x: number; y: number }>, px: number, py: number): { prancheta: Prancheta; no?: NoVisual } | undefined {
  for (const p of doc.pranchetas) {
    const o = pos.get(p.id)!;
    const lx = px - o.x;
    const ly = py - o.y;
    if (lx < 0 || ly < 0 || lx > p.largura || ly > p.altura) continue;
    // a camada visível mais alta na pilha, dentro dos grupos
    const visuais = camadasVisuaisVisiveis(p.filhos);
    for (let i = visuais.length - 1; i >= 0; i--) {
      const n = visuais[i]!;
      if (n.bloqueado) continue;
      if (lx >= n.x && lx <= n.x + n.largura && ly >= n.y && ly <= n.y + n.altura) return { prancheta: p, no: n };
    }
    return { prancheta: p };
  }
  return undefined;
}

function deslocarNaArvore(lista: No[], id: string, dx: number, dy: number, dentro = false): No[] {
  return lista.map((n) => {
    const alvo = dentro || n.id === id;
    if (n.tipo === 'grupo') return { ...n, filhos: deslocarNaArvore(n.filhos, id, dx, dy, alvo) };
    if (alvo && n.tipo !== 'ajuste') return { ...n, x: Math.round(n.x + dx), y: Math.round(n.y + dy) };
    return n;
  });
}

function comDeslocamento(doc: Documento, id: string, dx: number, dy: number): Documento {
  return { ...doc, pranchetas: doc.pranchetas.map((p) => ({ ...p, filhos: deslocarNaArvore(p.filhos, id, dx, dy) })) };
}

export function Canvas() {
  const { doc, docAntes, comparando, selecao, selecionar, aplicar, desfazer, tocadosPeloOtto, tarefa } = useEditor();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const caixaRef = useRef<HTMLDivElement>(null);
  const [camera, setCamera] = useState<Camera>({ x: 80, y: 80, zoom: 0.35 });
  const [arraste, setArraste] = useState<{ id: string; x0: number; y0: number; dx: number; dy: number } | null>(null);
  const [pan, setPan] = useState<{ x0: number; y0: number; cx: number; cy: number } | null>(null);
  const [espaco, setEspaco] = useState(false);
  const [tick, setTick] = useState(0);
  const [prontas, setProntas] = useState(false);
  const enquadrouRef = useRef<string>('');
  // composição de cada prancheta em cache: só refaz quando o documento, o zoom ou as imagens mudam
  const cacheRef = useRef(new WeakMap<Prancheta, { escala: number; tick: number; tokens: Documento['tokens']; canvas: HTMLCanvasElement }>());

  // fontes do Google usadas no documento: quando chegam, recompõe
  useEffect(() => {
    if (doc) void carregarFontesDoDocumento(doc).then((novas) => novas && setTick((t) => t + 1));
  }, [doc]);

  useEffect(() => {
    void carregarFontes().then(() => setProntas(true));
    return aoCarregarImagem(() => setTick((t) => t + 1));
  }, []);

  const exibido = comparando && docAntes ? docAntes : doc && arraste ? comDeslocamento(doc, arraste.id, arraste.dx, arraste.dy) : doc;

  const enquadrar = useCallback(() => {
    const el = caixaRef.current;
    if (!el || !doc || doc.pranchetas.length === 0) return;
    const pos = posicoesDasPranchetas(doc);
    const ultima = doc.pranchetas.at(-1)!;
    const largura = pos.get(ultima.id)!.x + ultima.largura;
    const altura = Math.max(...doc.pranchetas.map((p) => p.altura));
    const zoom = Math.min((el.clientWidth - 120) / largura, (el.clientHeight - 140) / altura, 1);
    setCamera({ zoom, x: (el.clientWidth - largura * zoom) / 2, y: (el.clientHeight - altura * zoom) / 2 + 12 });
  }, [doc]);

  // enquadra quando o conjunto de pranchetas muda
  const assinatura = doc?.pranchetas.map((p) => `${p.id}:${p.largura}x${p.altura}`).join('|') ?? '';
  useEffect(() => {
    if (assinatura && assinatura !== enquadrouRef.current) {
      enquadrouRef.current = assinatura;
      enquadrar();
    }
  }, [assinatura, enquadrar]);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    const el = caixaRef.current;
    if (!canvas || !el) return;
    const dpr = window.devicePixelRatio || 1;
    const w = el.clientWidth;
    const h = el.clientHeight;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!exibido || !prontas) return;
    const pos = posicoesDasPranchetas(exibido);
    const { zoom } = camera;

    for (const p of exibido.pranchetas) {
      const o = pos.get(p.id)!;
      const sx = camera.x + o.x * zoom;
      const sy = camera.y + o.y * zoom;
      // sombra da prancheta
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(sx + 6, sy + 8, p.largura * zoom, p.altura * zoom);
      const escala = dpr * zoom;
      let pronto = cacheRef.current.get(p);
      if (!pronto || pronto.escala !== escala || pronto.tick !== tick || pronto.tokens !== exibido.tokens) {
        const tela = criarCanvasWeb(p.largura * escala, p.altura * escala);
        const tctx = tela.getContext('2d')!;
        tctx.setTransform(escala, 0, 0, escala, 0, 0);
        renderizarPrancheta(tctx, exibido, p, imagemDoArquivo, { criarCanvas: criarCanvasWeb });
        pronto = { escala, tick, tokens: exibido.tokens, canvas: tela };
        cacheRef.current.set(p, pronto);
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(pronto.canvas, Math.round(dpr * sx), Math.round(dpr * sy));

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const selP = selecao?.tipo === 'prancheta' && selecao.id === p.id;
      ctx.font = '500 12px "Schibsted Grotesk"';
      ctx.fillStyle = selP ? SELECAO : tocadosPeloOtto.has(p.id) ? AMBAR : '#a8a397';
      ctx.fillText(p.nome, sx, sy - 10);
      const rotulo = ctx.measureText(p.nome).width;
      ctx.font = '400 11px "JetBrains Mono"';
      ctx.fillStyle = '#6d6a62';
      ctx.fillText(`${p.largura}×${p.altura}`, sx + rotulo + 8, sy - 10);
      if (selP) {
        ctx.strokeStyle = SELECAO;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(sx - 0.5, sy - 0.5, p.largura * zoom + 1, p.altura * zoom + 1);
      }

      // guias da zona coberta pela interface do story: texto não entra, foto e cor sim
      if (Math.abs(p.largura / p.altura - 9 / 16) < 0.02) {
        ctx.save();
        ctx.fillStyle = 'rgba(255, 91, 31, 0.07)';
        ctx.strokeStyle = 'rgba(255, 91, 31, 0.55)';
        ctx.setLineDash([6, 5]);
        ctx.lineWidth = 1;
        const topo = p.altura * (250 / 1920) * zoom;
        const base = p.altura * (340 / 1920) * zoom;
        ctx.fillRect(sx, sy, p.largura * zoom, topo);
        ctx.fillRect(sx, sy + p.altura * zoom - base, p.largura * zoom, base);
        ctx.beginPath();
        ctx.moveTo(sx, sy + topo + 0.5);
        ctx.lineTo(sx + p.largura * zoom, sy + topo + 0.5);
        ctx.moveTo(sx, sy + p.altura * zoom - base + 0.5);
        ctx.lineTo(sx + p.largura * zoom, sy + p.altura * zoom - base + 0.5);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.font = '500 10px "Schibsted Grotesk"';
        ctx.fillStyle = 'rgba(255, 91, 31, 0.8)';
        ctx.fillText('zona da interface: sem texto', sx + 6, sy + topo - 6);
        ctx.fillText('zona da interface: sem texto', sx + 6, sy + p.altura * zoom - base + 14);
        ctx.restore();
      }

      if (!comparando) {
        // contornos de camadas que sangram ficam dentro da prancheta
        ctx.save();
        ctx.beginPath();
        ctx.rect(sx - 2, sy - 2, p.largura * zoom + 4, p.altura * zoom + 4);
        ctx.clip();
        for (const n of todasAsCamadas(p.filhos)) {
          const c = caixaDe(n);
          if (!c) continue;
          const nx = sx + c.x * zoom;
          const ny = sy + c.y * zoom;
          const larg = c.w;
          const alt = c.h;
          if (tocadosPeloOtto.has(n.id) && n.tipo !== 'grupo') {
            ctx.save();
            ctx.setLineDash([5, 4]);
            ctx.strokeStyle = AMBAR;
            ctx.globalAlpha = 0.85;
            ctx.lineWidth = 1;
            ctx.strokeRect(nx + 0.5, ny + 0.5, larg * zoom - 1, alt * zoom - 1);
            ctx.restore();
          }
          if (selecao?.tipo === 'no' && selecao.id === n.id) {
            ctx.strokeStyle = SELECAO;
            ctx.lineWidth = 1.5;
            ctx.strokeRect(nx, ny, larg * zoom, alt * zoom);
            ctx.fillStyle = SELECAO;
            for (const [hx, hy] of [[nx, ny], [nx + larg * zoom, ny], [nx, ny + alt * zoom], [nx + larg * zoom, ny + alt * zoom]] as const) ctx.fillRect(hx - 3, hy - 3, 6, 6);
          }
        }
        ctx.restore();
      }
    }
  }, [exibido, camera, selecao, tocadosPeloOtto, comparando, tick, prontas]);

  // redesenha ao redimensionar
  useEffect(() => {
    const el = caixaRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setTick((t) => t + 1));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const paraDoc = (e: { clientX: number; clientY: number }) => {
    const r = caixaRef.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left - camera.x) / camera.zoom, y: (e.clientY - r.top - camera.y) / camera.zoom };
  };

  const noSelecionado = (): No | undefined => {
    if (!doc || selecao?.tipo !== 'no') return undefined;
    for (const p of doc.pranchetas) for (const n of todasAsCamadas(p.filhos)) if (n.id === selecao.id) return n;
    return undefined;
  };

  // atalhos de teclado
  useEffect(() => {
    const emCampo = (e: KeyboardEvent) => e.target instanceof HTMLElement && (e.target.closest('input, textarea, select') !== null || e.target.isContentEditable);
    const baixo = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !emCampo(e)) setEspaco(true);
      if (emCampo(e)) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        void desfazer();
        return;
      }
      if (e.shiftKey && e.code === 'Digit1') {
        enquadrar();
        return;
      }
      const n = noSelecionado();
      if (!n || tarefa?.estado === 'rodando') return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        void aplicar(`remover ${n.nome}`, [{ op: 'remover', alvo: n.id }]);
        selecionar(null);
        return;
      }
      const passo = e.shiftKey ? 10 : 1;
      const d = { ArrowLeft: [-passo, 0], ArrowRight: [passo, 0], ArrowUp: [0, -passo], ArrowDown: [0, passo] }[e.key];
      if (d) {
        e.preventDefault();
        const c = caixaDe(n);
        if (c) void aplicar(`mover ${n.nome}`, [{ op: 'mover', alvo: n.id, x: c.x + d[0]!, y: c.y + d[1]! }]);
      }
    };
    const cima = (e: KeyboardEvent) => {
      if (e.code === 'Space') setEspaco(false);
    };
    window.addEventListener('keydown', baixo);
    window.addEventListener('keyup', cima);
    return () => {
      window.removeEventListener('keydown', baixo);
      window.removeEventListener('keyup', cima);
    };
  });

  const aoApertar = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    if (espaco || e.button === 1) {
      setPan({ x0: e.clientX, y0: e.clientY, cx: camera.x, cy: camera.y });
      return;
    }
    if (!doc || comparando) return;
    const pt = paraDoc(e);
    const achado = acharNoEm(doc, posicoesDasPranchetas(doc), pt.x, pt.y);
    if (!achado) {
      selecionar(null);
      return;
    }
    if (!achado.no) {
      selecionar({ tipo: 'prancheta', id: achado.prancheta.id });
      return;
    }
    selecionar({ tipo: 'no', id: achado.no.id });
    if (tarefa?.estado !== 'rodando') setArraste({ id: achado.no.id, x0: pt.x, y0: pt.y, dx: 0, dy: 0 });
  };

  const aoMover = (e: React.PointerEvent) => {
    if (pan) {
      setCamera((c) => ({ ...c, x: pan.cx + e.clientX - pan.x0, y: pan.cy + e.clientY - pan.y0 }));
      return;
    }
    if (arraste) {
      const pt = paraDoc(e);
      setArraste({ ...arraste, dx: pt.x - arraste.x0, dy: pt.y - arraste.y0 });
    }
  };

  const aoSoltar = () => {
    setPan(null);
    if (arraste && doc && (Math.abs(arraste.dx) >= 1 || Math.abs(arraste.dy) >= 1)) {
      const n = noSelecionado();
      const c = n && caixaDe(n);
      if (n && c) void aplicar(`mover ${n.nome}`, [{ op: 'mover', alvo: n.id, x: Math.round(c.x + arraste.dx), y: Math.round(c.y + arraste.dy) }]);
    }
    setArraste(null);
  };

  const aoRolar = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      const r = caixaRef.current!.getBoundingClientRect();
      const mx = e.clientX - r.left;
      const my = e.clientY - r.top;
      setCamera((c) => {
        const zoom = Math.min(4, Math.max(0.05, c.zoom * Math.exp(-e.deltaY * 0.0025)));
        return { zoom, x: mx - ((mx - c.x) / c.zoom) * zoom, y: my - ((my - c.y) / c.zoom) * zoom };
      });
    } else {
      setCamera((c) => ({ ...c, x: c.x - e.deltaX, y: c.y - e.deltaY }));
    }
  };

  // impede o zoom da página com ctrl+roda sobre o canvas
  useEffect(() => {
    const el = caixaRef.current;
    if (!el) return;
    const f = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) e.preventDefault();
    };
    el.addEventListener('wheel', f, { passive: false });
    return () => el.removeEventListener('wheel', f);
  }, []);

  return (
    <div
      ref={caixaRef}
      className={`area-do-canvas${espaco || pan ? ' mao' : ''}${comparando ? ' comparando' : ''}`}
      onPointerDown={aoApertar}
      onPointerMove={aoMover}
      onPointerUp={aoSoltar}
      onWheel={aoRolar}
    >
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }} />
      <div className="zoom-info">
        <button type="button" onClick={enquadrar} title="Enquadrar tudo (Shift+1)">
          Enquadrar
        </button>
        <span>{Math.round(camera.zoom * 100)}%</span>
      </div>
      {comparando && <div className="selo-comparando">Antes das alterações do Otto</div>}
    </div>
  );
}
