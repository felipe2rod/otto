// Porta: dado de uso (ADR 031). Tipo, contagem, duração e resultado; NUNCA conteúdo.
// Os tipos abaixo são a lista de permissão: um evento só carrega os campos declarados aqui,
// e nenhum deles é texto livre. O catálogo de eventos é do analista-de-produto; estes são
// os que o código consegue emitir hoje. Na fatia de produção o adaptador grava em tabela.
import type { EscopoDaConta } from '../escopo/escopo-da-conta';

type FormatoExportado = 'psd' | 'png' | 'svg' | 'pdf';

export type EventoDeUso =
  | { evento: 'peca_de_exemplo_semeada'; documentoId: string }
  | { evento: 'miniatura_gerada'; documentoId: string; versao: number; bytes: number; duracaoMs: number }
  | { evento: 'lote_aplicado'; documentoId: string; autoria: 'designer' | 'agente'; operacoesPorTipo: Record<string, number>; nosTocados: number; mediuTexto: boolean; versao: number }
  | { evento: 'arquivo_enviado'; tipo: string; bytes: number; largura: number; altura: number }
  | { evento: 'exportacao_pedida'; exportacaoId: string; documentoId: string; formato: FormatoExportado; pacote: boolean; pranchetas: number; juntas: boolean }
  | { evento: 'exportacao_baixada'; exportacaoId: string; documentoId: string; formato: FormatoExportado; pacote: boolean }
  | { evento: 'exportacao_limpa'; exportacaoId: string; arquivos: number; bytes: number }
  // A tarefa do Otto. O texto do pedido é dado de uso (ADR 031) e mora em entradas_de_tarefa, com acesso
  // restrito: NÃO entra aqui. Aqui só tipos, códigos e números.
  | { evento: 'tarefa_pedida'; tarefaId: string; documentoId: string; tipo: string; esforco?: string; porFormulario?: boolean; formatos?: number; cuidado?: string; deBriefingSalvo?: boolean }
  | { evento: 'tarefa_confirmacao'; tarefaId: string; documentoId: string; resposta: 'pode' | 'ajustar' | 'cancelar' }
  | {
      evento: 'tarefa_terminada';
      tarefaId: string;
      documentoId: string;
      tipo: string;
      estado: string;
      fim: string;
      erro?: string;
      lotes: number;
      lotesRecusados: number;
      chamadas: number;
      tokensDeEntrada: number;
      tokensDeCacheLidos: number;
      tokensDeCacheCriados: number;
      tokensDeSaida: number;
      imagens: number;
      voltasDeConferencia: number;
      duracaoMs: number;
      /** Milionésimos de dólar, pelo preço que o modelo declara. Ausente: o modelo não declara preço. */
      microDolares?: number;
      conferida: boolean;
    }
  // Cadastros e banco de imagens (fatia 4). Marca, briefing e consulta de busca são conteúdo ou dado de uso
  // de acesso restrito: aqui só identificadores, contagens e códigos.
  | { evento: 'marca_salva'; marcaId: string; nova: boolean; cores: number; fontes: number; comLogo: boolean; icones: number; restricoes: number }
  | { evento: 'marca_apagada'; marcaId: string }
  | { evento: 'briefing_salvo'; briefingId: string; novo: boolean; formatos: number; comMarca: boolean }
  | { evento: 'briefing_apagado'; briefingId: string }
  | { evento: 'imagens_buscadas'; banco: string; origem: 'editor' | 'otto'; resultados: number; doCache: boolean; duracaoMs: number }
  | { evento: 'imagem_trazida'; banco: string; origem: 'editor' | 'otto'; bytes: number; largura: number; altura: number; jaTinha: boolean }
  | { evento: 'textura_trazida'; textura: string }
  // Importação de PSD. Nome de arquivo, de camada e de fonte são conteúdo: aqui só medidas, contagens e códigos.
  | { evento: 'psd_enviado'; importacaoId: string; formato: 'psd' | 'psb'; bytes: number; largura: number; altura: number; camadas: number; fontes: number; fontesEmFalta: number }
  | { evento: 'importacao_pedida'; importacaoId: string; comNome: boolean; comMarca: boolean; viramImagem: number; baixadas: number; substituidas: number }
  | { evento: 'importacao_descartada'; importacaoId: string; motivo: 'desistencia' | 'vencimento'; bytes: number }
  | {
      evento: 'importacao_terminada';
      importacaoId: string;
      documentoId?: string;
      resultado: 'pronta' | 'falhou';
      /** Código da falha (`psd_recusado`, `falha_na_importacao`...). */
      erro?: string;
      /** Com `psd_recusado`: o código do pacote de PSD (`modo-de-cor`, `pixels-demais`...). */
      motivo?: string;
      /** 1 é o normal; 2 é uma retomada (o worker da primeira morreu). */
      tentativa: number;
      formato: 'psd' | 'psb';
      bytes: number;
      /** Registros de camada do arquivo. */
      camadas: number;
      pranchetas: number;
      camadasEditaveis: number;
      camadasComoImagem: number;
      camadasIgnoradas: number;
      imagens: number;
      bytesDasImagens: number;
      fontesEmFalta: number;
      substituicoes: number;
      avisos: number;
      /** Do pedido de importação ao começo do trabalho. */
      esperaMs: number;
      duracaoMs: number;
    }
  | { evento: 'tarefa_decidida'; tarefaId: string; documentoId: string; resultado: 'aceita' | 'aceita_em_parte' | 'desfeita' }
  | {
      evento: 'exportacao_terminada';
      exportacaoId: string;
      documentoId: string;
      formato: FormatoExportado;
      pacote: boolean;
      /** 1 é o normal; 2 é uma retomada (o worker da primeira morreu). */
      tentativa: number;
      resultado: 'pronta' | 'pronta_em_parte' | 'falhou';
      pranchetas: number;
      falhas: number;
      arquivos: number;
      bytes: number;
      /** Do pedido ao começo do trabalho. */
      esperaMs: number;
      /** Do começo do trabalho ao fim. */
      duracaoMs: number;
    };

export abstract class RegistroDeUso {
  abstract registrar(escopo: EscopoDaConta, evento: EventoDeUso): void;
}

export class RegistroDeUsoMudo extends RegistroDeUso {
  registrar(): void {}
}
