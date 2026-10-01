// Nível de esforço criativo da tarefa (servidor/esforco.ts). "Sem nível" mantém o comportamento de sempre.
import { ESFORCOS_CRIATIVOS, type EsforcoCriativo, NIVEIS_DE_ESFORCO_CRIATIVO, lerEsforco } from '../../servidor/esforco';

export function SeletorDeEsforco({ valor, aoMudar, id }: { valor: EsforcoCriativo | undefined; aoMudar: (e: EsforcoCriativo | undefined) => void; id?: string }) {
  return (
    <select id={id} aria-label={id ? undefined : 'Esforço criativo'} value={valor ?? ''} onChange={(e) => aoMudar(lerEsforco(e.target.value))} title="Quanto o Otto explora, questiona e refina antes de entregar. Não muda estilo nem quantidade de elementos.">
      <option value="">Sem nível (como sempre)</option>
      {ESFORCOS_CRIATIVOS.map((e) => {
        const n = NIVEIS_DE_ESFORCO_CRIATIVO[e];
        return (
          <option key={e} value={e}>
            {n.ordem} · {n.rotulo}: {n.titulo}
          </option>
        );
      })}
    </select>
  );
}
