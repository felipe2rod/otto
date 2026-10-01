'use client';

// A única porta de entrada do editor. O código do editor (e, com ele, o motor de render e o
// WebAssembly) só é baixado aqui, por import() dinâmico, e nunca é renderizado no servidor.
// É o que mantém o editor fora do pacote das páginas públicas (ADR 019).
import dynamic from 'next/dynamic';
import { editor as textos } from '../textos/editor';
import estilos from './CarregadorDoEditor.module.css';

const Editor = dynamic(() => import('./Editor').then((m) => m.Editor), {
  ssr: false,
  loading: () => (
    <p className={estilos.carregando} aria-live="polite">
      {textos.carregando}
    </p>
  ),
});

export function CarregadorDoEditor({ pecaId }: { pecaId: string }) {
  return <Editor pecaId={pecaId} />;
}
