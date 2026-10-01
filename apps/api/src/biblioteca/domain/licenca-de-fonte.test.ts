import { describe, expect, it } from 'vitest';
import { situacaoDaLicenca } from './licenca-de-fonte';

describe('situacaoDaLicenca: o arquivo da fonte pode ir dentro do pacote de exportação?', () => {
  it.each(['SIL Open Font License 1.1', 'OFL-1.1', 'Apache License 2.0', 'Ubuntu Font Licence 1.0'])('%s deixa redistribuir', (licenca) => {
    expect(situacaoDaLicenca(licenca)).toBe('permite');
  });

  it('licença declarada aberta mas ainda não conferida por família: vai no pacote, e fica marcada para o jurídico', () => {
    expect(situacaoDaLicenca('Google Fonts (licença aberta, a conferir por família)')).toBe('a_conferir');
  });

  it('sem licença registrada: não dá para saber, fica fora', () => {
    expect(situacaoDaLicenca(null)).toBe('desconhecida');
    expect(situacaoDaLicenca('   ')).toBe('desconhecida');
  });

  it('licença registrada que não é das que deixam redistribuir: fica fora', () => {
    expect(situacaoDaLicenca('Licença comercial para 5 computadores')).toBe('nao_permite');
    expect(situacaoDaLicenca('Proprietária, a conferir')).toBe('nao_permite');
  });
});
