// O relatório de importação como a tela o mostra. Função pura: recebe o relatório da API e devolve só o
// que vai aparecer, já com as frases de textos/. As frases que vêm de @otto/psd (`avisos[].texto`,
// `camadas[].observacao`, `perdas[].detalhe`) ficam de fora de propósito: não passaram pelo guardião da
// marca e citam o programa de origem. A frase é escolhida pelo código do aviso e pelo mapeamento da linha.
import type { RelatorioDeImportacao } from '@otto/shared';
import { editor } from '../textos/editor';
import { importar } from '../textos/importar';

const t = importar.relatorio;

export interface RelatorioDeImportacaoNaTela {
  resumo: string;
  /** Nada virou imagem (fora o que já era imagem no arquivo), nada ficou de fora e nada veio com diferença. */
  semPerdas: boolean;
  /** O que tinha edição no arquivo e veio como imagem. `idDoNo` leva à camada. */
  virouImagem: { onde: string; motivo: string; idDoNo?: string }[];
  deFora: { onde: string; motivo: string }[];
  /** O que veio, sem um parâmetro que tinha. */
  aproximado: { onde: string; oQue: string; idDoNo?: string }[];
  trocas: string[];
  faltaram: string[];
  fontesUsadas: string[];
  observacoes: string[];
  camadas: { onde: string; como: string }[];
  /** Os nós que viraram imagem, para o painel de Camadas apontar. */
  idsQueViraramImagem: string[];
}

type Linha = RelatorioDeImportacao['camadas'][number];
/** Camada que JÁ era imagem no arquivo: vir como imagem é o que ela é, não uma perda. */
const JA_ERA_IMAGEM: ReadonlySet<string> = new Set(['psd:camada-de-pixels', 'psd:arquivo-achatado']);
const chave = (mapeamento: string): string => mapeamento.replace(/^psd:/, '');
const onde = (linha: Linha): string => t.onde(linha.prancheta, linha.nomeNoOtto && linha.nomeNoOtto !== linha.camada ? t.nomeTrocado(linha.camada, linha.nomeNoOtto) : linha.camada);
const nomeDaFonte = (familia: string, peso: number): string => `${familia} ${editor.propriedades.nomeDoPeso(peso, editor.propriedades.pesos[peso])}`;
const virouImagem = (linha: Linha): boolean => linha.destino === 'imagem' && !JA_ERA_IMAGEM.has(linha.mapeamento);

export function lerRelatorioDeImportacao(relatorio: RelatorioDeImportacao): RelatorioDeImportacaoNaTela {
  // a fonte que faltou em cada camada: o relatório as cita como "prancheta / camada"
  const fonteQueFaltou = new Map<string, string>();
  for (const f of relatorio.emFalta.fontes) for (const camada of f.camadas) fonteQueFaltou.set(camada, f.postScript);

  const imagens = relatorio.camadas.filter(virouImagem);
  const fora = relatorio.camadas.filter((c) => c.destino === 'ignorado');
  const comDiferenca = relatorio.camadas.filter((c) => c.destino !== 'ignorado' && (c.perdas?.length ?? 0) > 0 && !virouImagem(c));

  return {
    resumo: t.resumo(relatorio.camadas.filter((c) => c.destino === 'editavel').length, imagens.length, fora.length),
    semPerdas: imagens.length === 0 && fora.length === 0 && comDiferenca.length === 0,
    virouImagem: imagens.map((c) => {
      const fonte = c.mapeamento === 'psd:texto-sem-fonte' ? fonteQueFaltou.get(`${c.prancheta} / ${c.camada}`) : undefined;
      const motivo = fonte ? t.virouImagem.fonteEmFalta(fonte) : (t.virouImagem.motivos[chave(c.mapeamento)] ?? t.virouImagem.generico);
      return { onde: onde(c), motivo, ...(c.idDoNo ? { idDoNo: c.idDoNo } : {}) };
    }),
    deFora: fora.map((c) => ({ onde: onde(c), motivo: t.deFora.motivos[chave(c.mapeamento)] ?? t.deFora.generico })),
    aproximado: comDiferenca.map((c) => ({
      onde: onde(c),
      oQue: t.aproximado.semItem([...new Set((c.perdas ?? []).map((p) => t.aproximado.perdas[chave(p.mapeamento)] ?? t.aproximado.generico))].join('; ')),
      ...(c.idDoNo ? { idDoNo: c.idDoNo } : {}),
    })),
    trocas: relatorio.substituicoes.map((s) => t.fontes.troca(s.camada, s.pedida, nomeDaFonte(s.usada.familia, s.usada.peso))),
    faltaram: relatorio.emFalta.fontes.map((f) => t.fontes.faltou(f.postScript, f.camadas.join(', '))),
    fontesUsadas: relatorio.fontes.map((f) => nomeDaFonte(f.familia, f.peso)),
    // "virou imagem", "ficou de fora", "fonte em falta", "fonte trocada" e "aparência pode diferir" já têm lista própria acima
    observacoes: relatorio.avisos.flatMap((a) => t.observacoes.doCodigo[a.codigo] ?? []),
    camadas: relatorio.camadas.map((c) => ({ onde: onde(c), como: c.destino === 'imagem' && JA_ERA_IMAGEM.has(c.mapeamento) ? t.todas.jaEraImagem : (t.todas.destinos[c.destino] ?? c.destino) })),
    idsQueViraramImagem: imagens.flatMap((c) => c.idDoNo ?? []),
  };
}
