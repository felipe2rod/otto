// O caminho rápido do ajuste pontual: duas chamadas ao modelo no caso comum (fazer; olhar e entregar),
// sem direção de arte, sem plano do modelo e sem segunda conferência. A conferência não some: quem roda a
// verificação e o render é o sistema, na resposta do próprio lote.
import type { Aviso, Documento } from '@otto/documento';
import { describe, expect, it } from 'vitest';
import { ambienteDeTeste, idDe, pecaDoDesigner } from './apoio-de-teste';
import type { EntradaDaTarefa } from './contrato';
import { criarModeloRoteirizado, type Passo } from './modelo-roteirizado';
import { rodarTarefa } from './tarefa';

const lote = (descricao: string, operacoes: unknown[]) => ({ nome: 'aplicarOperacoes', argumentos: { descricao, operacoes } });
const azul = (alvo = 'Feed/Título') => ({ op: 'alterar', alvo, props: { cor: '#1f5fbf' } });
const entregar = (resumo: string, pendencias: unknown[] = []): Passo => ({ chamadas: [{ nome: 'entregar', argumentos: { resumo, pendencias } }] });
const AJUSTE: EntradaDaTarefa = { tipo: 'ajuste', pedido: 'título em azul' };

async function rodar(passos: Passo[], entrada: EntradaDaTarefa = AJUSTE, preparar?: (amb: ReturnType<typeof ambienteDeTeste>) => void) {
  const modelo = criarModeloRoteirizado({ passos });
  const amb = ambienteDeTeste(modelo, pecaDoDesigner());
  preparar?.(amb);
  const { resultado, preparo } = await rodarTarefa(amb, entrada);
  return { modelo, amb, resultado, preparo };
}
const ultimaMensagem = (m: ReturnType<typeof criarModeloRoteirizado>, i: number) => m.pedidos[i]?.mensagens.at(-1);

describe('ajuste pontual em duas chamadas', () => {
  const passos: Passo[] = [{ chamadas: [lote('Título em azul', [azul()])] }, entregar('Título em azul.')];

  it('faz, o sistema confere na mesma resposta, e a entrega é aceita', async () => {
    const { modelo, resultado, amb } = await rodar(passos);
    expect(resultado.fim).toBe('entregue');
    expect(resultado.conferida).toBe(true);
    expect(resultado.custo.chamadas).toBe(2);
    expect(modelo.pedidos.map((p) => p.papel)).toEqual(['ajuste', 'ajuste']);
    expect(amb.renders).toEqual([{ prancheta: idDe(amb.documento(), 'Feed'), ladoMaximo: 768 }]);
    expect(resultado.custo.voltasDeConferencia).toBe(1);
    expect(resultado.custo.imagensVistas).toBe(1);
  });

  it('a resposta do lote já traz a verificação e o render', async () => {
    const { modelo } = await rodar(passos);
    const m = ultimaMensagem(modelo, 1);
    if (m?.papel !== 'ferramentas') throw new Error('esperava resposta de ferramenta');
    expect(m.resultados[0]?.texto).toContain('Lote aplicado');
    expect(m.resultados[0]?.texto).toContain('Verificação de "Feed"');
    expect(m.anexos.filter((p) => p.tipo === 'imagem')).toHaveLength(1);
  });

  it('a resposta do lote diz que o render já veio, para o modelo não gastar uma chamada pedindo de novo', async () => {
    const { modelo } = await rodar(passos);
    const m = ultimaMensagem(modelo, 1);
    expect(m?.papel === 'ferramentas' && m.resultados[0]?.texto).toContain('não chame renderizar de novo');
  });

  it('não há direção, plano do modelo nem segunda conferência; o raciocínio é baixo', async () => {
    const { modelo, preparo } = await rodar(passos);
    expect(preparo?.direcao).toBeNull();
    expect(modelo.pedidos.every((p) => p.raciocinio === 'baixo')).toBe(true);
    expect(modelo.pedidos[0]?.ferramentas.map((f) => f.nome)).toEqual(['aplicarOperacoes', 'renderizar', 'entregar']);
  });

  it('o prompt é o enxuto e o documento já vem na primeira mensagem', async () => {
    const { modelo } = await rodar(passos);
    const p = modelo.pedidos[0];
    expect(p?.sistema.join('\n')).toContain('ajuste pontual');
    expect(p?.sistema.join('\n')).not.toContain('Arquétipos de composição');
    const m = p?.mensagens[0];
    const texto = m?.papel === 'usuario' && m.partes[0]?.tipo === 'texto' ? m.partes[0].texto : '';
    expect(texto).toContain('"conteudo":"Cappuccino em dobro"');
    expect(texto).toMatch(/<material-[0-9a-z]{8} origem="pedido">\ntítulo em azul/);
  });

  it('as etapas são leitura, produção, conferência e entrega', async () => {
    const { amb } = await rodar(passos);
    expect(amb.eventos.flatMap((e) => (e.tipo === 'etapa' ? [e.etapa] : []))).toEqual(['leitura', 'producao', 'conferencia', 'entrega']);
  });

  it('com seleção, só a prancheta da seleção vai para o modelo', async () => {
    const doc = pecaDoDesigner();
    const { modelo } = await rodar(passos, { tipo: 'ajuste', pedido: 'deixa em azul', selecao: [idDe(doc, 'Feed/Título')] });
    const m = modelo.pedidos[0]?.mensagens[0];
    const texto = m?.papel === 'usuario' && m.partes[0]?.tipo === 'texto' ? m.partes[0].texto : '';
    expect(texto).toContain('"Feed/Título"');
    expect(texto).toContain('"nome":"Feed"');
    expect(texto).not.toContain('"nome":"Story"');
  });
});

