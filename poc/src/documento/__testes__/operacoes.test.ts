import { describe, expect, it } from 'vitest';
import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import { documentoVazio, type Documento, type NoVisual } from '../esquema';
import { aplicarLote } from '../operacoes';
import { verificarDocumento } from '../lint';
import type { Ctx } from '../../render/render';
import { FONTES } from '../../render/fontes';
import { fileURLToPath } from 'node:url';

for (const f of FONTES) GlobalFonts.registerFromPath(fileURLToPath(new URL(`../../../fontes/${f.arquivo}`, import.meta.url)), f.familia);
const meios = { criarCtx: (w: number, h: number) => createCanvas(w, h).getContext('2d') as unknown as Ctx, imagens: () => undefined };
const designer = { tipo: 'designer' } as const;

function base(): Documento {
  const r = aplicarLote(documentoVazio('teste'), [
    { op: 'definirToken', nome: 'primaria', valor: '#0F3B2C' },
    { op: 'criarPrancheta', nome: 'Feed', largura: 1080, altura: 1350, fundo: '#ffffff' },
    { op: 'criarNo', prancheta: 'Feed', no: { tipo: 'texto', nome: 'Título', x: 80, y: 80, largura: 900, altura: 200, conteudo: 'Promoção', fonte: 'Anton', tamanho: 120, cor: 'token:primaria' } },
  ], designer);
  if (!r.ok) throw new Error(r.erro.mensagem);
  return r.doc;
}

describe('aplicarLote', () => {
  it('aplica em transação: um erro no meio desfaz o lote inteiro', () => {
    const doc = base();
    const r = aplicarLote(doc, [
      { op: 'mover', alvo: 'Feed/Título', x: 10, y: 10 },
      { op: 'alterar', alvo: 'Feed/Inexistente', props: { tamanho: 10 } },
    ], designer);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro).toMatchObject({ indice: 1, op: 'alterar', alvo: 'Feed/Inexistente' });
    expect((doc.pranchetas[0]!.filhos[0] as NoVisual).x).toBe(80);
  });

  it('devolve o campo inválido para o agente corrigir', () => {
    const r = aplicarLote(base(), [{ op: 'alterar', alvo: 'Feed/Título', props: { tamanho: -3 } }], designer);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro.campo).toBe('tamanho');
  });

  it('recusa nome repetido na mesma prancheta', () => {
    const r = aplicarLote(base(), [{ op: 'criarNo', prancheta: 'Feed', no: { tipo: 'forma', forma: 'retangulo', nome: 'Título', x: 0, y: 0, largura: 10, altura: 10, preenchimento: '#000000' } }], designer);
    expect(r.ok).toBe(false);
  });

  it('camada bloqueada é intocável para o agente', () => {
    const t = aplicarLote(base(), [{ op: 'alterar', alvo: 'Feed/Título', props: { bloqueado: true } }], designer);
    if (!t.ok) throw new Error();
    const r = aplicarLote(t.doc, [{ op: 'mover', alvo: 'Feed/Título', x: 0, y: 0 }], { tipo: 'agente', tarefaId: 'x' });
    expect(r.ok).toBe(false);
  });

  it('duplica prancheta para outro formato mantendo camadas e tokens', () => {
    const r = aplicarLote(base(), [{ op: 'duplicarPrancheta', prancheta: 'Feed', nome: 'Story', largura: 1080, altura: 1920 }], designer);
    if (!r.ok) throw new Error(r.erro.mensagem);
    const story = r.doc.pranchetas[1]!;
    expect(story.filhos[0]).toMatchObject({ nome: 'Título', cor: 'token:primaria' });
    expect(story.filhos[0]!.id).not.toBe(r.doc.pranchetas[0]!.filhos[0]!.id);
  });
});

