import { aplicarLote, type Documento } from '@otto/documento';
import { describe, expect, it } from 'vitest';
import { idDe, pecaDoDesigner } from './apoio-de-teste';
import type { Plano } from './contrato';
import { criarGuarda } from './guarda';

const plano = (p: Partial<Plano>): Plano => ({ resumo: '', criar: [], alterar: [], remover: [], pontual: false, ...p });

/** Simula o lote como o ciclo faz e pergunta à guarda. */
function tentar(guarda: ReturnType<typeof criarGuarda>, doc: Documento, operacoes: unknown[], lote = 'lote-do-agente') {
  const r = aplicarLote(doc, operacoes, { autoria: { tipo: 'agente', tarefaId: 't' }, idDoLote: lote });
  if (!r.ok) throw new Error(`o lote do teste é inválido: ${r.erro.mensagem}`);
  const veredito = guarda.conferir(doc, r.doc);
  if (veredito.ok) guarda.registrar(doc, r.doc);
  return { veredito, doc: veredito.ok ? r.doc : doc };
}

const novoFormato = { op: 'criarPrancheta', nome: 'Banner', largura: 1200, altura: 628, fundo: '#ffffff' };

describe('guarda do plano: criar peça em documento que já tem trabalho do designer', () => {
  const inicial = pecaDoDesigner();
  const licenca = plano({ criar: [{ nome: 'Banner', largura: 1200, altura: 628 }] });

  it('deixa criar a prancheta do plano e trabalhar dentro dela, inclusive remover o que a própria tarefa criou', () => {
    const g = criarGuarda(licenca, inicial);
    const a = tentar(g, inicial, [
      novoFormato,
      { op: 'criarNo', prancheta: 'Banner', no: { tipo: 'forma', forma: 'retangulo', nome: 'Faixa', x: 0, y: 0, largura: 100, altura: 100, preenchimento: '#000000' } },
    ]);
    expect(a.veredito.ok).toBe(true);
    const b = tentar(g, a.doc, [{ op: 'remover', alvo: 'Banner/Faixa' }], 'lote-2');
    expect(b.veredito.ok).toBe(true);
  });

  it('recusa prancheta além das que o plano autoriza', () => {
    const g = criarGuarda(licenca, inicial);
    const a = tentar(g, inicial, [novoFormato]);
    const b = tentar(g, a.doc, [{ ...novoFormato, nome: 'Capa' }], 'lote-2');
    expect(b.veredito).toMatchObject({ ok: false, motivo: 'prancheta_a_mais' });
  });

  it('recusa alterar camada que já existia', () => {
    const g = criarGuarda(licenca, inicial);
    const r = tentar(g, inicial, [{ op: 'alterar', alvo: 'Feed/Título', props: { cor: '#ff0000' } }]);
    expect(r.veredito).toMatchObject({ ok: false, motivo: 'fora_do_plano' });
    if (!r.veredito.ok) expect(r.veredito.mensagem).toContain('Feed');
  });

  it('recusa remover camada e prancheta que já existiam', () => {
    const g = criarGuarda(licenca, inicial);
    expect(tentar(g, inicial, [{ op: 'remover', alvo: 'Feed/Selo' }]).veredito).toMatchObject({ ok: false, motivo: 'remocao_sem_plano' });
    expect(tentar(g, inicial, [{ op: 'removerPrancheta', prancheta: 'Story' }]).veredito).toMatchObject({ ok: false, motivo: 'remocao_sem_plano' });
  });

  it('recusa redefinir token que as pranchetas do designer usam, e deixa criar token novo', () => {
    const comToken = aplicarLote(
      inicial,
      [
        { op: 'definirToken', nome: 'acento', valor: '#f4c430' },
        { op: 'alterar', alvo: 'Feed/Selo', props: { preenchimento: 'token:acento' } },
      ],
      { autoria: { tipo: 'designer' }, idDoLote: 'lote-do-designer' },
    );
    if (!comToken.ok) throw new Error('preparo');
    const g = criarGuarda(licenca, comToken.doc);
    expect(tentar(g, comToken.doc, [{ op: 'definirToken', nome: 'acento', valor: '#ff0000' }]).veredito).toMatchObject({ ok: false, motivo: 'fora_do_plano' });
    expect(tentar(g, comToken.doc, [{ op: 'definirToken', nome: 'acento-do-banner', valor: '#ff0000' }]).veredito.ok).toBe(true);
  });
});

