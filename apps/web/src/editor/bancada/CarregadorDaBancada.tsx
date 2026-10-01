'use client';

// Carrega a bancada só no navegador, como o editor (CarregadorDoEditor.tsx).
import dynamic from 'next/dynamic';
import { editor as textos } from '../../textos/editor';
import estilos from '../CarregadorDoEditor.module.css';

const Bancada = dynamic(() => import('./Bancada').then((m) => m.Bancada), {
  ssr: false,
  loading: () => (
    <p className={estilos.carregando} aria-live="polite">
      {textos.carregando}
    </p>
  ),
});

export function CarregadorDaBancada() {
  return <Bancada />;
}