describe('verificar', () => {
  it('acusa texto transbordando e contraste baixo', () => {
    const r = aplicarLote(base(), [
      { op: 'criarNo', prancheta: 'Feed', no: { tipo: 'texto', nome: 'Legenda', x: 80, y: 1100, largura: 300, altura: 40, conteudo: 'um texto longo demais para caber nesta caixa pequena', fonte: 'IBM Plex Sans', tamanho: 32, cor: '#eeeeee' } },
    ], designer);
    if (!r.ok) throw new Error(r.erro.mensagem);
    const regras = verificarDocumento(r.doc, meios).map((a) => `${a.regra}:${a.camada}`);
    expect(regras).toContain('texto-transbordando:Legenda');
    expect(regras).toContain('contraste:Legenda');
    expect(regras).not.toContain('contraste:Título');
  });

  it('acusa texto de botão fora do centro vertical da forma', () => {
    const botao = (yTexto: number) => {
      const r = aplicarLote(base(), [
        { op: 'criarNo', prancheta: 'Feed', no: { tipo: 'forma', forma: 'retangulo', nome: 'Botão', x: 80, y: 1000, largura: 400, altura: 110, raio: 55, preenchimento: '#0F3B2C' } },
        { op: 'criarNo', prancheta: 'Feed', no: { tipo: 'texto', nome: 'Texto do botão', x: 80, y: yTexto, largura: 400, altura: 110, conteudo: 'Compre agora', fonte: 'IBM Plex Sans', peso: 700, tamanho: 36, alinhamento: 'centro', cor: '#ffffff' } },
      ], designer);
      if (!r.ok) throw new Error(r.erro.mensagem);
      return verificarDocumento(r.doc, meios).filter((a) => a.regra === 'texto-descentralizado');
    };
    expect(botao(1000)).toHaveLength(1);
    // centralizado pela altura da maiúscula: topo da caixa em 1031 põe "Compre agora" no meio do botão
    expect(botao(1031)).toHaveLength(0);
    // texto logo abaixo do botão, encostando nele, não é texto do botão
    expect(botao(1100)).toHaveLength(0);
  });

  it('acusa texto pequeno demais para a largura da prancheta', () => {
    const r = aplicarLote(base(), [
      { op: 'criarNo', prancheta: 'Feed', no: { tipo: 'texto', nome: 'Miúdo', x: 80, y: 1200, largura: 600, altura: 40, conteudo: 'rodapé', fonte: 'IBM Plex Sans', tamanho: 18, cor: '#0F3B2C' } },
    ], designer);
    if (!r.ok) throw new Error(r.erro.mensagem);
    const pequenos = verificarDocumento(r.doc, meios).filter((a) => a.regra === 'texto-pequeno').map((a) => a.camada);
    expect(pequenos).toEqual(['Miúdo']);
  });

  it('aceita degradê, sombra e traço, e null remove o efeito', () => {
    const r = aplicarLote(base(), [
      { op: 'criarNo', prancheta: 'Feed', no: { tipo: 'forma', forma: 'retangulo', nome: 'Película', x: 0, y: 600, largura: 1080, altura: 750, preenchimento: { tipo: 'linear', angulo: 90, paradas: [{ cor: 'token:primaria', posicao: 0, opacidade: 0.9 }, { cor: 'token:primaria', posicao: 1, opacidade: 0 }] }, sombra: { distancia: 10, desfoque: 30 }, traco: { cor: '#ffffff', espessura: 2 } } },
      { op: 'alterar', alvo: 'Feed/Película', props: { sombra: null } },
    ], designer);
    if (!r.ok) throw new Error(r.erro.mensagem);
    const pel = r.doc.pranchetas[0]!.filhos.find((n) => n.nome === 'Película') as NoVisual;
    expect(pel.sombra).toBeUndefined();
    expect(pel.tipo === 'forma' && pel.traco?.espessura).toBe(2);
    expect(verificarDocumento(r.doc, meios).filter((a) => a.regra === 'valor-solto')).toHaveLength(0);
  });

});

describe('enquadrar', () => {
  it('o ponto focal escolhe a parte da foto que aparece, sem sair da foto', async () => {
    const { enquadrar } = await import('../../render/render');
    // foto 2000×1000 numa caixa quadrada: sobra 1000 px de largura para escolher
    expect(enquadrar(2000, 1000, 0, 0, 500, 500, 'cobrir').sx).toBe(500);
    expect(enquadrar(2000, 1000, 0, 0, 500, 500, 'cobrir', { x: 0, y: 0.5 }).sx).toBe(0);
    expect(enquadrar(2000, 1000, 0, 0, 500, 500, 'cobrir', { x: 1, y: 0.5 }).sx).toBe(1000);
    const perto = enquadrar(2000, 1000, 0, 0, 500, 500, 'cobrir', { x: 0.5, y: 0.5 }, 2);
    expect(perto.sw).toBe(500);
    expect(perto.sy).toBe(250);
  });
});

