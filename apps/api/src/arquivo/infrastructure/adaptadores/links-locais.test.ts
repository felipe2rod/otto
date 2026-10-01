import { describe, expect, it } from 'vitest';
import { AssinadorDeLinks, disposicaoDeAnexo } from './links-locais';

describe('disposicaoDeAnexo', () => {
  it('monta o cabeçalho com um nome ASCII de reserva e o nome de verdade codificado', () => {
    expect(disposicaoDeAnexo('Promoção - Feed.psd')).toBe(`attachment; filename="Promocao - Feed.psd"; filename*=UTF-8''Promo%C3%A7%C3%A3o%20-%20Feed.psd`);
  });

  it('nome com aspas, barra, quebra de linha ou ponto e vírgula não quebra o cabeçalho nem injeta outro', () => {
    const d = disposicaoDeAnexo('a"b\r\nSet-Cookie: x=1; \\c/d.psd');
    expect(d).not.toMatch(/[\r\n]/);
    expect(d.match(/"/g)).toHaveLength(2);
    expect(d).toContain("filename*=UTF-8''");
  });

  it('nome vazio vira um nome neutro', () => {
    expect(disposicaoDeAnexo('')).toContain('filename="arquivo"');
  });
});

describe('AssinadorDeLinks', () => {
  const dados = { chave: 'contas/x/exportacoes/y/0.psd', nome: 'a.psd', tipo: 'image/png' };
  const assinador = (agora: () => number) => new AssinadorDeLinks('segredo-de-teste-com-mais-de-trinta-e-dois-caracteres', agora);

  it('o que ele assina, ele abre, enquanto não vence', () => {
    let agora = 1_000_000;
    const a = assinador(() => agora);
    const token = a.assinar(dados, 60);
    expect(a.abrir(token)).toEqual(dados);
    agora += 59_000;
    expect(a.abrir(token)).toEqual(dados);
    agora += 2_000;
    expect(a.abrir(token)).toBeUndefined();
  });

  it('token adulterado, cortado, vazio ou assinado com outro segredo não abre', () => {
    const a = assinador(() => 0);
    const token = a.assinar(dados, 60);
    const [corpo, assinatura] = token.split('.') as [string, string];
    const outroCorpo = Buffer.from(JSON.stringify({ c: 'contas/outra/exportacoes/y/0.psd', n: 'a.psd', t: 'image/png', e: 9e12 })).toString('base64url');
    for (const ruim of [`${outroCorpo}.${assinatura}`, `${corpo}.${assinatura.slice(0, -2)}xx`, corpo, '', '.', 'a.b.c']) expect(a.abrir(ruim), ruim).toBeUndefined();
    expect(new AssinadorDeLinks('outro-segredo-também-com-mais-de-trinta-e-dois-caracteres', () => 0).abrir(token)).toBeUndefined();
  });

  it('recusa segredo curto', () => {
    expect(() => new AssinadorDeLinks('curto')).toThrow();
  });
});
