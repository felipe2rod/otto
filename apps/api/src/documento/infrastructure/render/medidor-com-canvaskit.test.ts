// O medidor de verdade: CanvasKit carregado no processo, fontes vindas da biblioteca.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { Documento, type No } from '@otto/documento';
import { describe, expect, it } from 'vitest';
import { BibliotecaDeFontesEmMemoria } from '../../../biblioteca/infrastructure/memoria/biblioteca-de-fontes-em-memoria';
import { familiasCitadas, MedidorComCanvasKit } from './medidor-com-canvaskit';

const FONTES = path.resolve(import.meta.dirname, '../../../../../../packages/render/recursos-de-teste/fontes');

const texto = (id: string, fonte: string, extra: object = {}) => ({
  id,
  nome: id,
  tipo: 'texto',
  x: 100,
  y: 100,
  largura: 600,
  altura: 200,
  conteudo: 'Otto',
  fonte,
  peso: 400,
  tamanho: 80,
  cor: '#000000',
  ...extra,
});
const doc = (filhos: object[], estilos: object = {}) =>
  Documento.parse({
    versaoDoFormato: 1,
    tokens: { cores: {}, estilosDeTexto: estilos },
    pranchetas: [{ id: 'p', nome: 'Feed', tipo: 'prancheta', largura: 1080, altura: 1350, fundo: '#ffffff', filhos }],
  });

describe('familiasCitadas', () => {
  it('junta as famílias do documento (texto, trecho, estilo de texto) e as das operações', () => {
    const d = doc([texto('t1', 'Anton', { trechos: [{ inicio: 0, fim: 2, fonte: 'IBM Plex Sans' }] })], { titulo: { fonte: 'DM Serif Display', tamanho: 40 } });
    const operacoes = [
      { op: 'criarNo', prancheta: 'Feed', no: { tipo: 'texto', fonte: 'Space Mono' } },
      { op: 'alterar', alvo: 't1', props: { fonte: 'Bebas Neue' } },
      { op: 'definirEstiloDeTexto', nome: 'corpo', estilo: { fonte: 'Poppins', tamanho: 16 } },
      { op: 'mover', alvo: 't1', x: 1, y: 2 },
    ];
    expect([...familiasCitadas(d, operacoes)].sort()).toEqual(['Anton', 'Bebas Neue', 'DM Serif Display', 'IBM Plex Sans', 'Poppins', 'Space Mono']);
  });

  it('não se perde com operação malformada', () => {
    expect([...familiasCitadas(doc([]), [null, 'texto', { op: 'alterar', props: { fonte: 42 } }, { fonte: ['x'] }])]).toEqual([]);
  });
});

describe('MedidorComCanvasKit', () => {
  it('mede o texto pela tinta, com a fonte da biblioteca: a tinta é menor que a caixa e fica dentro dela', async () => {
    const biblioteca = new BibliotecaDeFontesEmMemoria();
    await biblioteca.registrar({ familia: 'Anton', peso: 400, nomePostScript: 'Anton-Regular', licenca: null, conteudo: readFileSync(path.join(FONTES, 'Anton-Regular.ttf')) });
    const d = doc([texto('t1', 'Anton')]);
    const aberto = await new MedidorComCanvasKit(biblioteca).abrir(d, []);
    try {
      const no = d.pranchetas[0]?.filhos[0] as No;
      const tinta = aberto.medidor.tinta(no);
      expect(tinta.w).toBeGreaterThan(20);
      expect(tinta.w).toBeLessThan(600);
      expect(tinta.h).toBeLessThan(200);
      expect(tinta.x).toBeGreaterThanOrEqual(100);
      expect(tinta.y).toBeGreaterThanOrEqual(100);
    } finally {
      aberto.liberar();
    }
  });

  it('abre e libera várias vezes no mesmo processo (o motor é carregado uma vez só)', async () => {
    const medidores = new MedidorComCanvasKit(new BibliotecaDeFontesEmMemoria());
    for (let i = 0; i < 3; i++) (await medidores.abrir(doc([]), [])).liberar();
    expect(medidores.cargasDoMotor).toBe(1);
  });

  it('fonte que a biblioteca não tem não derruba: o medidor abre e mede o que dá', async () => {
    const d = doc([texto('t1', 'Fonte Que Não Existe')]);
    const aberto = await new MedidorComCanvasKit(new BibliotecaDeFontesEmMemoria()).abrir(d, []);
    expect(() => aberto.medidor.tinta(d.pranchetas[0]?.filhos[0] as No)).not.toThrow();
    aberto.liberar();
  });
});
