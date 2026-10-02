// Enviar imagem e SVG e pô-los no documento. O arquivo vai à API (POST /api/arquivos ou
// /api/vetores) e a camada nasce por operação do catálogo: `criarNo`, ou `alterar` quando é troca
// da imagem de uma camada de foto. Estados e recusas: docs/mvp/experiencia.md, seções 3.3 e 3.4.
import type { Documento, No } from '@otto/documento';
import { type ImagemTrazida, type TexturaTrazida, TIPOS_DE_IMAGEM } from '@otto/shared';
import type { EnvioDeArquivos } from '../api/arquivos';
import { editor as textos } from '../textos/editor';
import type { OndeSoltou } from './canvas/AreaDoCanvas';
import { type LoteParaAplicar, loteDeInserirImagem, loteDeInserirTextura, loteDeInserirVetor, loteDeTrocarImagem } from './nucleo/acoes';
import type { Armazem } from './nucleo/armazem';

/** O limite da API é 25 MB por arquivo; conferir aqui poupa o envio de um arquivo que será recusado. */
const LIMITE_EM_MB = 25;

/** Aviso flutuante do editor. `nota` não é erro: é o que o importador deixou de fora, por exemplo. */
export interface Aviso {
  texto: string;
  tom: 'erro' | 'nota';
}

const ehSvg = (arquivo: File): boolean => arquivo.type === 'image/svg+xml' || /\.svg$/i.test(arquivo.name);
const ehImagem = (arquivo: File): boolean => (TIPOS_DE_IMAGEM as readonly string[]).includes(arquivo.type);

/** A frase da tela para uma recusa da API (o código é dela; a frase, nossa). */
export function fraseDoEnvio(arquivo: string, codigo: string, detalhe: Record<string, unknown> | undefined): string {
  const e = textos.envio;
  switch (codigo) {
    case 'arquivo_grande_demais':
    case 'corpo_grande_demais':
      return e.grandeDemais(arquivo, typeof detalhe?.limiteEmBytes === 'number' ? Math.floor(detalhe.limiteEmBytes / (1024 * 1024)) : LIMITE_EM_MB);
    case 'tipo_nao_aceito':
      return e.tipoNaoAceito(arquivo);
    case 'imagem_grande_demais':
      return e.imagemGrandeDemais(arquivo, typeof detalhe?.ladoMaximo === 'number' ? detalhe.ladoMaximo : 12000);
    case 'imagem_ilegivel':
      return e.ilegivel(arquivo);
    case 'svg_invalido':
      return detalhe?.motivo === 'sem_formas' ? e.svgSemFormas(arquivo) : e.svgInvalido(arquivo);
    default:
      return e.naoEnviou(arquivo);
  }
}

export interface DependenciasDoEnvio {
  arquivos(): EnvioDeArquivos | undefined;
  documento(): Documento | undefined;
  /** A prancheta que recebe o arquivo quando ele não foi solto sobre nenhuma. */
  pranchetaPadrao(): string | undefined;
  aplicar(lote: LoteParaAplicar): boolean;
  /** Seleciona as camadas recém-criadas, pelo nome. */
  selecionarPorNome(nomes: string[]): void;
  aviso: Pick<Armazem<Aviso | null>, 'definir'>;
  /** Os nomes dos arquivos em envio agora. */
  enviando: Armazem<readonly string[]>;
}

