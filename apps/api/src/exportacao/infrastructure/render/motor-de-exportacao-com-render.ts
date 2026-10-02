// Adaptador de MotorDeExportacao: o motor de render único (@otto/render, CanvasKit em CPU) e os
// escritores de PSD, SVG e PDF (@otto/psd, atrás da porta FormatoDeArquivoEmCamadas do especialista-grafico).
// Só o worker chama isto: é CPU por segundos e centenas de MB (o limite está no compose).
// O WebAssembly é carregado uma vez por processo; cada exportação abre e destrói a própria sessão.
import type { Documento } from '@otto/documento';
import { criarFormatoPdf, criarFormatoPsd, criarFormatoSvg, exportarPng, exportarPsd, exportarVetorial, type RecursosDaExportacao } from '@otto/psd';
import { carregarCanvasKit } from '@otto/render/node';
import { type ArquivoGerado, type EntreEtapas, MotorDeExportacao, type OpcoesDoPdf, type OpcoesDoSvg } from '../../application/motor-de-exportacao';

type Motor = Awaited<ReturnType<typeof carregarCanvasKit>>;

export class MotorDeExportacaoComRender extends MotorDeExportacao {
  private motor: Promise<Motor> | undefined;
  private readonly formato = criarFormatoPsd();
  private readonly formatoSvg = criarFormatoSvg();
  private readonly formatoPdf = criarFormatoPdf();
  /** Quantas vezes o WebAssembly foi carregado neste processo. Deve ficar em 1. */
  cargasDoMotor = 0;

  /** O motor deste processo (ou thread), carregado na primeira vez. Quem importa PSD na mesma thread usa o mesmo. */
  carregar(): Promise<Motor> {
    if (!this.motor) {
      this.cargasDoMotor++;
      // A variante completa codifica JPEG: é em JPEG que vai, no SVG e no PDF, toda imagem sem transparência
      // (com a padrão o arquivo sai certo, em PNG, várias vezes maior). Os pixels são os mesmos nas duas.
      this.motor = carregarCanvasKit('completa');
      // se a carga falhar, a próxima chamada tenta de novo em vez de guardar a falha
      this.motor.catch(() => {
        this.motor = undefined;
      });
    }
    return this.motor;
  }

  async psd(
    doc: Documento,
    recursos: RecursosDaExportacao,
    opcoes: { nome: string; pranchetas: readonly string[]; arquivos: 'por-prancheta' | 'juntas' },
    entreEtapas: EntreEtapas,
  ): Promise<ArquivoGerado[]> {
    const { arquivos } = await exportarPsd(await this.carregar(), this.formato, doc, recursos, { nome: opcoes.nome, pranchetas: opcoes.pranchetas, arquivos: opcoes.arquivos, entreEtapas });
    return arquivos;
  }

  async png(
    doc: Documento,
    recursos: RecursosDaExportacao,
    opcoes: { nome: string; pranchetas: readonly string[]; escala: 1 | 2; semFundo: boolean },
    entreEtapas: EntreEtapas,
  ): Promise<ArquivoGerado[]> {
    const { arquivos } = await exportarPng(await this.carregar(), doc, recursos, { nome: opcoes.nome, pranchetas: opcoes.pranchetas, escala: opcoes.escala, semFundo: opcoes.semFundo, entreEtapas });
    return arquivos;
  }

  async svg(doc: Documento, recursos: RecursosDaExportacao, opcoes: OpcoesDoSvg, entreEtapas: EntreEtapas): Promise<ArquivoGerado[]> {
    const { arquivos } = await exportarVetorial(await this.carregar(), this.formatoSvg, doc, recursos, {
      nome: opcoes.nome,
      pranchetas: opcoes.pranchetas,
      escalaDaImagem: opcoes.escalaDaImagem ?? 2,
      entreEtapas,
    });
    return arquivos;
  }

  async pdf(doc: Documento, recursos: RecursosDaExportacao, opcoes: OpcoesDoPdf, entreEtapas: EntreEtapas): Promise<ArquivoGerado[]> {
    const { arquivos } = await exportarVetorial(await this.carregar(), this.formatoPdf, doc, recursos, {
      nome: opcoes.nome,
      pranchetas: opcoes.pranchetas,
      arquivos: opcoes.arquivos,
      escalaDaImagem: opcoes.escalaDaImagem ?? 2,
      entreEtapas,
    });
    return arquivos;
  }
}
