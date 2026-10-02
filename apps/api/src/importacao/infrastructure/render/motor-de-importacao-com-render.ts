// Adaptador de MotorDeImportacao: @otto/psd (leitura do PSD atrás da porta FormatoDeArquivoEmCamadas, do
// especialista-grafico) sobre o motor de render único (CanvasKit em CPU). É CPU síncrona por segundos e centenas de
// MB: no worker roda dentro da thread de render (motor.thread.ts); no próprio laço, só em teste.
import { criarFormatoPsd, importarPsd, type ResultadoDaImportacao } from '@otto/psd';
import { carregarCanvasKit } from '@otto/render/node';
import { MotorDeImportacao, type OpcoesDoMotorDeImportacao } from '../../application/motor-de-importacao';

type Motor = Awaited<ReturnType<typeof carregarCanvasKit>>;

export class MotorDeImportacaoComRender extends MotorDeImportacao {
  private motor: Promise<Motor> | undefined;
  private readonly formato = criarFormatoPsd();
  /** Quantas vezes o WebAssembly foi carregado por este adaptador. Deve ficar em 1 (ou 0, com o motor emprestado). */
  cargasDoMotor = 0;

  /** @param emprestado o motor de quem já tem um neste processo ou thread: uma instância só do WebAssembly. */
  constructor(private readonly emprestado?: () => Promise<Motor>) {
    super();
  }

  private carregar(): Promise<Motor> {
    if (this.emprestado) return this.emprestado();
    if (!this.motor) {
      this.cargasDoMotor++;
      this.motor = carregarCanvasKit('completa');
      this.motor.catch(() => {
        this.motor = undefined;
      });
    }
    return this.motor;
  }

  async importar(bytes: Uint8Array, opcoes: OpcoesDoMotorDeImportacao): Promise<ResultadoDaImportacao> {
    // Um Map com as chaves próprias do objeto: nome de fonte é dado de terceiro ("constructor", "__proto__") e não
    // pode alcançar o protótipo.
    const trocas = new Map(Object.entries(opcoes.substituicoes).filter(([, para]) => typeof para === 'string'));
    return importarPsd(await this.carregar(), this.formato, bytes, {
      fontes: opcoes.fontes,
      substituir: (postScript) => trocas.get(postScript),
      ...(opcoes.limites ? { limites: opcoes.limites } : {}),
      ...(opcoes.nomeDaPrancheta ? { nomeDaPrancheta: opcoes.nomeDaPrancheta } : {}),
      // cede a vez depois da leitura: a thread pode ser encerrada, e o laço de teste respira
      entreEtapas: () => new Promise<void>((ok) => setImmediate(ok)),
    });
  }
}