export function criarEnvio(deps: DependenciasDoEnvio) {
  const comecar = (nome: string) => deps.enviando.definir((lista) => [...lista, nome]);
  const terminar = (nome: string) =>
    deps.enviando.definir((lista) => {
      const i = lista.indexOf(nome);
      return i < 0 ? lista : [...lista.slice(0, i), ...lista.slice(i + 1)];
    });
  /** Recusas e notas de um envio saem juntas, num aviso só. */
  const avisar = (erros: string[], notas: string[]) => {
    if (erros.length > 0) deps.aviso.definir({ texto: [...erros, ...notas].join(' '), tom: 'erro' });
    else if (notas.length > 0) deps.aviso.definir({ texto: notas.join(' '), tom: 'nota' });
  };

  /** Confere tipo e tamanho antes de enviar. Devolve a recusa, ou nada se o arquivo pode ir. */
  const recusaLocal = (arquivo: File, aceitaSvg: boolean): string | undefined => {
    if (!(ehImagem(arquivo) || (aceitaSvg && ehSvg(arquivo)))) return textos.envio.tipoNaoAceito(arquivo.name);
    if (arquivo.size > LIMITE_EM_MB * 1024 * 1024) return textos.envio.grandeDemais(arquivo.name, LIMITE_EM_MB);
    return undefined;
  };

  return {
    /** Envia cada arquivo e cria uma camada para cada um. Um arquivo recusado não impede os outros. */
    async inserir(lista: File[], onde?: OndeSoltou): Promise<void> {
      const api = deps.arquivos();
      if (!api) return;
      const erros: string[] = [];
      const notas: string[] = [];
      const criadas: string[] = [];
      for (const arquivo of lista) {
        const recusa = recusaLocal(arquivo, true);
        if (recusa) {
          erros.push(recusa);
          continue;
        }
        comecar(arquivo.name);
        const resultado = ehSvg(arquivo) ? await api.importarSvg(arquivo) : await api.enviarImagem(arquivo);
        terminar(arquivo.name);
        if (!resultado.ok) {
          erros.push(fraseDoEnvio(arquivo.name, resultado.codigo, resultado.detalhe));
          continue;
        }
        const doc = deps.documento();
        if (!doc) return;
        const prancheta = onde?.pranchetaId ?? deps.pranchetaPadrao();
        const ponto = onde?.pranchetaId ? { x: onde.x, y: onde.y } : undefined;
        const lote = 'arquivo' in resultado ? loteDeInserirImagem(doc, prancheta, resultado.arquivo, arquivo.name, ponto) : loteDeInserirVetor(doc, prancheta, resultado.no, arquivo.name, ponto);
        if (!deps.aplicar(lote)) continue;
        const criado = lote.operacoes.at(-1);
        if (criado?.op === 'criarNo') criadas.push((criado.no as { nome: string }).nome);
        if ('avisos' in resultado && resultado.avisos.length > 0) notas.push(textos.envio.importadoComAvisos(arquivo.name, resultado.avisos.join('; ')));
      }
      if (criadas.length > 0) deps.selecionarPorNome(criadas);
      avisar(erros, notas);
    },

    /**
     * A imagem trazida do banco já é arquivo da conta: vira camada com a origem (banco, autor e licença)
     * no nó, que é o que o relatório de exportação lista (ADR 032). O endereço do banco nunca entra.
     */
    inserirDoBanco(imagem: ImagemTrazida, nome: string): boolean {
      const doc = deps.documento();
      if (!doc) return false;
      const lote = loteDeInserirImagem(doc, deps.pranchetaPadrao(), { sha256: imagem.sha256, largura: imagem.largura, altura: imagem.altura, origem: imagem.no.origem }, nome);
      if (!deps.aplicar(lote)) return false;
      const criado = lote.operacoes.at(-1);
      if (criado?.op === 'criarNo') deps.selecionarPorNome([(criado.no as { nome: string }).nome]);
      return true;
    },

    /** A textura já é arquivo da conta: vira camada por cima de tudo, cobrindo a prancheta. */
    inserirTextura(textura: TexturaTrazida, nome: string): boolean {
      const doc = deps.documento();
      if (!doc) return false;
      const lote = loteDeInserirTextura(doc, deps.pranchetaPadrao(), textura, nome);
      if (!deps.aplicar(lote)) return false;
      const criado = lote.operacoes.at(-1);
      if (criado?.op === 'criarNo') deps.selecionarPorNome([(criado.no as { nome: string }).nome]);
      return true;
    },

    /** Envia a imagem e troca o arquivo da camada de foto. A caixa e o enquadramento ficam. */
    async trocarImagem(no: Pick<No, 'id' | 'nome'>, arquivo: File): Promise<void> {
      const api = deps.arquivos();
      if (!api) return;
      const recusa = recusaLocal(arquivo, false);
      if (recusa) return avisar([recusa], []);
      comecar(arquivo.name);
      const resultado = await api.enviarImagem(arquivo);
      terminar(arquivo.name);
      if (!resultado.ok) return avisar([fraseDoEnvio(arquivo.name, resultado.codigo, resultado.detalhe)], []);
      deps.aplicar(loteDeTrocarImagem(no, resultado.arquivo));
    },
  };
}
