import { describe, expect, it } from 'vitest';
import { createCanvas } from '@napi-rs/canvas';
import { documentoVazio, type Documento } from '../esquema';
import { aplicarLote } from '../operacoes';
import { verificarDocumento } from '../lint';
import type { Ctx } from '../../render/render';

const meios = { criarCtx: (w: number, h: number) => createCanvas(w, h).getContext('2d') as unknown as Ctx, imagens: () => undefined };
const designer = { tipo: 'designer' } as const;

function doc(ops: unknown[]): Documento {
  const r = aplicarLote(documentoVazio('t'), [{ op: 'criarPrancheta', nome: 'Feed', largura: 1080, altura: 1350, fundo: '#0037a6' }, ...ops], designer);
  if (!r.ok) throw new Error(r.erro.mensagem);
  return r.doc;
}
const invisiveis = (d: Documento) => verificarDocumento(d, meios).filter((a) => a.regra === 'camada-invisivel');

describe('verificar: camada que não aparece', () => {
  it('acusa camada coberta por outra e diz qual cobre', () => {
    const d = doc([
      { op: 'criarNo', prancheta: 'Feed', no: { tipo: 'forma', nome: 'Produto', forma: 'retangulo', x: 300, y: 400, largura: 300, altura: 400, preenchimento: '#ff0000' } },
      { op: 'criarNo', prancheta: 'Feed', no: { tipo: 'forma', nome: 'Gota', forma: 'elipse', x: 200, y: 300, largura: 600, altura: 700, preenchimento: '#306dd8' } },
    ]);
    const [a] = invisiveis(d);
    expect(a?.camada).toBe('Produto');
    expect(a?.mensagem).toContain('Gota');
  });

  it('acusa logo da mesma cor do fundo', () => {
    const d = doc([{ op: 'criarNo', prancheta: 'Feed', no: { tipo: 'vetor', nome: 'Logo', x: 300, y: 100, largura: 400, altura: 200, moldura: [2, 1], caminhos: [{ d: 'M0 0C0 0 2 0 2 0C2 0 2 1 2 1C2 1 0 1 0 1Z', preenchimento: '#0037a6' }] } }]);
    const [a] = invisiveis(d);
    expect(a?.camada).toBe('Logo');
    expect(a?.mensagem).toContain('cor');
  });

  it('não acusa o que aparece, nem um fio fino', () => {
    const d = doc([
      { op: 'criarNo', prancheta: 'Feed', no: { tipo: 'forma', nome: 'Gota', forma: 'elipse', x: 200, y: 300, largura: 600, altura: 700, preenchimento: '#306dd8' } },
      { op: 'criarNo', prancheta: 'Feed', no: { tipo: 'forma', nome: 'Fio', forma: 'retangulo', x: 72, y: 1268, largura: 64, altura: 3, preenchimento: '#ffffff' } },
    ]);
    expect(invisiveis(d)).toEqual([]);
  });
});