describe('guarda do plano: pedido aprovado sobre a peça', () => {
  const inicial = pecaDoDesigner();
  const licenca = plano({
    alterar: [{ prancheta: idDe(inicial, 'Feed'), nome: 'Feed', oQue: 'título' }],
    remover: [{ alvo: idDe(inicial, 'Feed/Selo'), nome: 'Selo', prancheta: 'Feed', tipo: 'camada', motivo: 'pedido' }],
  });

  it('deixa alterar a prancheta do plano e remover o que o plano lista', () => {
    const g = criarGuarda(licenca, inicial);
    const r = tentar(g, inicial, [
      { op: 'alterar', alvo: 'Feed/Título', props: { cor: '#ff0000' } },
      { op: 'remover', alvo: 'Feed/Selo' },
    ]);
    expect(r.veredito.ok).toBe(true);
  });

  it('recusa tocar prancheta fora do plano e remover o que o plano não lista', () => {
    const g = criarGuarda(licenca, inicial);
    expect(tentar(g, inicial, [{ op: 'alterar', alvo: 'Story/Título', props: { cor: '#ff0000' } }]).veredito).toMatchObject({ ok: false, motivo: 'fora_do_plano' });
    expect(tentar(g, inicial, [{ op: 'remover', alvo: 'Feed/Subtítulo' }]).veredito).toMatchObject({ ok: false, motivo: 'remocao_sem_plano' });
  });

  it('desagrupar não conta como remoção: as camadas continuam lá', () => {
    const agrupado = aplicarLote(inicial, [{ op: 'agrupar', alvos: ['Feed/Título', 'Feed/Subtítulo'], nome: 'Textos' }], { autoria: { tipo: 'designer' }, idDoLote: 'lote-do-designer' });
    if (!agrupado.ok) throw new Error('preparo');
    const g = criarGuarda(plano({ alterar: [{ prancheta: idDe(agrupado.doc, 'Feed'), nome: 'Feed', oQue: '' }] }), agrupado.doc);
    expect(tentar(g, agrupado.doc, [{ op: 'desagrupar', alvo: 'Feed/Textos' }]).veredito.ok).toBe(true);
  });

  it('levar camada para outra prancheta do plano não é remoção', () => {
    const g = criarGuarda(
      plano({
        alterar: [
          { prancheta: idDe(inicial, 'Feed'), nome: 'Feed', oQue: '' },
          { prancheta: idDe(inicial, 'Story'), nome: 'Story', oQue: '' },
        ],
      }),
      inicial,
    );
    expect(tentar(g, inicial, [{ op: 'transferir', alvo: 'Feed/Selo', prancheta: 'Story' }]).veredito.ok).toBe(true);
  });
});

describe('guarda do plano: ajuste pontual', () => {
  const inicial = pecaDoDesigner();
  const licenca = plano({ pontual: true });

  it('a primeira prancheta tocada vira a prancheta do ajuste; a segunda é recusada', () => {
    const g = criarGuarda(licenca, inicial);
    const a = tentar(g, inicial, [{ op: 'alterar', alvo: 'Feed/Título', props: { cor: '#1f5fbf' } }]);
    expect(a.veredito.ok).toBe(true);
    const b = tentar(g, a.doc, [{ op: 'alterar', alvo: 'Feed/Subtítulo', props: { cor: '#1f5fbf' } }], 'lote-2');
    expect(b.veredito.ok).toBe(true);
    const c = tentar(g, b.doc, [{ op: 'alterar', alvo: 'Story/Título', props: { cor: '#1f5fbf' } }], 'lote-3');
    expect(c.veredito).toMatchObject({ ok: false, motivo: 'fora_do_ajuste' });
  });

  it('recusa lote que toca duas pranchetas de uma vez, criar prancheta e remover o que já existia', () => {
    const g = criarGuarda(licenca, inicial);
    expect(
      tentar(g, inicial, [
        { op: 'alterar', alvo: 'Feed/Título', props: { cor: '#1f5fbf' } },
        { op: 'alterar', alvo: 'Story/Título', props: { cor: '#1f5fbf' } },
      ]).veredito,
    ).toMatchObject({ ok: false, motivo: 'fora_do_ajuste' });
    expect(tentar(g, inicial, [novoFormato]).veredito).toMatchObject({ ok: false, motivo: 'fora_do_ajuste' });
    expect(tentar(g, inicial, [{ op: 'remover', alvo: 'Feed/Selo' }]).veredito).toMatchObject({ ok: false, motivo: 'fora_do_ajuste' });
  });

  it('pode criar camada nova na prancheta do ajuste e removê-la depois', () => {
    const g = criarGuarda(licenca, inicial);
    const a = tentar(g, inicial, [{ op: 'criarNo', prancheta: 'Feed', no: { tipo: 'forma', forma: 'retangulo', nome: 'Fio', x: 72, y: 600, largura: 200, altura: 4, preenchimento: '#111111' } }]);
    expect(a.veredito.ok).toBe(true);
    expect(tentar(g, a.doc, [{ op: 'remover', alvo: 'Feed/Fio' }], 'lote-2').veredito.ok).toBe(true);
  });
});
