// A marca como estado de tela e como o servidor a guarda (DadosDaMarca, em packages/shared/src/briefing.ts).
import { DadosDaMarca, type Marca } from '@otto/shared';
import { describe, expect, it } from 'vitest';
import { daMarca, MARCA_VAZIA, paraDados, semIdentidade } from './dadosDaMarca';

const SHA = 'a'.repeat(64);
const QUANDO = '2026-10-02T12:00:00.000Z';

describe('marca', () => {
  it('só o nome é obrigatório: marca sem identidade é um estado válido, e nada vazio é mandado', () => {
    const dados = paraDados({ ...MARCA_VAZIA, nome: ' Café Aurora ' });
    expect(dados).toEqual({ nome: 'Café Aurora' });
    expect(DadosDaMarca.safeParse(dados).success).toBe(true);
    const cafe = { ...MARCA_VAZIA, nome: 'Café Aurora' };
    expect(semIdentidade(cafe)).toBe(true);
  });

  it('cor não definida não é inventada: só vão as cores que têm valor', () => {
    const dados = paraDados({ ...MARCA_VAZIA, nome: 'Café', cores: { primaria: '#0F3B2C', destaque: '', fundo: '', texto: '#17171c' } });
    expect(dados.cores).toEqual({ primaria: '#0F3B2C', texto: '#17171c' });
    expect(semIdentidade({ ...MARCA_VAZIA, cores: { ...MARCA_VAZIA.cores, primaria: '#0f3b2c' } })).toBe(false);
    expect(semIdentidade({ ...MARCA_VAZIA, fonteDeTitulo: 'Anton' })).toBe(false);
  });

  it('tudo preenchido passa pelo esquema fechado do servidor', () => {
    const dados = paraDados({
      nome: 'Café',
      site: 'cafeaurora.com.br',
      cores: { primaria: '#0f3b2c', destaque: '#f4c430', fundo: '#f4efe3', texto: '#17171c' },
      fonteDeTitulo: 'DM Serif Display',
      fonteDeTexto: 'IBM Plex Sans',
      logo: { sha256: SHA, nome: 'logo.svg', miniatura: '<svg/>' },
      icones: [{ sha256: SHA }],
      rodape: '@cafeaurora',
      restricoes: 'nunca foto de pessoa\nsem vermelho',
    });
    expect(DadosDaMarca.safeParse(dados).success).toBe(true);
    expect(dados).toMatchObject({ logo: { arquivo: SHA }, icones: [{ arquivo: SHA }], restricoes: ['nunca foto de pessoa', 'sem vermelho'] });
  });

  it('ida e volta: a marca do servidor vira estado e volta igual', () => {
    const marca: Marca = {
      id: '0199a000-0000-7000-8000-00000000000a',
      nome: 'Café',
      cores: { primaria: '#0f3b2c' },
      fonteDeTitulo: 'Anton',
      logo: { arquivo: SHA },
      restricoes: ['a', 'b'],
      rodape: '@c',
      criadaEm: QUANDO,
      alteradaEm: QUANDO,
    };
    const estado = daMarca(marca);
    expect(estado).toMatchObject({ nome: 'Café', cores: { primaria: '#0f3b2c', destaque: '' }, logo: { sha256: SHA }, restricoes: 'a\nb', fonteDeTexto: '' });
    expect(paraDados(estado)).toEqual({ nome: 'Café', cores: { primaria: '#0f3b2c' }, fonteDeTitulo: 'Anton', logo: { arquivo: SHA }, restricoes: ['a', 'b'], rodape: '@c' });
  });
});
