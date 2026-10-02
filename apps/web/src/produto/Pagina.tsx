// A moldura das telas do produto fora do editor da peça: o topo com as seções (Peças, Marcas) e o
// título. Componente de servidor: não tem estado. Tudo aqui mora sob /editor (ADR 019).
import type { ReactNode } from 'react';
import { marcas } from '../textos/briefing';
import { pecas } from '../textos/pecas';
import estilos from './Pagina.module.css';

export type Secao = 'pecas' | 'marcas';

const SECOES: readonly { secao: Secao; endereco: string; nome: string }[] = [
  { secao: 'pecas', endereco: '/editor', nome: pecas.titulo },
  { secao: 'marcas', endereco: '/editor/marcas', nome: marcas.titulo },
];

/** `secao`: a que fica marcada no topo. Ausente (o formulário de nova peça): nenhuma. */
export function Pagina({ secao, titulo, children, ocupada = false }: { secao?: Secao; titulo: string; children: ReactNode; ocupada?: boolean }) {
  return (
    <div className={estilos.pagina}>
      <header className={estilos.topo}>
        <a className={estilos.marca} href="/">
          {pecas.marca}
        </a>
        <nav className={estilos.navegacao} aria-label={pecas.navegacao}>
          {SECOES.map((s) => (
            <a key={s.secao} className={estilos.secao} href={s.endereco} aria-current={s.secao === secao ? 'page' : undefined}>
              {s.nome}
            </a>
          ))}
        </nav>
      </header>
      <main className={estilos.conteudo} aria-busy={ocupada || undefined}>
        <h1 className={estilos.titulo}>{titulo}</h1>
        {children}
      </main>
    </div>
  );
}
