// RASCUNHO: texto de interface ainda sem revisão do guardião da marca. Não é texto final.
// Fonte: docs/mvp/experiencia.md, seções 2.2 e 3.2.
import { plural } from './plural';

export const pecas = {
  tituloDaPagina: 'Peças · Otto',
  marca: 'Otto',
  navegacao: 'Seções do Otto',
  titulo: 'Peças',
  vazio: 'Nenhuma peça ainda. Preencha um briefing e o Otto monta a primeira versão em camadas.',
  // Nunca uma lista vazia no lugar do erro: vazio lido como "perdi tudo" é o pior engano desta tela.
  erro: 'Não consegui carregar suas peças.',
  tentarDeNovo: 'Tentar de novo',
  carregando: 'Carregando suas peças…',
  novaPeca: 'Nova peça',
  criando: 'Criando…',
  carregarMais: 'Carregar mais peças',
  acoes: (nome: string): string => `Ações de ${nome}`,
  renomear: 'Renomear',
  duplicar: 'Duplicar',
  excluir: 'Excluir',
  novoNome: (nome: string): string => `Novo nome de ${nome}`,
  salvar: 'Salvar',
  cancelar: 'Cancelar',
  confirmarExclusao: (nome: string): string => `Excluir "${nome}"?`,
  fecharAviso: 'Fechar aviso',
  lista: 'Suas peças',
  formatos: (n: number): string => plural(n, { um: '1 formato', outros: `${n} formatos`, zero: 'sem prancheta' }),
  alterada: (quando: string): string => `alterada ${quando}`,
  /** O que o designer lê em cada estado de tarefa viva. Nome de estado é do código; este é o da tela. */
  estadoDaTarefa: {
    na_fila: 'Na fila',
    preparando: 'Otto trabalhando',
    rodando: 'Otto trabalhando',
    aguardando_confirmacao: 'Aguardando seu "pode"',
    em_revisao: 'Pronto para revisar',
    falhou: 'Não terminou',
  },
} as const;
