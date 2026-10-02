// Apoio dos testes do ciclo: documento de exemplo, ambiente em memória com portas de mentira e relógio que
// anda sozinho. O modelo é o roteirizado (modelo-roteirizado.ts): os testes não falam com modelo nenhum.
import { type Aviso, aplicarLote, type Documento, documentoVazio, resumirDocumento } from '@otto/documento';
import type { EventoDaTarefa } from './contrato';
import type { AmbienteDaTarefa, ChamadaRegistrada, ImagemParaOModelo, LoteDoAgente, ModeloDoAgente, PedidoDeRender } from './portas';

export function aplicar(doc: Documento, operacoes: unknown[], lote = 'lote-de-preparo'): Documento {
  const r = aplicarLote(doc, operacoes, { autoria: { tipo: 'designer' }, idDoLote: lote });
  if (!r.ok) throw new Error(`${r.erro.op}: ${r.erro.mensagem}`);
  return r.doc;
}

const texto = (nome: string, conteudo: string, y: number, extra: object = {}) => ({
  tipo: 'texto',
  nome,
  conteudo,
  x: 72,
  y,
  largura: 900,
  altura: 160,
  fonte: 'Anton',
  tamanho: 80,
  cor: '#111111',
  ...extra,
});

/** Uma peça que "o designer fez": Feed e Story, com fundo, título, subtítulo, um selo e um logo bloqueado. */
export function pecaDoDesigner(): Documento {
  return aplicar(documentoVazio(), [
    { op: 'criarPrancheta', nome: 'Feed', largura: 1080, altura: 1350, fundo: '#f4efe3' },
    { op: 'criarNo', prancheta: 'Feed', no: { tipo: 'forma', forma: 'retangulo', nome: 'Fundo', x: 0, y: 0, largura: 1080, altura: 1350, preenchimento: '#f4efe3' } },
    { op: 'criarNo', prancheta: 'Feed', no: texto('Título', 'Cappuccino em dobro', 200) },
    { op: 'criarNo', prancheta: 'Feed', no: texto('Subtítulo', 'O segundo sai por R$ 1', 420, { tamanho: 40, fonte: 'IBM Plex Sans' }) },
    { op: 'criarNo', prancheta: 'Feed', no: { tipo: 'forma', forma: 'elipse', nome: 'Selo', x: 800, y: 80, largura: 200, altura: 200, preenchimento: '#f4c430' } },
    { op: 'criarNo', prancheta: 'Feed', no: texto('Logo', 'Café Aurora', 1200, { tamanho: 36, bloqueado: true }) },
    { op: 'criarPrancheta', nome: 'Story', largura: 1080, altura: 1920, fundo: '#f4efe3' },
    { op: 'criarNo', prancheta: 'Story', no: texto('Título', 'Cappuccino em dobro', 500) },
  ]);
}

export const idDe = (doc: Documento, caminho: string): string => {
  const [prancheta, camada] = caminho.split('/');
  const p = doc.pranchetas.find((x) => x.nome === prancheta);
  if (!p) throw new Error(`sem prancheta ${prancheta}`);
  if (!camada) return p.id;
  const n = p.filhos.find((x) => x.nome === camada);
  if (!n) throw new Error(`sem camada ${caminho}`);
  return n.id;
};

export interface AmbienteDeTeste extends AmbienteDaTarefa {
  eventos: EventoDaTarefa[];
  chamadas: ChamadaRegistrada[];
  lotes: LoteDoAgente[];
  renders: PedidoDeRender[];
  /** Avisos que a verificação de mentira devolve; o teste troca quando quer. */
  avisos: (doc: Documento, prancheta?: string) => Aviso[];
  cancelar(): void;
}

export const IMAGEM_DE_MENTIRA: ImagemParaOModelo = { mime: 'image/jpeg', base64: '/9j/AAAA', largura: 614, altura: 768 };

export function ambienteDeTeste(modelo: ModeloDoAgente, inicial: Documento = documentoVazio(), extra: Partial<AmbienteDaTarefa> = {}): AmbienteDeTeste {
  let doc = inicial;
  let agora = 1_000_000;
  let ids = 0;
  const controle = new AbortController();
  const amb: AmbienteDeTeste = {
    modelo,
    eventos: [],
    chamadas: [],
    lotes: [],
    renders: [],
    avisos: () => [],
    cancelar: () => controle.abort(),
    documento: () => doc,
    resumir: (d, prancheta) => resumirDocumento(d, prancheta ? { prancheta } : {}),
    async aplicarLote(lote) {
      const r = aplicarLote(doc, lote.operacoes, { autoria: { tipo: 'agente', tarefaId: 'tarefa-de-teste' }, idDoLote: lote.id });
      if (!r.ok) return { ok: false, erro: r.erro };
      doc = r.doc;
      amb.lotes.push(lote);
      return { ok: true, tocados: r.tocados, versao: amb.lotes.length };
    },
    async renderizar(_doc, pedido) {
      amb.renders.push(pedido);
      return IMAGEM_DE_MENTIRA;
    },
    verificar: async (d, prancheta) => amb.avisos(d, prancheta),
    fontes: {
      daConta: () => [
        { familia: 'Anton', pesos: [400] },
        { familia: 'IBM Plex Sans', pesos: [300, 400, 500, 600, 700] },
      ],
    },
    // cada leitura do relógio anda um segundo: a duração fica previsível sem esperar de verdade
    relogio: { agora: () => (agora += 1000) },
    novoId: () => `0199aaaa-bbbb-7ccc-8ddd-${String(++ids).padStart(12, '0')}`,
    emitir: (e) => void amb.eventos.push(e),
    registrarChamada: (c) => void amb.chamadas.push(c),
    sinal: controle.signal,
    ...extra,
  };
  return amb;
}

/** Uma direção de arte que passa na validação. */
export const DIRECAO_VALIDA = {
  leituraDaMarca: 'Roxo saturado sobre branco, grotesca geométrica pesada com tracking fechado, foto de gente real em luz natural, botão pílula.',
  conceito: 'Gente de verdade no meio do dia, com o título grande em branco por cima da foto.',
  assinatura: 'Título branco enorme em grotesca fechada, sempre sobre foto de gente real, com o roxo só no botão.',
  arquetipo: 'A',
  porque: 'É a linguagem do próprio site: foto sangrada e título grande em branco.',
  hierarquia: ['título', 'foto', 'chamada'],
  paleta: { dominante: '#FFFFFF', apoio: '#8D0DE3', acento: '#1E002F', texto: '#FFFFFF' },
  tipografia: { titulo: { familia: 'Inter', peso: 700, caixaAlta: false, espacamento: -25 }, texto: { familia: 'Inter', peso: 400 } },
  imagem: { papel: 'foto sangrada de pessoa real sorrindo', buscarPor: ['woman smiling phone city'], tratamento: 'quente, sem duotone' },
  forma: 'botão pílula roxo, cantos redondos 24',
  tecnicas: ['película em degradê só na faixa do texto'],
  evitar: ['duotone', 'serifa', 'caixa alta no título'],
};
