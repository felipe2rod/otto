// O relatório de importação como a tela o mostra. As linhas dos exemplos são as que o servidor devolveu
// para arquivos de fora do Otto (packages/psd/recursos-de-teste/psd-de-fora), em 2026-10-02.
import type { RelatorioDeImportacao } from '@otto/shared';
import { describe, expect, it } from 'vitest';
import { editor } from '../textos/editor';
import { importar } from '../textos/importar';
import { lerRelatorioDeImportacao } from './relatorio';

const t = importar.relatorio;
/** O nome da fonte como o resto do editor o escreve (o peso com o nome e o número). */
const ANTON = `Anton ${editor.propriedades.nomeDoPeso(400, editor.propriedades.pesos[400])}`;
const ARQUIVO = { formato: 'psd' as const, largura: 200, altura: 200, camadas: 2, conversaoDeCor: 'srgb' as const };
const base = (extra: Partial<RelatorioDeImportacao>): RelatorioDeImportacao => ({ arquivo: ARQUIVO, camadas: [], fontes: [], substituicoes: [], emFalta: { fontes: [] }, avisos: [], ...extra });

const FUNDO = { prancheta: 'Large', camada: 'Background', idDoNo: 'n-fundo', tipo: 'imagem', destino: 'imagem' as const, mapeamento: 'psd:camada-de-pixels', observacao: 'camada de pixels' };
const TEXTO_SEM_FONTE = {
  prancheta: 'Large',
  camada: '1 2',
  idDoNo: 'n-texto',
  tipo: 'imagem',
  destino: 'imagem' as const,
  mapeamento: 'psd:texto-sem-fonte',
  observacao: 'texto que veio como imagem: o Otto não tem a fonte "ArialMT"',
  perdas: [{ mapeamento: 'psd:paragrafo-de-texto', detalhe: 'espaço antes ou depois do parágrafo' }],
};

