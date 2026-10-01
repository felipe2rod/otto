// Resumo estruturado (ADR 027, item 5.1): o jeito mais barato de o agente enxergar o documento.
import { coresDoVetor, type Documento, ehVisual, type No } from './esquema';
import type { Medidor } from './operacoes';

function resumirNo(n: No, medidor?: Medidor): Record<string, unknown> {
  const base: Record<string, unknown> = { id: n.id, nome: n.nome, tipo: n.tipo };
  if (ehVisual(n)) base.caixa = [Math.round(n.x), Math.round(n.y), Math.round(n.largura), Math.round(n.altura)];
  if (n.opacidade !== 1) base.opacidade = n.opacidade;
  if (n.modoDeMesclagem !== 'normal' && n.modoDeMesclagem !== 'atravessar') base.modoDeMesclagem = n.modoDeMesclagem;
  if (!n.visivel) base.visivel = false;
  if (n.bloqueado) base.bloqueado = true;
  if (n.mascara) base.mascara = n.mascara.tipo === 'sujeito' ? { tipo: 'sujeito', inverter: n.mascara.inverter } : n.mascara;
  if (n.recortadaNaDeBaixo) base.recortadaNaDeBaixo = true;
  if (ehVisual(n) && n.sombra) base.sombra = n.sombra;
  if (ehVisual(n) && n.filtros?.length) base.filtros = n.filtros;
  if (ehVisual(n) && n.rotacao) base.rotacao = n.rotacao;
  if (ehVisual(n) && n.efeitos) base.efeitos = n.efeitos;
  switch (n.tipo) {
    case 'texto': {
      // tinta: onde as letras estão de fato (é por ela que se alinha e se mede espaço)
      if (medidor) {
        const t = medidor.tinta(n);
        base.tinta = [Math.round(t.x), Math.round(t.y), Math.round(t.w), Math.round(t.h)];
      }
      return {
        ...base,
        conteudo: n.conteudo,
        fonte: n.fonte,
        peso: n.peso,
        tamanho: n.tamanho,
        entrelinha: n.entrelinha,
        espacamento: n.espacamento,
        alinhamento: n.alinhamento,
        cor: n.cor,
        ...(n.caixaAlta ? { caixaAlta: true } : {}),
        ...(n.trechos?.length ? { trechos: n.trechos } : {}),
      };
    }
    case 'forma':
      return { ...base, forma: n.forma, preenchimento: n.preenchimento, ...(n.raio ? { raio: n.raio } : {}), ...(n.traco ? { traco: n.traco } : {}) };
    case 'grupo':
      return { ...base, ...(n.modoDeMesclagem !== 'atravessar' ? { modoDeMesclagem: n.modoDeMesclagem } : {}), filhosDeBaixoParaCima: n.filhos.map((f) => resumirNo(f, medidor)) };
    case 'ajuste':
      return { ...base, ajuste: n.ajuste };
    case 'vetor':
      return {
        ...base,
        ...(n.rotacao ? { rotacao: n.rotacao } : {}),
        moldura: n.moldura,
        cores: coresDoVetor(n),
        caminhos: n.caminhos.length,
        ...(n.caminhos.some((c) => c.traco) ? { comTraco: true } : {}),
        ...(n.origem ? { origem: n.origem.nome } : {}),
      };
    case 'imagem':
      return {
        ...base,
        arquivo: n.arquivo.slice(0, 12),
        ajuste: n.ajuste,
        original: [n.larguraOriginal, n.alturaOriginal],
        ...(n.recorte ? { recorte: n.recorte } : {}),
        ...(n.foco.x !== 0.5 || n.foco.y !== 0.5 ? { foco: n.foco } : {}),
        ...(n.zoom !== 1 ? { zoom: n.zoom } : {}),
        ...(n.ajusteDeCor ? { ajusteDeCor: n.ajusteDeCor } : {}),
        ...(n.mascara ? { mascara: n.mascara } : {}),
      };
  }
}

export interface OpcoesDoResumo {
  /** id ou nome da prancheta; sem ele, todas */
  prancheta?: string;
  /** com medidor, cada texto mostra a tinta (onde as letras estão) */
  medidor?: Medidor;
  /** nome da peça. Não mora na árvore: quem chama passa, se quiser que o agente o veja */
  nome?: string;
}

export function resumirDocumento(doc: Documento, opcoes: OpcoesDoResumo = {}): Record<string, unknown> {
  return {
    ...(opcoes.nome !== undefined ? { nome: opcoes.nome } : {}),
    tokens: doc.tokens.cores,
    estilosDeTexto: doc.tokens.estilosDeTexto,
    pranchetas: doc.pranchetas
      .filter((p) => !opcoes.prancheta || p.id === opcoes.prancheta || p.nome === opcoes.prancheta)
      .map((p) => ({ id: p.id, nome: p.nome, tamanho: [p.largura, p.altura], fundo: p.fundo, camadasDeBaixoParaCima: p.filhos.map((n) => resumirNo(n, opcoes.medidor)) })),
  };
}
