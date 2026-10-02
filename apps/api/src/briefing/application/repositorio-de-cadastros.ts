// Porta: os cadastros da conta que alimentam o formulário de briefing. Marcas (a identidade de cada cliente
// do designer) e briefings salvos (o formulário pela metade, reutilizável). São uma porta só porque andam
// juntos: apagar a marca desfaz o vínculo dos briefings que apontavam para ela.
// Tudo aqui é conteúdo da conta (ADR 031): não vai para log nem para evento de uso.
import type { CoresDaIdentidade, OpcaoDeCuidado, RascunhoDeBriefing } from '@otto/shared';
import type { EscopoDaConta } from '../../plataforma/escopo/escopo-da-conta';

export interface DadosDeMarca {
  nome: string;
  site?: string;
  cores: CoresDaIdentidade;
  fonteDeTitulo?: string;
  fonteDeTexto?: string;
  /** Hash de um arquivo da conta. Quem confere a posse é o caso de uso. */
  logo?: string;
  icones: string[];
  rodape?: string;
  restricoes: string[];
}

export interface MarcaGuardada extends DadosDeMarca {
  id: string;
  criadaEm: Date;
  alteradaEm: Date;
}

export interface DadosDeBriefing {
  nome: string;
  /** O formulário pela metade. `dados.marcaId`, se houver, é a marca do briefing. */
  dados: RascunhoDeBriefing;
  cuidado?: OpcaoDeCuidado;
}

export interface BriefingGuardado extends DadosDeBriefing {
  id: string;
  /** Quantas tarefas nasceram dele. */
  usos: number;
  criadoEm: Date;
  alteradoEm: Date;
}

export type ItemDeBriefingGuardado = Omit<BriefingGuardado, 'dados' | 'cuidado' | 'criadoEm'> & { marcaId?: string };

export abstract class RepositorioDeCadastros {
  /** 'limite' se a conta já tem `limite` marcas (contar e criar na mesma transação). */
  abstract criarMarca(escopo: EscopoDaConta, nova: { id: string; dados: DadosDeMarca; agora: Date }, limite: number): Promise<MarcaGuardada | 'limite'>;
  /** Por nome. */
  abstract listarMarcas(escopo: EscopoDaConta): Promise<MarcaGuardada[]>;
  abstract buscarMarca(escopo: EscopoDaConta, id: string): Promise<MarcaGuardada | undefined>;
  /** Troca tudo. undefined se a marca não existe nesta conta. */
  abstract substituirMarca(escopo: EscopoDaConta, id: string, dados: DadosDeMarca, agora: Date): Promise<MarcaGuardada | undefined>;
  /** Apaga. Os briefings salvos da marca ficam, sem o vínculo. false se não existe nesta conta. */
  abstract apagarMarca(escopo: EscopoDaConta, id: string): Promise<boolean>;

  /** 'limite' como nas marcas; 'marca' se `dados.marcaId` não é marca desta conta. */
  abstract criarBriefing(escopo: EscopoDaConta, novo: { id: string; dados: DadosDeBriefing; agora: Date }, limite: number): Promise<BriefingGuardado | 'limite' | 'marca'>;
  /** Do alterado mais recentemente para o mais antigo, sem os dados. */
  abstract listarBriefings(escopo: EscopoDaConta): Promise<ItemDeBriefingGuardado[]>;
  abstract buscarBriefing(escopo: EscopoDaConta, id: string): Promise<BriefingGuardado | undefined>;
  abstract substituirBriefing(escopo: EscopoDaConta, id: string, dados: DadosDeBriefing, agora: Date): Promise<BriefingGuardado | 'marca' | undefined>;
  abstract apagarBriefing(escopo: EscopoDaConta, id: string): Promise<boolean>;
  /** Mais uma tarefa nasceu deste briefing. false se ele não existe nesta conta. Não mexe em `alteradoEm`. */
  abstract contarUso(escopo: EscopoDaConta, id: string): Promise<boolean>;
}