describe('ajuste pontual: limites que o sistema cumpre', () => {
  it('não mexe em duas pranchetas: o lote é recusado e nada muda', async () => {
    const { amb, modelo } = await rodar([
      { chamadas: [lote('Azul nos dois', [azul('Feed/Título'), azul('Story/Título')])] },
      entregar('Precisa virar tarefa completa.', [{ texto: 'O pedido toca duas pranchetas.', tipo: 'fora_do_ajuste' }]),
    ]);
    expect(amb.eventos.some((e) => e.tipo === 'lote-recusado' && e.motivo === 'fora_do_ajuste')).toBe(true);
    const m = ultimaMensagem(modelo, 1);
    expect(m?.papel === 'ferramentas' && m.resultados[0]?.texto).toContain('uma prancheta só');
    expect(amb.lotes).toEqual([]);
  });

  it('pedido maior que um ajuste: entrega sem alterar, com a pendência "fora do ajuste"', async () => {
    const { resultado } = await rodar([entregar('Isso pede uma tarefa completa.', [{ texto: 'Adaptar para Story cria prancheta.', tipo: 'fora_do_ajuste' }])], {
      tipo: 'ajuste',
      pedido: 'adapta para banner',
    });
    expect(resultado.fim).toBe('entregue');
    expect(resultado.lotes).toBe(0);
    expect(resultado.entrega.pendencias).toEqual([{ tipo: 'fora_do_ajuste', texto: 'Adaptar para Story cria prancheta.', camadas: [], origem: 'otto' }]);
  });

  it('não remove camada do designer nem desbloqueia camada bloqueada', async () => {
    const { amb } = await rodar([
      { chamadas: [lote('Tiro o selo', [{ op: 'remover', alvo: 'Feed/Selo' }])] },
      { chamadas: [lote('Destravo o logo', [{ op: 'alterar', alvo: 'Feed/Logo', props: { bloqueado: false } }])] },
      entregar('Não fiz.', [{ texto: 'Remoção e camada bloqueada ficam fora do ajuste.', tipo: 'fora_do_ajuste' }]),
    ]);
    expect(amb.eventos.flatMap((e) => (e.tipo === 'lote-recusado' ? [e.motivo] : []))).toEqual(['fora_do_ajuste', 'operacao_recusada']);
    expect(amb.lotes).toEqual([]);
  });

  it('tem teto curto de chamadas: não vira tarefa longa por engano', async () => {
    const voltas: Passo[] = Array.from({ length: 12 }, (_, i) => ({ chamadas: [lote(`Mexo ${i}`, [{ op: 'mover', alvo: 'Feed/Título', x: 72, y: 200 + i }])] }));
    const { resultado } = await rodar(voltas);
    expect(resultado.fim).toBe('limite_de_passos');
    expect(resultado.custo.chamadas).toBe(8);
  });
});

describe('ajuste pontual: a verificação separa o que é do ajuste do que já estava lá', () => {
  const antigo: Aviso = { regra: 'margem', gravidade: 'aviso', prancheta: 'Feed', no: 'n-selo', camada: 'Selo', mensagem: '"Selo" encosta na borda' };
  const novo: Aviso = { regra: 'contraste', gravidade: 'erro', prancheta: 'Feed', no: 'n-titulo', camada: 'Título', mensagem: 'contraste de "Título" com o fundo real é 2.0:1' };

  it('aviso que já existia antes não é cobrado do ajuste nem vira pendência', async () => {
    const { modelo, resultado } = await rodar([{ chamadas: [lote('Título em azul', [azul()])] }, entregar('Título em azul.')], AJUSTE, (amb) => {
      amb.avisos = () => [antigo];
    });
    const m = ultimaMensagem(modelo, 1);
    const texto = m?.papel === 'ferramentas' ? (m.resultados[0]?.texto ?? '') : '';
    expect(texto).toContain('0 novo(s)');
    expect(texto).toContain('1 já existiam antes da tarefa');
    expect(texto).not.toContain('encosta na borda');
    expect(resultado.entrega.pendencias).toEqual([]);
  });

  it('erro novo causado pelo ajuste aparece na resposta e, se ficar, vira pendência', async () => {
    const amarelo = (doc: Documento) => JSON.stringify(doc.pranchetas[0]).includes('#f4e9a0');
    const { modelo, resultado } = await rodar(
      [{ chamadas: [lote('Título em amarelo', [{ op: 'alterar', alvo: 'Feed/Título', props: { cor: '#f4e9a0' } }])] }, entregar('Ficou com pouco contraste.')],
      AJUSTE,
      (amb) => {
        amb.avisos = (doc) => (amarelo(doc) ? [antigo, novo] : [antigo]);
      },
    );
    const m = ultimaMensagem(modelo, 1);
    expect(m?.papel === 'ferramentas' && m.resultados[0]?.texto).toContain('contraste de "Título"');
    expect(resultado.entrega.pendencias.map((p) => p.regra)).toEqual(['contraste']);
  });

  it('render que falha não desfaz o lote; a entrega sai dizendo que não foi conferida pelo render', async () => {
    const { resultado, amb, modelo } = await rodar([{ chamadas: [lote('Título em azul', [azul()])] }, entregar('Apliquei, mas não vi o render.')], AJUSTE, (a) => {
      a.renderizar = async () => {
        throw new Error('sem memória');
      };
    });
    expect(amb.lotes).toHaveLength(1);
    const m = ultimaMensagem(modelo, 1);
    expect(m?.papel === 'ferramentas' && m.resultados[0]?.texto).toContain('O render de "Feed" falhou');
    expect(resultado.conferida).toBe(false);
    expect(resultado.entrega.pendencias.map((p) => p.tipo)).toEqual(['sem_conferencia']);
  });
});
