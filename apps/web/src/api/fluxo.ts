// Leitura do fluxo de eventos (text/event-stream) por fetch. O EventSource do navegador não deixa
// mandar Last-Event-ID na primeira conexão, e é por ele que o editor retoma uma tarefa de onde parou.

export interface EventoDoFluxo {
  /** A sequência do evento gravado. Ausente em `tarefa` (a fotografia) e em `fim`. */
  id?: number;
  evento: string;
  dados: unknown;
}

/** Devolve uma função que recebe os pedaços de texto como chegam da rede e devolve os eventos completos. */
export function criarLeitorDeFluxo(): (pedaco: string) => EventoDoFluxo[] {
  let resto = '';
  return (pedaco) => {
    resto += pedaco.replace(/\r\n/g, '\n');
    const blocos = resto.split('\n\n');
    resto = blocos.pop() ?? '';
    return blocos.flatMap((bloco): EventoDoFluxo[] => {
      let id: number | undefined;
      let evento = 'message';
      const dados: string[] = [];
      for (const linha of bloco.split('\n')) {
        if (linha.startsWith('id:')) id = Number(linha.slice(3).trim());
        else if (linha.startsWith('event:')) evento = linha.slice(6).trim();
        else if (linha.startsWith('data:')) dados.push(linha.slice(5).replace(/^ /, ''));
        // comentário (batimento) e `retry:` não interessam
      }
      if (dados.length === 0) return [];
      try {
        return [{ ...(id !== undefined && Number.isFinite(id) ? { id } : {}), evento, dados: JSON.parse(dados.join('\n')) as unknown }];
      } catch {
        return [];
      }
    });
  };
}

/** Lê a resposta até a conexão fechar. Devolve true se o servidor encerrou com o evento `fim`. */
export async function lerFluxo(resposta: Response, aoReceber: (evento: EventoDoFluxo) => void): Promise<boolean> {
  const corpo = resposta.body;
  if (!corpo) return false;
  const leitor = corpo.getReader();
  const texto = new TextDecoder();
  const ler = criarLeitorDeFluxo();
  let fim = false;
  for (;;) {
    const { done, value } = await leitor.read();
    if (done) break;
    for (const evento of ler(texto.decode(value, { stream: true }))) {
      if (evento.evento === 'fim') fim = true;
      aoReceber(evento);
    }
  }
  return fim;
}
