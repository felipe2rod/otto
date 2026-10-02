// Adaptador falso de RepositorioDeArquivos, para os testes de caso de uso.
import type { EscopoDaConta } from '../../../plataforma/escopo/escopo-da-conta';
import { type ArquivoRegistrado, type NovoArquivo, RepositorioDeArquivos } from '../../application/repositorio-de-arquivos';

export class RepositorioDeArquivosEmMemoria extends RepositorioDeArquivos {
  private readonly porConta = new Map<string, Map<string, ArquivoRegistrado>>();
  private readonly quando = new Map<ArquivoRegistrado, Date>();

  private daConta(escopo: EscopoDaConta): Map<string, ArquivoRegistrado> {
    let mapa = this.porConta.get(escopo.contaId);
    if (!mapa) {
      mapa = new Map();
      this.porConta.set(escopo.contaId, mapa);
    }
    return mapa;
  }

  async buscar(escopo: EscopoDaConta, sha256: string): Promise<ArquivoRegistrado | undefined> {
    return this.daConta(escopo).get(sha256);
  }

  async quaisExistem(escopo: EscopoDaConta, sha256s: readonly string[]): Promise<Set<string>> {
    const mapa = this.daConta(escopo);
    return new Set(sha256s.filter((s) => mapa.has(s)));
  }

  async registrar(escopo: EscopoDaConta, novo: NovoArquivo): Promise<ArquivoRegistrado> {
    const mapa = this.daConta(escopo);
    const existente = mapa.get(novo.sha256);
    if (existente) return existente;
    const { id: _id, ...registro } = novo;
    mapa.set(novo.sha256, registro);
    this.quando.set(registro, new Date());
    return registro;
  }

  async contarTrazidosDesde(escopo: EscopoDaConta, desde: Date): Promise<number> {
    return [...this.daConta(escopo).values()].filter((a) => a.origem?.idExterno && (this.quando.get(a) ?? new Date(0)) >= desde).length;
  }
}
