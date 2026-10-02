import { describe, expect, it } from 'vitest';
import { chaveDaFamilia, pistaDoPostScript } from './pista-do-postscript';

describe('pistaDoPostScript', () => {
  it('separa a família do estilo e lê o peso pelo nome do estilo', () => {
    expect(pistaDoPostScript('Anton-Regular')).toEqual({ familia: 'anton', peso: 400, italico: false });
    expect(pistaDoPostScript('IBMPlexSans-Bold')).toEqual({ familia: 'ibmplexsans', peso: 700, italico: false });
    expect(pistaDoPostScript('Poppins-SemiBoldItalic')).toEqual({ familia: 'poppins', peso: 600, italico: true });
    expect(pistaDoPostScript('Montserrat-ExtraLight')).toEqual({ familia: 'montserrat', peso: 200, italico: false });
    expect(pistaDoPostScript('Montserrat-ExtraBold')).toEqual({ familia: 'montserrat', peso: 800, italico: false });
    expect(pistaDoPostScript('Roboto-Black')).toEqual({ familia: 'roboto', peso: 900, italico: false });
    expect(pistaDoPostScript('Roboto-Thin')).toEqual({ familia: 'roboto', peso: 100, italico: false });
    expect(pistaDoPostScript('Roboto-Medium')).toEqual({ familia: 'roboto', peso: 500, italico: false });
    expect(pistaDoPostScript('Roboto-Light')).toEqual({ familia: 'roboto', peso: 300, italico: false });
    expect(pistaDoPostScript('Roboto-Italic')).toEqual({ familia: 'roboto', peso: 400, italico: true });
  });

  it('sem hífen, o nome inteiro é a família, no peso normal', () => {
    expect(pistaDoPostScript('Helvetica')).toEqual({ familia: 'helvetica', peso: 400, italico: false });
    expect(pistaDoPostScript('ArialMT')).toEqual({ familia: 'arialmt', peso: 400, italico: false });
  });

  it('estilo que não é de peso conhecido fica no peso normal, e o hífen que conta é o último', () => {
    expect(pistaDoPostScript('Playfair-Display-Condensed')).toEqual({ familia: 'playfairdisplay', peso: 400, italico: false });
    expect(pistaDoPostScript('Source-Sans-3-Bold')).toEqual({ familia: 'sourcesans3', peso: 700, italico: false });
  });

  it('nome hostil não quebra: vazio, enorme, com controle e com nome de propriedade de objeto', () => {
    expect(pistaDoPostScript('')).toEqual({ familia: '', peso: 400, italico: false });
    expect(pistaDoPostScript('__proto__')).toEqual({ familia: 'proto', peso: 400, italico: false });
    expect(pistaDoPostScript(`${'A'.repeat(100_000)}-Bold`).familia).toHaveLength(200);
    expect(pistaDoPostScript('Fo\u0000nt\n-Bold')).toEqual({ familia: 'font', peso: 700, italico: false });
  });
});

describe('chaveDaFamilia', () => {
  it('a família da biblioteca e a do nome PostScript dão a mesma chave', () => {
    expect(chaveDaFamilia('IBM Plex Sans')).toBe('ibmplexsans');
    expect(chaveDaFamilia('Playfair Display')).toBe(pistaDoPostScript('PlayfairDisplay-Bold').familia);
    expect(chaveDaFamilia('DM Serif Display')).toBe(pistaDoPostScript('DMSerifDisplay-Regular').familia);
  });
});
