import { describe, expect, it } from 'vitest';
import { CursorInvalido, codificarCursor, lerCursor } from './cursor';

describe('cursor de paginação', () => {
  it('vai e volta', () => {
    const c = codificarCursor({ alteradoEm: '2026-10-01T12:00:00.000Z', id: 'abc' });
    expect(c).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(lerCursor(c)).toEqual({ alteradoEm: '2026-10-01T12:00:00.000Z', id: 'abc' });
  });

  it('texto qualquer é cursor inválido, não erro interno', () => {
    for (const ruim of ['', 'não-é-cursor', 'e30', Buffer.from('[1,2]').toString('base64url'), Buffer.from('"x"').toString('base64url')]) {
      expect(() => lerCursor(ruim), ruim).toThrow(CursorInvalido);
    }
  });
});