describe('relatório de importação na tela', () => {
  it('camada de pixels que veio como imagem não é perda: só conta como "virou imagem" o que tinha edição no arquivo', () => {
    const r = lerRelatorioDeImportacao(base({ camadas: [FUNDO, TEXTO_SEM_FONTE], emFalta: { fontes: [{ postScript: 'ArialMT', camadas: ['Large / 1 2'] }] } }));
    expect(r.virouImagem).toEqual([{ onde: 'Large / 1 2', motivo: t.virouImagem.fonteEmFalta('ArialMT'), idDoNo: 'n-texto' }]);
    expect(r.idsQueViraramImagem).toEqual(['n-texto']);
    expect(r.resumo).toBe(t.resumo(0, 1, 0));
    // a tabela inteira diz o que cada uma era
    expect(r.camadas).toEqual([
      { onde: 'Large / Background', como: t.todas.jaEraImagem },
      { onde: 'Large / 1 2', como: t.todas.destinos.imagem },
    ]);
  });

  it('o motivo de virar imagem vem do mapeamento, com a frase da tela; mapeamento desconhecido cai na frase genérica, nunca na do servidor', () => {
    const deformado = { ...TEXTO_SEM_FONTE, mapeamento: 'psd:texto-deformado', observacao: 'texto com texto deformado (arc); sublinhado: veio como imagem', perdas: undefined };
    const novo = { ...TEXTO_SEM_FONTE, camada: 'Outra', idDoNo: 'n-2', mapeamento: 'psd:recurso-de-amanha', observacao: 'frase do servidor', perdas: undefined };
    const r = lerRelatorioDeImportacao(base({ camadas: [deformado, novo] }));
    expect(r.virouImagem.map((v) => v.motivo)).toEqual([t.virouImagem.motivos['texto-deformado'], t.virouImagem.generico]);
    expect(JSON.stringify(r)).not.toContain('frase do servidor');
    expect(JSON.stringify(r)).not.toContain('(arc)');
  });

  it('o que ficou de fora e o que veio com diferença têm lista própria, com a frase da tela', () => {
    const ajuste = { prancheta: 'Feed', camada: 'Inverter 1', destino: 'ignorado' as const, mapeamento: 'psd:ajuste-desconhecido', observacao: 'x' };
    const editavel = {
      prancheta: 'Feed',
      camada: 'Título',
      idDoNo: 'n-t',
      tipo: 'texto',
      destino: 'editavel' as const,
      mapeamento: 'no:texto',
      perdas: [
        { mapeamento: 'psd:paragrafo-de-texto', detalhe: 'recuo' },
        { mapeamento: 'psd:coisa-nova', detalhe: 'y' },
      ],
    };
    const r = lerRelatorioDeImportacao(base({ camadas: [ajuste, editavel] }));
    expect(r.deFora).toEqual([{ onde: 'Feed / Inverter 1', motivo: t.deFora.motivos['ajuste-desconhecido'] }]);
    expect(r.aproximado).toEqual([{ onde: 'Feed / Título', oQue: t.aproximado.semItem([t.aproximado.perdas['paragrafo-de-texto'], t.aproximado.generico].join('; ')), idDoNo: 'n-t' }]);
    expect(r.resumo).toBe(t.resumo(1, 0, 1));
    expect(r.idsQueViraramImagem).toEqual([]);
  });

  it('fonte trocada a pedido aparece com a pedida e a usada; fonte que faltou diz em que camadas o texto virou imagem', () => {
    const r = lerRelatorioDeImportacao(
      base({
        substituicoes: [{ camada: 'Large / 1 2', pedida: 'ArialMT', usada: { familia: 'Anton', peso: 400, postScript: 'Anton-Regular' } }],
        emFalta: { fontes: [{ postScript: 'Calibri', camadas: ['Feed / some text', 'Feed / outro'] }] },
        fontes: [{ familia: 'Anton', peso: 400, postScript: 'Anton-Regular' }],
      }),
    );
    expect(r.trocas).toEqual([t.fontes.troca('Large / 1 2', 'ArialMT', ANTON)]);
    expect(r.faltaram).toEqual([t.fontes.faltou('Calibri', 'Feed / some text, Feed / outro')]);
    expect(r.fontesUsadas).toEqual([ANTON]);
  });

  it('os avisos gerais viram observações pela frase do código; os que já têm lista própria não se repetem; código novo é ignorado', () => {
    const r = lerRelatorioDeImportacao(
      base({
        avisos: [
          { codigo: 'sem-perfil-de-cor', texto: 'do servidor 1' },
          { codigo: 'virou-imagem', texto: 'do servidor 2' },
          { codigo: 'fonte-em-falta', texto: 'do servidor 3' },
          { codigo: 'aparencia-pode-diferir', texto: 'confira com o Photoshop' },
          { codigo: 'conferir-texto', texto: 'do servidor 4' },
          { codigo: 'codigo-de-amanha', texto: 'do servidor 5' },
        ],
      }),
    );
    expect(r.observacoes).toEqual([t.observacoes.doCodigo['sem-perfil-de-cor'], t.observacoes.doCodigo['conferir-texto']]);
    expect(JSON.stringify(r)).not.toMatch(/do servidor|Photoshop/);
  });

  it('camada que mudou de nome no Otto aparece com os dois nomes; tudo editável diz que nada se perdeu', () => {
    const r = lerRelatorioDeImportacao(base({ camadas: [{ prancheta: 'Feed', camada: 'Layer 1', nomeNoOtto: 'Layer 1 2', idDoNo: 'n', tipo: 'forma', destino: 'editavel', mapeamento: 'no:forma' }] }));
    expect(r.camadas[0]?.onde).toBe(t.onde('Feed', t.nomeTrocado('Layer 1', 'Layer 1 2')));
    expect(r.semPerdas).toBe(true);
    expect(lerRelatorioDeImportacao(base({ camadas: [FUNDO] })).semPerdas).toBe(true);
    expect(lerRelatorioDeImportacao(base({ camadas: [TEXTO_SEM_FONTE] })).semPerdas).toBe(false);
  });
});
