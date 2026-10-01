import { describe, expect, it } from 'vitest';
import { type MedidasDoSite, fichaDaMarca, nomeDeFamilia, urlPermitida } from '../marca';

const CATALOGO = [
  { familia: 'Poppins', categoria: 'sem serifa' as const, pesos: [400, 600, 700], popularidade: 5 },
  { familia: 'Lilita One', categoria: 'display' as const, pesos: [400], popularidade: 300 },
  { familia: 'Inter', categoria: 'sem serifa' as const, pesos: [400, 700], popularidade: 2 },
  { familia: 'Playfair Display', categoria: 'serifada' as const, pesos: [400, 700], popularidade: 20 },
];

// Parecido com o site da CROVÉ: fundo creme, faixas azuis, títulos em Lilita azul, botão pílula azul.
const MEDIDAS: MedidasDoSite = {
  url: 'https://crovebakery.com/',
  titulo: 'CROVÉ Bakery',
  descricao: 'Padaria artesanal',
  corDoTema: '#0037a6',
  fundos: [
    { cor: '#fbf6ec', area: 0.55 },
    { cor: '#0037a6', area: 0.25 },
    { cor: '#fcf7ed', area: 0.05 },
    { cor: '#cfe3fd', area: 0.05 },
  ],
  fotos: 0.1,
  textos: [
    { cor: '#0037a6', familia: 'Lilita One', pilha: '"Lilita One", sans-serif', peso: 400, tamanho: 64, caixaAlta: true, espacamento: 0, caracteres: 60, papel: 'titulo' },
    { cor: '#1a1a1a', familia: 'Poppins', pilha: 'Poppins, sans-serif', peso: 400, tamanho: 16, caixaAlta: false, espacamento: 0, caracteres: 1200, papel: 'texto' },
    { cor: '#ffffff', familia: 'Poppins', pilha: 'Poppins, sans-serif', peso: 400, tamanho: 16, caixaAlta: false, espacamento: 0, caracteres: 300, papel: 'texto' },
  ],
  botoes: [{ fundo: '#0037a6', texto: '#ffffff', raio: 999, altura: 48, caixaAlta: true }],
  frases: ['Ingredientes simples', 'Feito à mão todo dia'],
};

