// Adaptador de MedidorDeTexto com o motor de render único (@otto/render, CanvasKit em CPU).
// Só o motor de TEXTO é usado: mede a tinta, não cria superfície nem rasteriza. Cabe numa requisição.
// O CanvasKit é carregado uma vez por processo, na primeira vez que um lote mede (50 a 80 ms, 128 MB).
// Cada lote abre uma sessão própria e a destrói: nada fica de um lote para o outro.
import type { Documento } from '@otto/documento';
import { criarMedidor, criarSessao, type FonteDeArquivo } from '@otto/render';
import { carregarCanvasKit } from '@otto/render/node';
import type { BibliotecaDeFontes } from '../../../biblioteca/application/biblioteca-de-fontes';
import { type MedidorAberto, MedidorDeTexto } from '../../application/medidor-de-texto';
import { familiasCitadas } from '../../domain/familias-citadas';

type Motor = Awaited<ReturnType<typeof carregarCanvasKit>>;

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
