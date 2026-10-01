// A ponte entre a sessão do documento e o catálogo de @otto/documento.
import { describe, expect, it } from 'vitest';
import { montarDocumentoDeExemplo } from '../bancada/documentoDeExemplo';
import { aplicadorDoCatalogo } from './catalogo';

const doc = montarDocumentoDeExemplo({ hash: 'a'.repeat(64), largura: 1200, altura: 800 });
const feed = doc.pranchetas[0];
const camada = feed?.filhos[0];
if (!feed || !camada) throw new Error('o documento de exemplo precisa de uma prancheta com camada');

describe('aplicador do catálogo', () => {
  const aplicar = aplicadorDoCatalogo(() => undefined);

  it('aplica o lote e diz o que foi tocado', () => {
    const r = aplicar(doc, [{ op: 'mover', alvo: camada.id, x: 300, y: 400 }], 'lote-1');
    expect(r).toMatchObject({ ok: true, tocados: [camada.id] });
  });

  it('o que o lote não tocou continua sendo o mesmo objeto: é disso que o cache do motor depende', () => {
    const r = aplicar(doc, [{ op: 'mover', alvo: camada.id, x: 300, y: 400 }], 'lote-1');
    if (!r.ok) throw new Error(r.motivo);

    expect(r.doc.pranchetas[0]).not.toBe(doc.pranchetas[0]);
    expect(r.doc.pranchetas[1]).toBe(doc.pranchetas[1]);
    expect(r.doc.pranchetas[0]?.filhos[1]).toBe(doc.pranchetas[0]?.filhos[1]);
  });

  it('lote inválido devolve o motivo, sem lançar', () => {
    const r = aplicar(doc, [{ op: 'mover', alvo: 'nao-existe', x: 0, y: 0 }], 'lote-1');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toContain('nao-existe');
  });

  it('nó criado pelo mesmo lote ganha o mesmo id nas duas aplicações', () => {
    const criar = [{ op: 'criarNo', prancheta: feed.id, no: { tipo: 'forma', nome: 'Nova', forma: 'retangulo', x: 0, y: 0, largura: 10, altura: 10, preenchimento: '#000000' } }];
    const a = aplicar(doc, criar, 'lote-9');
    const b = aplicar(doc, criar, 'lote-9');
    const c = aplicar(doc, criar, 'outro-lote');
    if (!a.ok || !b.ok || !c.ok) throw new Error('o lote devia aplicar');

    expect(a.tocados).toEqual(b.tocados);
    expect(a.tocados).not.toEqual(c.tocados);
  });

  it('usa o medidor do motor quando ele já existe: alinhar mede pela tinta', () => {
    let medicoes = 0;
    const comMedidor = aplicadorDoCatalogo(() => ({
      tinta: (no) => {
        medicoes++;
        return 'x' in no ? { x: no.x, y: no.y, w: no.largura, h: no.altura } : { x: 0, y: 0, w: 0, h: 0 };
      },
    }));
    const r = comMedidor(doc, [{ op: 'alinhar', alvos: [camada.id], borda: 'esquerda', valor: 40 }], 'lote-2');

    expect(r.ok).toBe(true);
    expect(medicoes).toBeGreaterThan(0);
  });
});
