import { describe, expect, it } from 'vitest';
import { expandirVetores, vetoresDoBriefing } from '../agente';

const LOGO = { tipo: 'vetor', moldura: [200, 100], caminhos: [{ d: 'M0 0C0 0 200 0 200 0C200 0 200 100 200 100Z'.repeat(50), preenchimento: '#0037a6', regra: 'nao-zero' }], origem: { arquivo: 'hashlogo', nome: 'logo.svg' } };
const ICONE = { tipo: 'vetor', moldura: [50, 60], caminhos: [{ d: 'M0 0C0 0 50 60 50 60', traco: { cor: '#0037a6', espessura: 4, ponta: 'redonda', juncao: 'redonda' }, regra: 'nao-zero' }], origem: { arquivo: 'hashicone', nome: 'icone.svg' } };
const briefing = { nome: 'x', logo: { arquivo: 'logo.svg', usarEste: LOGO, avisosDaImportacao: [] }, icones: [{ arquivo: 'icone.svg', usarEste: ICONE, avisosDaImportacao: [] }] };

describe('vetores do briefing por referência', () => {
  it('o agente recebe só a referência, sem o desenho', () => {
    const { paraOAgente, vetores } = vetoresDoBriefing(briefing);
    const texto = JSON.stringify(paraOAgente);
    expect(texto).not.toContain('C0 0 200 0');
    expect(texto).toContain('"arquivo":"hashlogo"');
    expect(texto).toContain('#0037a6');
    expect(vetores.size).toBe(2);
  });

  it('criarNo com "arquivo" vira o vetor completo, com a altura pela proporção', () => {
    const { vetores } = vetoresDoBriefing(briefing);
    const [op] = expandirVetores([{ op: 'criarNo', prancheta: 'Feed', no: { tipo: 'vetor', nome: 'Logo', arquivo: 'hashlogo', x: 10, y: 20, largura: 400 } }], vetores) as [{ no: Record<string, unknown> }];
    expect(op.no.caminhos).toEqual(LOGO.caminhos);
    expect(op.no.moldura).toEqual([200, 100]);
    expect(op.no.altura).toBe(200);
    expect(op.no.origem).toEqual(LOGO.origem);
    expect(op.no).not.toHaveProperty('arquivo');
  });

  it('referência desconhecida fica como está (o lote é recusado com a lista do que existe)', () => {
    const { vetores } = vetoresDoBriefing(briefing);
    const ops = [{ op: 'criarNo', prancheta: 'Feed', no: { tipo: 'vetor', nome: 'Logo', arquivo: 'nao-existe', x: 0, y: 0, largura: 10 } }];
    expect(() => expandirVetores(ops, vetores)).toThrow(/hashlogo/);
  });

  it('não mexe em vetor desenhado pelo agente (forma livre)', () => {
    const livre = { op: 'criarNo', prancheta: 'Feed', no: { tipo: 'vetor', nome: 'Gota', x: 0, y: 0, largura: 10, altura: 10, moldura: [1, 1], caminhos: [{ d: 'M0 0C0 0 1 1 1 1Z', preenchimento: '#fff' }] } };
    expect(expandirVetores([livre], new Map())).toEqual([livre]);
  });
});
