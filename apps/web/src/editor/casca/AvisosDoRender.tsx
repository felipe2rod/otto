// O que o canvas deixou de mostrar: fonte ou imagem que não chegou, e recurso do documento que o
// motor ainda não desenha. Fica discreto no topo, mas nunca escondido: texto que some sem aviso é
// o defeito que o designer só descobriria no Photoshop (experiencia.md, 5.2).
import { editor as textos } from '../../textos/editor';
import type { RecursoNaoDesenhado, RecursosEmFalta } from '../canvas/motor';
import estilos from './AvisosDoRender.module.css';

export interface FaltasDoRender {
  emFalta: RecursosEmFalta;
  naoDesenhado: readonly RecursoNaoDesenhado[];
}

export const SEM_FALTAS: FaltasDoRender = { emFalta: { fontes: [], imagens: [] }, naoDesenhado: [] };

/** Quantas linhas o aviso tem: uma por fonte, uma por imagem e uma por recurso não desenhado (com as camadas dele). */
export const quantasFaltas = (f: FaltasDoRender): number => f.emFalta.fontes.length + f.emFalta.imagens.length + new Set(f.naoDesenhado.map((n) => n.recurso)).size;

/** Agrupa por recurso: "efeitos de camada: Feed/Título, Feed/Selo". */
function porRecurso(lista: readonly RecursoNaoDesenhado[]): [string, string][] {
  const grupos = new Map<string, string[]>();
  for (const item of lista) grupos.set(item.recurso, [...(grupos.get(item.recurso) ?? []), item.camada]);
  return [...grupos].map(([recurso, camadas]) => [recurso, camadas.join(', ')]);
}

export function AvisosDoRender({ faltas }: { faltas: FaltasDoRender }) {
  const n = quantasFaltas(faltas);
  if (n === 0) return null;
  const r = textos.render;
  return (
    <details className={estilos.avisos}>
      <summary>{textos.topo.avisosDoRender(n)}</summary>
      <div className={estilos.lista}>
        {faltas.emFalta.fontes.length > 0 && (
          <>
            <h3>{r.fontes}</h3>
            <ul>
              {faltas.emFalta.fontes.map((f) => (
                <li key={`${f.familia}#${f.peso}`}>{r.fonte(f.familia, f.peso, f.camadas.join(', '))}</li>
              ))}
            </ul>
          </>
        )}
        {faltas.emFalta.imagens.length > 0 && (
          <>
            <h3>{r.imagens}</h3>
            <ul>
              {faltas.emFalta.imagens.map((i) => (
                <li key={i.arquivo}>{r.imagem(i.camadas.join(', '))}</li>
              ))}
            </ul>
          </>
        )}
        {faltas.naoDesenhado.length > 0 && (
          <>
            <h3>{r.naoDesenhado}</h3>
            <ul>
              {porRecurso(faltas.naoDesenhado).map(([recurso, camadas]) => (
                <li key={recurso}>{r.recurso(recurso, camadas)}</li>
              ))}
            </ul>
          </>
        )}
      </div>
    </details>
  );
}
