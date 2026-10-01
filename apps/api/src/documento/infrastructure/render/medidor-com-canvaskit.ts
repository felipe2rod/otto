// Adaptador de MedidorDeTexto com o motor de render único (@otto/render, CanvasKit em CPU).
// Só o motor de TEXTO é usado: mede a tinta, não cria superfície nem rasteriza. Cabe numa requisição.
// O CanvasKit é carregado uma vez por processo, na primeira vez que um lote mede (50 a 80 ms, 128 MB).
// Cada lote abre uma sessão própria e a destrói: nada fica de um lote para o outro.
import { type Documento, todasAsCamadas } from '@otto/documento';
import { criarMedidor, criarSessao, type FonteDeArquivo } from '@otto/render';
import { carregarCanvasKit } from '@otto/render/node';
import type { BibliotecaDeFontes } from '../../../biblioteca/application/biblioteca-de-fontes';
import { type MedidorAberto, MedidorDeTexto } from '../../application/medidor-de-texto';

type Motor = Awaited<ReturnType<typeof carregarCanvasKit>>;

/**
 * Famílias de fonte que o lote pode precisar medir: as do documento e as que as operações citam
 * (um lote pode criar o texto e alinhar na mesma tacada).
 */
export function familiasCitadas(doc: Documento, operacoes: readonly unknown[]): Set<string> {
  const familias = new Set<string>();
  for (const estilo of Object.values(doc.tokens.estilosDeTexto)) familias.add(estilo.fonte);
  for (const prancheta of doc.pranchetas) {
    for (const no of todasAsCamadas(prancheta.filhos)) {
      if (no.tipo !== 'texto') continue;
      familias.add(no.fonte);
      for (const trecho of no.trechos ?? []) if (trecho.fonte) familias.add(trecho.fonte);
    }
  }
  const varrer = (valor: unknown, profundidade: number): void => {
    if (profundidade > 12 || typeof valor !== 'object' || valor === null) return;
    if (Array.isArray(valor)) {
      for (const item of valor) varrer(item, profundidade + 1);
      return;
    }
    for (const [chave, dentro] of Object.entries(valor)) {
      if (chave === 'fonte' && typeof dentro === 'string') familias.add(dentro);
      else varrer(dentro, profundidade + 1);
    }
  };
  varrer(operacoes, 0);
  return familias;
}

export class MedidorComCanvasKit extends MedidorDeTexto {
  private motor: Promise<Motor> | undefined;
  /** Quantas vezes o WebAssembly foi carregado neste processo. Deve ficar em 1. */
  cargasDoMotor = 0;

  constructor(private readonly fontes: BibliotecaDeFontes) {
    super();
  }

  private carregar(): Promise<Motor> {
    if (!this.motor) {
      this.cargasDoMotor++;
      this.motor = carregarCanvasKit();
      // se a carga falhar, a próxima chamada tenta de novo em vez de guardar a falha
      this.motor.catch(() => {
        this.motor = undefined;
      });
    }
    return this.motor;
  }

  async abrir(doc: Documento, operacoes: readonly unknown[]): Promise<MedidorAberto> {
    const arquivos: FonteDeArquivo[] = [];
    for (const familia of familiasCitadas(doc, operacoes)) {
      // todos os pesos da família: o motor escolhe o mais próximo do pedido
      for (const fonte of await this.fontes.pesosDa(familia)) {
        const bytes = await this.fontes.bytes(fonte);
        if (bytes) arquivos.push({ familia: fonte.familia, peso: fonte.peso, bytes });
      }
    }
    const sessao = criarSessao(await this.carregar(), { fontes: arquivos, imagens: [] });
    return { medidor: criarMedidor(sessao), liberar: () => sessao.destruir() };
  }
}
