'use client';

// Editar o texto de uma camada no canvas (docs/mvp/experiencia.md, seção 4.3: dois cliques ou Enter).
// O motor não tem prévia de digitação, então a edição é um CAMPO sobreposto na posição da caixa: o
// designer digita nele, e confirmar vira UM lote `alterar`. O campo é opaco de propósito: mostrar o
// texto digitado por cima do texto antigo do canvas daria duas imagens desencontradas.
//
// O que fica aquém: o campo não é a camada. A quebra de linha, a cor e o espaçamento que valem são os
// do canvas, depois de confirmar; e camada girada é editada com o campo reto.
import type { No } from '@otto/documento';
import { useEffect, useRef, useState } from 'react';
import { editor as textos } from '../../textos/editor';
import type { Armazem } from '../nucleo/armazem';
import { useArmazem } from '../nucleo/armazem';
import type { Camera } from '../nucleo/camera';
import estilos from './EditorDeTexto.module.css';
import type { RecursosDoRender } from './motor';

type NoTexto = Extract<No, { tipo: 'texto' }>;

export interface PropriedadesDoEditorDeTexto {
  no: NoTexto;
  /** Onde a prancheta da camada fica no plano do editor. */
  origem: { x: number; y: number };
  camera: Pick<Armazem<Camera>, 'obter' | 'assinar'>;
  /** De onde vêm os bytes da fonte da camada, para o campo usar a mesma letra. */
  recursos?: Pick<RecursosDoRender, 'fonte'> | undefined;
  aoConfirmar: (texto: string) => void;
  aoDesistir: () => void;
}

const LARGURA_MINIMA = 200;
const entre = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

export function EditorDeTexto({ no, origem, camera: armazemDaCamera, recursos, aoConfirmar, aoDesistir }: PropriedadesDoEditorDeTexto) {
  const camera = useArmazem(armazemDaCamera, (c) => c);
  const [texto, setTexto] = useState(no.conteudo);
  const [familia, setFamilia] = useState<string | null>(null);
  const campo = useRef<HTMLTextAreaElement>(null);
  /** Confirmar, desistir e sair do campo podem acontecer em sequência: só o primeiro vale. */
  const encerrado = useRef(false);

  useEffect(() => {
    const c = campo.current;
    if (!c) return;
    c.focus();
    c.select();
  }, []);

  // A mesma fonte da camada, pelos mesmos bytes que o motor usa. Se não der, fica a letra da interface.
  useEffect(() => {
    if (!recursos || typeof FontFace === 'undefined') return;
    let desmontado = false;
    const nome = `otto-edicao-${no.id}`;
    let face: FontFace | undefined;
    recursos
      .fonte(no.fonte, no.peso)
      .then((bytes) => new FontFace(nome, bytes as BufferSource).load())
      .then((carregada) => {
        if (desmontado) return;
        face = carregada;
        document.fonts.add(carregada);
        setFamilia(nome);
      })
      .catch(() => undefined);
    return () => {
      desmontado = true;
      if (face) document.fonts.delete(face);
    };
  }, [recursos, no.id, no.fonte, no.peso]);

  const encerrar = (confirmar: boolean) => {
    if (encerrado.current) return;
    encerrado.current = true;
    if (confirmar) aoConfirmar(texto);
    else aoDesistir();
  };

  const largura = Math.max(LARGURA_MINIMA, no.largura * camera.zoom);
  return (
    <div className={estilos.moldura} style={{ left: camera.x + (origem.x + no.x) * camera.zoom, top: camera.y + (origem.y + no.y) * camera.zoom, width: largura }}>
      <textarea
        ref={campo}
        className={estilos.campo}
        aria-label={textos.canvas.editarTexto(no.nome)}
        value={texto}
        spellCheck={false}
        rows={Math.max(2, texto.split('\n').length)}
        style={{
          minHeight: no.altura * camera.zoom,
          fontSize: entre(no.tamanho * camera.zoom, 13, 72),
          lineHeight: no.entrelinha,
          textAlign: no.alinhamento === 'centro' ? 'center' : no.alinhamento === 'direita' ? 'right' : 'left',
          textTransform: no.caixaAlta ? 'uppercase' : 'none',
          fontWeight: no.peso,
          ...(familia ? { fontFamily: `"${familia}", var(--sans)` } : {}),
        }}
        onChange={(e) => setTexto(e.target.value)}
        onBlur={() => encerrar(true)}
        onPointerDown={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          // nenhuma tecla do campo chega aos atalhos do editor
          e.stopPropagation();
          if (e.key === 'Escape') encerrar(false);
          else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            encerrar(true);
          }
        }}
      />
      <p className={estilos.dica}>{textos.canvas.dicaDeEditarTexto}</p>
    </div>
  );
}
