// Atalhos do editor (docs/mvp/experiencia.md, seção 4.3). Só os que já têm o que fazer na fatia 0.
import { describe, expect, it } from 'vitest';
import { type Contexto, resolverAtalho, type Tecla } from './atalhos';

const tecla = (parcial: Partial<Tecla> & { key: string }): Tecla => ({ code: '', ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...parcial });
const noCanvas: Contexto = { emCampoDeTexto: false, focoNoCanvas: true };
const emPainel: Contexto = { emCampoDeTexto: false, focoNoCanvas: false };
const emCampo: Contexto = { emCampoDeTexto: true, focoNoCanvas: false };

describe('atalhos', () => {
  it.each([
    ['v', 'mover'],
    ['V', 'mover'],
    ['h', 'mao'],
    ['z', 'zoom'],
  ] as const)('%s escolhe a ferramenta %s', (key, ferramenta) => {
    expect(resolverAtalho(tecla({ key }), noCanvas)).toEqual({ tipo: 'ferramenta', ferramenta });
  });

  it('Ctrl+0 enquadra tudo, Shift+1 também, Ctrl+1 vai para 100%', () => {
    expect(resolverAtalho(tecla({ key: '0', ctrlKey: true }), noCanvas)).toEqual({ tipo: 'enquadrar' });
    expect(resolverAtalho(tecla({ key: '!', code: 'Digit1', shiftKey: true }), noCanvas)).toEqual({ tipo: 'enquadrar' });
    expect(resolverAtalho(tecla({ key: '1', ctrlKey: true }), noCanvas)).toEqual({ tipo: 'zoom-em-cem' });
  });

  it('Ctrl++ e Ctrl+− dão zoom; no Mac vale a tecla de comando', () => {
    expect(resolverAtalho(tecla({ key: '+', ctrlKey: true }), noCanvas)).toEqual({ tipo: 'zoom', sentido: 1 });
    expect(resolverAtalho(tecla({ key: '=', ctrlKey: true }), noCanvas)).toEqual({ tipo: 'zoom', sentido: 1 });
    expect(resolverAtalho(tecla({ key: '-', metaKey: true }), noCanvas)).toEqual({ tipo: 'zoom', sentido: -1 });
  });

  it('Tab esconde e mostra os painéis só com o foco no canvas: dentro de painel, Tab continua navegando', () => {
    expect(resolverAtalho(tecla({ key: 'Tab' }), noCanvas)).toEqual({ tipo: 'alternar-paineis' });
    expect(resolverAtalho(tecla({ key: 'Tab' }), emPainel)).toBeNull();
    expect(resolverAtalho(tecla({ key: 'Tab', shiftKey: true }), noCanvas)).toBeNull();
  });

  it('tecla do Photoshop sem ferramenta aqui não faz nada, mas fica registrável pelo nome', () => {
    expect(resolverAtalho(tecla({ key: 't' }), noCanvas)).toEqual({ tipo: 'sem-ferramenta', tecla: 'T' });
    expect(resolverAtalho(tecla({ key: 'b' }), noCanvas)).toEqual({ tipo: 'sem-ferramenta', tecla: 'B' });
  });

  it('Ctrl+Z desfaz e Ctrl+Shift+Z refaz, de qualquer lugar fora de campo de texto', () => {
    expect(resolverAtalho(tecla({ key: 'z', ctrlKey: true }), emPainel)).toEqual({ tipo: 'desfazer' });
    expect(resolverAtalho(tecla({ key: 'Z', ctrlKey: true, shiftKey: true }), noCanvas)).toEqual({ tipo: 'refazer' });
    expect(resolverAtalho(tecla({ key: 'z', metaKey: true }), noCanvas)).toEqual({ tipo: 'desfazer' });
  });

  it('setas movem 1 unidade e Shift+setas 10, só com o foco no canvas (na árvore de camadas, seta navega)', () => {
    expect(resolverAtalho(tecla({ key: 'ArrowLeft' }), noCanvas)).toEqual({ tipo: 'mover', dx: -1, dy: 0 });
    expect(resolverAtalho(tecla({ key: 'ArrowDown' }), noCanvas)).toEqual({ tipo: 'mover', dx: 0, dy: 1 });
    expect(resolverAtalho(tecla({ key: 'ArrowUp', shiftKey: true }), noCanvas)).toEqual({ tipo: 'mover', dx: 0, dy: -10 });
    expect(resolverAtalho(tecla({ key: 'ArrowRight' }), emPainel)).toBeNull();
  });

  it('Delete e Backspace removem a camada selecionada', () => {
    expect(resolverAtalho(tecla({ key: 'Delete' }), noCanvas)).toEqual({ tipo: 'remover' });
    expect(resolverAtalho(tecla({ key: 'Backspace' }), emPainel)).toEqual({ tipo: 'remover' });
  });

  it('Ctrl+J duplica a camada', () => {
    expect(resolverAtalho(tecla({ key: 'j', ctrlKey: true }), noCanvas)).toEqual({ tipo: 'duplicar' });
    expect(resolverAtalho(tecla({ key: 'j' }), noCanvas)).toBeNull();
  });

  it('Ctrl+G agrupa e Ctrl+Shift+G desagrupa', () => {
    expect(resolverAtalho(tecla({ key: 'g', ctrlKey: true }), noCanvas)).toEqual({ tipo: 'agrupar' });
    expect(resolverAtalho(tecla({ key: 'G', ctrlKey: true, shiftKey: true }), noCanvas)).toEqual({ tipo: 'desagrupar' });
  });

  it('Enter, com o foco no canvas, edita o texto da camada selecionada', () => {
    expect(resolverAtalho(tecla({ key: 'Enter' }), noCanvas)).toEqual({ tipo: 'editar-texto' });
    expect(resolverAtalho(tecla({ key: 'Enter' }), { emCampoDeTexto: false, focoNoCanvas: false })).toBeNull();
  });

  it('Ctrl+] traz para a frente e Ctrl+[ envia para trás, um passo', () => {
    expect(resolverAtalho(tecla({ key: ']', ctrlKey: true }), noCanvas)).toEqual({ tipo: 'reordenar', sentido: 1 });
    expect(resolverAtalho(tecla({ key: '[', ctrlKey: true }), noCanvas)).toEqual({ tipo: 'reordenar', sentido: -1 });
  });

  it('nenhum atalho vale com o foco em campo de texto', () => {
    for (const key of ['v', 'h', 'z', 't', 'Tab', 'Delete', 'ArrowLeft']) expect(resolverAtalho(tecla({ key }), emCampo)).toBeNull();
    expect(resolverAtalho(tecla({ key: 'z', ctrlKey: true }), emCampo)).toBeNull();
    expect(resolverAtalho(tecla({ key: '0', ctrlKey: true }), emCampo)).toBeNull();
  });

  it('tecla sem atalho devolve nulo', () => {
    expect(resolverAtalho(tecla({ key: 'q' }), noCanvas)).toBeNull();
  });
});
