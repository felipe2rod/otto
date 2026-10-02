// Tamanho de cada parte do que vai ao modelo em toda chamada: ferramentas e blocos do prompt do sistema.
// É o prefixo que o cache guarda, e ele é relido a cada chamada do ciclo: o tamanho dele vezes o número de
// chamadas é a maior parcela dos tokens de uma tarefa. Sem rede: conta caracteres (no Claude, em português
// e JSON, um token dá perto de 3 caracteres; o número exato sai de `cacheCriado` na primeira chamada).
//
//   docker compose run --rm --no-deps teste pnpm --filter @otto/agente exec tsx ../../avaliacao/comandos/medir-prompt.ts
import { ferramentasDoAgente, montarPromptDoSistema } from '../../packages/agente/src/index';

const fontes = [{ familia: 'IBM Plex Sans', pesos: [300, 400, 500, 600, 700] }];
const linha = (nome: string, texto: string) => console.log(`${nome.padEnd(46)} ${String(texto.length).padStart(7)} caracteres`);

for (const modo of ['tarefa', 'ajuste'] as const) {
  const capacidades = { bancoDeImagens: modo === 'tarefa', sujeito: false, texturas: false, buscaDeFontes: false };
  const ferramentas = ferramentasDoAgente({ modo, capacidades });
  const sistema = montarPromptDoSistema({ modo, capacidades, fontes, ...(modo === 'tarefa' ? { esforco: 'REFINED' as const } : {}) });
  console.log(`\n== ${modo} ==`);
  for (const f of ferramentas) linha(`ferramenta ${f.nome}`, JSON.stringify(f));
  linha('ferramentas, todas', JSON.stringify(ferramentas));
  linha('sistema, prefixo estável', sistema[0] ?? '');
  linha('sistema, contexto da tarefa e da conta', sistema[1] ?? '');
  linha('total', JSON.stringify(ferramentas) + sistema.join(''));
}