describe('texto do cliente', () => {
  it('acusa palavra do briefing que sumiu da prancheta', async () => {
    const { conferirTextoDoCliente } = await import('../../servidor/agente');
    const r = aplicarLote(base(), [
      { op: 'criarNo', prancheta: 'Feed', no: { tipo: 'texto', nome: 'Subtítulo', x: 80, y: 400, largura: 900, altura: 60, conteudo: 'Com 20% menos peso.', fonte: 'IBM Plex Sans', tamanho: 36, cor: '#0F3B2C' } },
    ], designer);
    if (!r.ok) throw new Error(r.erro.mensagem);
    const problemas = conferirTextoDoCliente(r.doc, ['Nova linha Vento 2, com 20% menos peso', 'Promoção']);
    expect(problemas).toHaveLength(1);
    expect(problemas[0]).toContain('nova');
    expect(problemas[0]).toContain('(faltam: nova, linha, vento, 2)');
  });

  it('aceita o texto dividido em camadas e sem o separador', async () => {
    const { conferirTextoDoCliente } = await import('../../servidor/agente');
    const r = aplicarLote(base(), [
      { op: 'criarNo', prancheta: 'Feed', no: { tipo: 'texto', nome: 'Site', x: 80, y: 1200, largura: 400, altura: 40, conteudo: 'jazznapraca.com.br', fonte: 'IBM Plex Sans', tamanho: 26, cor: '#0F3B2C' } },
      { op: 'criarNo', prancheta: 'Feed', no: { tipo: 'texto', nome: 'Realização', x: 80, y: 1250, largura: 600, altura: 40, conteudo: 'Realização: Secretaria de Cultura', fonte: 'IBM Plex Sans', tamanho: 26, cor: '#0F3B2C' } },
    ], designer);
    if (!r.ok) throw new Error(r.erro.mensagem);
    expect(conferirTextoDoCliente(r.doc, ['jazznapraca.com.br · Realização: Secretaria de Cultura', 'Promoção'])).toHaveLength(0);
  });
});

describe('verificar: faixas do story e colado', () => {
  it('acusa faixa de baixo do story vazia e aceita quando a foto sangra', () => {
    const story = (alturaFoto: number) => {
      const r = aplicarLote(documentoVazio('s'), [
        { op: 'criarPrancheta', nome: 'Story', largura: 1080, altura: 1920, fundo: '#ffffff' },
        { op: 'criarNo', prancheta: 'Story', no: { tipo: 'forma', forma: 'retangulo', nome: 'Faixa', x: 0, y: 0, largura: 1080, altura: alturaFoto, preenchimento: '#0F3B2C' } },
      ], designer);
      if (!r.ok) throw new Error(r.erro.mensagem);
      return verificarDocumento(r.doc, meios).filter((a) => a.regra === 'faixa-vazia');
    };
    expect(story(1000)).toHaveLength(1);
    expect(story(1920)).toHaveLength(0);
  });

  it('acusa botão colado numa faixa grande', () => {
    const r = aplicarLote(base(), [
      { op: 'criarNo', prancheta: 'Feed', no: { tipo: 'forma', forma: 'retangulo', nome: 'Botão', x: 80, y: 900, largura: 400, altura: 90, raio: 45, preenchimento: '#F4C430' } },
      { op: 'criarNo', prancheta: 'Feed', no: { tipo: 'forma', forma: 'retangulo', nome: 'Faixa', x: 0, y: 996, largura: 1080, altura: 354, preenchimento: '#0F3B2C' } },
    ], designer);
    if (!r.ok) throw new Error(r.erro.mensagem);
    expect(verificarDocumento(r.doc, meios).some((a) => a.regra === 'ritmo' && a.camada === 'Botão')).toBe(true);
  });
});