describe('ficha da marca a partir das medidas do site', () => {
  it('fundo dominante pela área, texto pelo volume, primária pelo que se repete com cor', () => {
    const f = fichaDaMarca(MEDIDAS, CATALOGO);
    expect(f.paleta.fundo).toBe('#fbf6ec');
    expect(f.paleta.texto).toBe('#1a1a1a');
    expect(f.paleta.primaria).toBe('#0037a6');
    expect(f.paleta.destaque).toBe('#cfe3fd');
  });

  it('agrupa tons quase iguais (creme e creme de outra seção são a mesma cor)', () => {
    const f = fichaDaMarca(MEDIDAS, CATALOGO);
    const cremes = f.cores.filter((c) => c.cor.startsWith('#fb') || c.cor.startsWith('#fc'));
    expect(cremes).toHaveLength(1);
    expect(cremes[0]!.peso).toBeGreaterThanOrEqual(55);
  });

  it('tipografia de título e de texto, com a família do Google Fonts reconhecida', () => {
    const f = fichaDaMarca(MEDIDAS, CATALOGO);
    expect(f.tipografia.titulo).toMatchObject({ familia: 'Lilita One', noGoogleFonts: true, caixaAlta: true });
    expect(f.tipografia.texto).toMatchObject({ familia: 'Poppins', noGoogleFonts: true });
  });

  it('fonte que não está no Google Fonts recebe substituta da mesma categoria', () => {
    const f = fichaDaMarca({ ...MEDIDAS, textos: [{ ...MEDIDAS.textos[0]!, familia: 'Brandon Grotesque', pilha: '"Brandon Grotesque", Arial, sans-serif' }, MEDIDAS.textos[1]!] }, CATALOGO);
    expect(f.tipografia.titulo).toMatchObject({ familia: 'Brandon Grotesque', noGoogleFonts: false, substituta: 'Inter' });
  });

  it('fonte comercial conhecida recebe a equivalente do Google, na categoria certa', () => {
    const cat = [...CATALOGO, { familia: 'Bodoni Moda', categoria: 'serifada' as const, pesos: [400, 700], popularidade: 400 }, { familia: 'Nunito Sans', categoria: 'sem serifa' as const, pesos: [400, 700], popularidade: 30 }];
    const com = (familia: string, pilha = familia) => fichaDaMarca({ ...MEDIDAS, textos: [{ ...MEDIDAS.textos[0]!, familia, pilha }] }, cat).tipografia.titulo;
    expect(com('Didot')).toMatchObject({ noGoogleFonts: false, substituta: 'Bodoni Moda' });
    expect(com('AvenirLTPro')).toMatchObject({ familia: 'Avenir', substituta: 'Nunito Sans' });
    // família desconhecida com nome de serifada não vira sem serifa
    expect(com('Minha Serif Display')).toMatchObject({ substituta: 'Playfair Display' });
  });

  it('peso no nome da família sai do nome ("Roboto Light" é Roboto)', () => {
    const cat = [...CATALOGO, { familia: 'Roboto', categoria: 'sem serifa' as const, pesos: [300, 400], popularidade: 1 }];
    expect(fichaDaMarca({ ...MEDIDAS, textos: [{ ...MEDIDAS.textos[1]!, familia: 'Roboto Light', pilha: '"Roboto Light"' }] }, cat).tipografia.texto).toMatchObject({ familia: 'Roboto', noGoogleFonts: true });
  });

  it('cor que só aparece em texto conta como acento quando tem cor', () => {
    const f = fichaDaMarca({ ...MEDIDAS, corDoTema: undefined, fundos: [{ cor: '#ffffff', area: 0.7 }, { cor: '#e6e6e6', area: 0.03 }], botoes: [{ fundo: '#614636', texto: '#ffffff', raio: 0, altura: 44, caixaAlta: false }], textos: [{ ...MEDIDAS.textos[0]!, cor: '#614636' }, { ...MEDIDAS.textos[1]!, cor: '#222222' }, { ...MEDIDAS.textos[1]!, cor: '#b86125', caracteres: 200 }] }, CATALOGO);
    expect(f.paleta.primaria).toBe('#614636');
    expect(f.paleta.destaque).toBe('#b86125');
  });

  it('botão pílula vira linguagem de forma', () => {
    expect(fichaDaMarca(MEDIDAS, CATALOGO).forma.botao).toBe('pílula');
    expect(fichaDaMarca({ ...MEDIDAS, botoes: [{ ...MEDIDAS.botoes[0]!, raio: 0 }] }, CATALOGO).forma.botao).toBe('reto');
  });

  it('marca só em preto e branco: primária é o neutro que não é o fundo', () => {
    const f = fichaDaMarca({ ...MEDIDAS, corDoTema: undefined, fundos: [{ cor: '#ffffff', area: 0.8 }, { cor: '#111111', area: 0.2 }], botoes: [{ fundo: '#111111', texto: '#ffffff', raio: 0, altura: 44, caixaAlta: true }], textos: [{ ...MEDIDAS.textos[1]!, cor: '#111111' }] }, CATALOGO);
    expect(f.paleta.fundo).toBe('#ffffff');
    expect(f.paleta.primaria).toBe('#111111');
  });
});

describe('nome de família como o navegador devolve', () => {
  it('limpa aspas, fonte do Next.js e fallback', () => {
    expect(nomeDeFamilia('"Lilita One", sans-serif')).toBe('Lilita One');
    expect(nomeDeFamilia("'__Inter_d65c78', '__Inter_Fallback_d65c78'")).toBe('Inter');
    expect(nomeDeFamilia('__Playfair_Display_5a1b2c')).toBe('Playfair Display');
    expect(nomeDeFamilia('-apple-system, BlinkMacSystemFont, sans-serif')).toBe('-apple-system');
  });
});

describe('url que o Otto aceita ler', () => {
  it('só http e https públicos; completa o esquema', () => {
    expect(urlPermitida('crovebakery.com')?.href).toBe('https://crovebakery.com/');
    expect(urlPermitida('http://exemplo.com.br/loja')?.href).toBe('http://exemplo.com.br/loja');
    expect(urlPermitida('file:///etc/passwd')).toBeUndefined();
    expect(urlPermitida('http://localhost:5174')).toBeUndefined();
    expect(urlPermitida('http://127.0.0.1')).toBeUndefined();
    expect(urlPermitida('http://192.168.0.10')).toBeUndefined();
    expect(urlPermitida('http://10.1.2.3')).toBeUndefined();
    expect(urlPermitida('http://169.254.169.254/latest')).toBeUndefined();
    expect(urlPermitida('http://[::1]/')).toBeUndefined();
    expect(urlPermitida('não é url')).toBeUndefined();
  });
});
