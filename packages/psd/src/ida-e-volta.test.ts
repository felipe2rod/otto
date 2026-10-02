// Ida e volta (ADR 028, item 4): exportar uma peça do Otto em PSD e importar o arquivo de novo tem de dar a mesma árvore.
// Onde não dá, a diferença está escrita aqui, uma a uma, com o motivo, e o teste confere que são SÓ essas: o que sobra
// da árvore tem de ser igual, e o render da árvore que voltou tem de ser o render da que foi.
import { aplicarLote, type Documento, type No, type Prancheta, resolverCor } from '@otto/documento';
import { criarSessao, escolherFonte, renderizarPrancheta } from '@otto/render';
import type { CanvasKit } from 'canvaskit-wasm';
import { beforeAll, describe, expect, it } from 'vitest';
import { criarFormatoPsd } from './adaptadores/biblioteca-de-psd';
import { recursosDeTeste } from './apoio-de-teste';
import { cenasDeGolden } from './cenas-de-golden';
import { exportarPsd, type RecursosDaExportacao } from './exportar';
import { importarPsd, type ResultadoDaImportacao } from './importar';

let ck: CanvasKit;
let recursos: RecursosDaExportacao;
beforeAll(async () => {
  ({ ck, recursos } = await recursosDeTeste());
});

async function idaEVolta(doc: Documento, arquivos?: 'juntas'): Promise<ResultadoDaImportacao> {
  const exportado = await exportarPsd(ck, criarFormatoPsd(), doc, recursos, { nome: 'peça', ...(arquivos ? { arquivos } : {}) });
  return importarPsd(ck, criarFormatoPsd(), exportado.arquivos[0]?.bytes as Uint8Array, { fontes: recursos.fontes, nomeDaPrancheta: doc.pranchetas[0]?.nome ?? 'Peça' });
}

type Solto = Record<string, unknown>;
const todos = (filhos: readonly No[]): No[] => filhos.flatMap((n) => (n.tipo === 'grupo' ? [n, ...todos(n.filhos)] : [n]));

/**
 * O que NÃO volta igual, e por quê. Esta função tira da árvore exatamente isso (da original e da importada), e o que
 * sobra é comparado campo a campo.
 */
function semOQueNaoVolta(doc: Documento, original: Documento): unknown {
  const cor = (v: unknown): unknown => (typeof v === 'string' && v.startsWith('token:') ? resolverCor(original, v) : v);
  // 1. Token de cor volta como o valor dele: o PSD não tem variável de cor.
  const semTokens = (v: unknown): unknown => (Array.isArray(v) ? v.map(semTokens) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, semTokens(x)])) : cor(v));
  // 2. Forma, texto e vetor com filtro são exportados como pixel (no Photoshop, filtro editável só existe em objeto
  //    inteligente), e voltam como imagem.
  const exportadasComoPixel = new Set(
    todos(original.pranchetas.flatMap((p) => p.filhos)).flatMap((n) => (n.tipo !== 'imagem' && n.tipo !== 'grupo' && n.tipo !== 'ajuste' && (n.filtros?.length ?? 0) > 0 ? [n.nome] : [])),
  );
  const no = (n: No): Solto => {
    const { id: _id, ...resto } = n as No & Solto;
    const s = semTokens(resto) as Solto;
    if (exportadasComoPixel.has(n.nome)) return { tipo: 'imagem', nome: n.nome, exportadaComoPixel: true };
    if (n.tipo === 'grupo') return { ...s, filhos: n.filhos.map(no) };
    if (n.tipo === 'texto') {
      // 3. A altura da caixa de texto volta como a maior entre a caixa e o texto (a exportação aumenta a caixa para o
      //    texto caber, e não guarda a original), e com ela mudam x e y de um texto girado. Conferidos à parte.
      const { altura: _altura, x: _x, y: _y, ...texto } = s;
      // 4. O peso que a conta não tem volta como o peso da fonte que foi usada (o PSD guarda a fonte, não o pedido).
      return { ...texto, peso: escolherFonte(recursos.fontes, n.fonte, n.peso)?.peso };
    }
    if (n.tipo === 'vetor') {
      // 5. O vetor volta com a caixa justa no desenho, a moldura do tamanho dela, sem rotação (a rotação já está nos
      //    pontos) e com o traço na espessura final: o PSD guarda os pontos, não a moldura. O desenho é o mesmo.
      const { x: _x, y: _y, largura: _largura, altura: _altura, moldura: _moldura, rotacao: _rotacao, caminhos, ...vetor } = s;
      return { ...vetor, caminhos: (caminhos as Solto[]).map(({ d: _d, traco, ...c }) => ({ ...c, ...(traco ? { traco: { ...(traco as Solto), espessura: 'a do desenho' } } : {}) })) };
    }
    if (n.tipo === 'imagem') {
      // 6. A origem da imagem de banco (banco, autor, licença) não vai para o PSD.
      const { origem: _origem, ...imagem } = s;
      // 7. A máscara do sujeito volta reamostrada na resolução em que a foto aparece: é outro arquivo, com o mesmo recorte.
      const m = imagem.mascara as Solto | undefined;
      return m?.tipo === 'sujeito' ? { ...imagem, mascara: { ...m, arquivo: 'a máscara do sujeito' } } : imagem;
    }
    return s;
  };
  return doc.pranchetas.map((p) => ({ nome: p.nome, largura: p.largura, altura: p.altura, fundo: cor(p.fundo), filhos: p.filhos.map(no) }));
}

describe('ida e volta: exportar em PSD e importar de novo', () => {
  for (const cena of cenasDeGolden()) {
    describe(cena.nome, () => {
      it('a árvore volta igual, fora as diferenças declaradas', async () => {
        const volta = await idaEVolta(cena.doc, cena.arquivos);
        expect(semOQueNaoVolta(volta.doc, cena.doc)).toEqual(semOQueNaoVolta(cena.doc, cena.doc));
      });

      it('o texto volta no mesmo lugar: a caixa só cresce para baixo, até a altura do texto', async () => {
        const volta = await idaEVolta(cena.doc, cena.arquivos);
        cena.doc.pranchetas.forEach((p, i) => {
          const importados = todos((volta.doc.pranchetas[i] as Prancheta).filhos);
          for (const original of todos(p.filhos)) {
            if (original.tipo !== 'texto' || (original.filtros?.length ?? 0) > 0) continue;
            const voltou = importados.find((n) => n.nome === original.nome);
            if (voltou?.tipo !== 'texto') throw new Error(`"${original.nome}" não voltou como texto`);
            expect(voltou.altura, original.nome).toBeGreaterThanOrEqual(original.altura - 0.01);
            // o canto de cima da caixa, depois da rotação, é o mesmo ponto
            const canto = (n: typeof original): [number, number] => {
              const a = (n.rotacao * Math.PI) / 180;
              const cx = n.x + n.largura / 2;
              const cy = n.y + n.altura / 2;
              return [cx + (n.x - cx) * Math.cos(a) - (n.y - cy) * Math.sin(a), cy + (n.x - cx) * Math.sin(a) + (n.y - cy) * Math.cos(a)];
            };
            expect(canto(voltou)[0], `${original.nome}: x`).toBeCloseTo(canto(original)[0], 1);
            expect(canto(voltou)[1], `${original.nome}: y`).toBeCloseTo(canto(original)[1], 1);
          }
        });
      });

      it('o render do que voltou é o render do que foi', async () => {
        const volta = await idaEVolta(cena.doc, cena.arquivos);
        const fontes = recursos.fontes.map((f) => ({ familia: f.familia, peso: f.peso, bytes: f.bytes }));
        const antes = criarSessao(ck, { fontes, imagens: recursos.imagens.map((i) => ({ arquivo: i.arquivo, bytes: i.bytes })) });
        // a sessão do que voltou só tem as imagens que a importação devolveu: o documento tem de se bastar com elas
        const depois = criarSessao(ck, { fontes, imagens: volta.imagens.map((i) => ({ arquivo: i.arquivo, bytes: i.bytes })) });
        // Duas diferenças declaradas mudam o pixel, e saem da comparação para o resto poder ser conferido de perto:
        // - o grão do filtro de ruído sai do id do nó, e o nó importado tem outro id (o desenho do grão muda);
        // - a caixa de texto que cresceu (diferença 3) estica a sobreposição de degradê do texto, que acompanha a caixa.
        const acertar = (n: No, originais: Map<string, No> | undefined): No => {
          if (n.tipo === 'grupo') return { ...n, filhos: n.filhos.map((f) => acertar(f, originais)) };
          if (n.tipo === 'ajuste') return n;
          const original = originais?.get(n.nome);
          const semRuido = n.filtros ? { filtros: n.filtros.filter((f) => f.tipo !== 'ruido') } : {};
          return { ...n, ...semRuido, ...(n.tipo === 'texto' && original?.tipo === 'texto' ? { x: original.x, y: original.y, altura: original.altura } : {}) } as No;
        };
        try {
          cena.doc.pranchetas.forEach((p, i) => {
            const voltou = volta.doc.pranchetas[i] as Prancheta;
            const originais = new Map(todos(p.filhos).map((n) => [n.nome, n]));
            const a = renderizarPrancheta(antes, cena.doc, { ...p, filhos: p.filhos.map((n) => acertar(n, undefined)) }).rgba;
            const b = renderizarPrancheta(depois, volta.doc, { ...voltou, filhos: voltou.filhos.map((n) => acertar(n, originais)) }).rgba;
            let soma = 0;
            let acima = 0;
            for (let k = 0; k < a.length; k += 4) {
              const d = Math.max(Math.abs((a[k] as number) - (b[k] as number)), Math.abs((a[k + 1] as number) - (b[k + 1] as number)), Math.abs((a[k + 2] as number) - (b[k + 2] as number)));
              soma += d;
              if (d > 8) acima++;
            }
            const pixels = a.length / 4;
            // o vetor com escala diferente nos dois eixos tem o traço esticado no Otto; a exportação o grava com uma
            // espessura só (a média), e é com ela que ele volta (diferença 5)
            const [media, fracao] = cena.nome === 'vetor' ? [0.8, 0.02] : [0.25, 0.005];
            expect(soma / pixels, `${p.nome}: diferença média, em níveis`).toBeLessThan(media);
            expect(acima / pixels, `${p.nome}: fração dos pixels a mais de 8 níveis`).toBeLessThan(fracao);
          });
        } finally {
          antes.destruir();
          depois.destruir();
        }
      });

      it('importar duas vezes o mesmo arquivo dá a mesma árvore, id por id, e as mesmas imagens', async () => {
        const exportado = await exportarPsd(ck, criarFormatoPsd(), cena.doc, recursos, { nome: 'peça', ...(cena.arquivos ? { arquivos: cena.arquivos } : {}) });
        const bytes = exportado.arquivos[0]?.bytes as Uint8Array;
        const a = await importarPsd(ck, criarFormatoPsd(), bytes, { fontes: recursos.fontes });
        const b = await importarPsd(ck, criarFormatoPsd(), bytes, { fontes: recursos.fontes });
        expect(a.doc).toEqual(b.doc);
        expect(a.imagens.map((i) => i.arquivo)).toEqual(b.imagens.map((i) => i.arquivo));
        expect(a.relatorio).toEqual(b.relatorio);
      });
    });
  }

  it('degradê em camada girada: no Otto o degradê gira com a camada, e no PSD o ângulo é o do documento. Vai o ângulo menos a rotação, e volta o do Otto', async () => {
    const r = aplicarLote(
      cenasDeGolden().find((c) => c.nome === 'forma')?.doc as Documento,
      [
        {
          op: 'alterar',
          alvo: 'Peça/Girada',
          props: {
            preenchimento: {
              tipo: 'linear',
              angulo: 45,
              paradas: [
                { cor: '#000000', posicao: 0 },
                { cor: '#ffffff', posicao: 1 },
              ],
            },
          },
        },
        {
          op: 'alterar',
          alvo: 'Peça/Retângulo',
          props: {
            rotacao: -30,
            efeitos: {
              sobreposicaoDeDegrade: {
                degrade: {
                  tipo: 'linear',
                  angulo: 90,
                  paradas: [
                    { cor: '#ff0000', posicao: 0 },
                    { cor: '#0000ff', posicao: 1 },
                  ],
                },
              },
            },
          },
        },
      ],
      { autoria: { tipo: 'designer' }, idDoLote: 'girar-degrade' },
    );
    if (!r.ok) throw new Error(r.erro.mensagem);
    const exportado = await exportarPsd(ck, criarFormatoPsd(), r.doc, recursos, { nome: 'peça' });
    const bytes = exportado.arquivos[0]?.bytes as Uint8Array;
    const lidas = criarFormatoPsd().ler?.(bytes).camadas ?? [];
    // "Girada" está a 12° (sentido horário): 45° no Otto são 33° no documento do Photoshop (ângulo anti-horário)
    expect(lidas.find((c) => c.nome === 'Girada')?.preenchimento).toMatchObject({ tipo: 'degrade', angulo: 33 });
    expect(lidas.find((c) => c.nome === 'Retângulo')?.efeitos?.sobreposicaoDeDegrade?.degrade.angulo).toBe(120);
    const volta = await importarPsd(ck, criarFormatoPsd(), bytes, { fontes: recursos.fontes });
    const nos = volta.doc.pranchetas[0]?.filhos ?? [];
    expect(nos.find((n) => n.nome === 'Girada')).toMatchObject({ rotacao: 12, preenchimento: { angulo: 45 } });
    expect(nos.find((n) => n.nome === 'Retângulo')).toMatchObject({ rotacao: -30, efeitos: { sobreposicaoDeDegrade: { degrade: { angulo: 90 } } } });
  });

  it('o relatório da ida e volta: tudo editável, menos o que a exportação já tinha gravado como pixel', async () => {
    for (const cena of cenasDeGolden()) {
      const { relatorio } = await idaEVolta(cena.doc, cena.arquivos);
      const naoEditaveis = relatorio.camadas.filter((l) => l.destino !== 'editavel').map((l) => `${l.camada}: ${l.mapeamento}`);
      expect(naoEditaveis, cena.nome).toEqual(cena.nome === 'forma' ? ['Com filtro: psd:camada-de-pixels'] : []);
      expect(
        relatorio.camadas.flatMap((l) => l.perdas ?? []),
        cena.nome,
      ).toEqual([]);
      expect(relatorio.emFalta.fontes, cena.nome).toEqual([]);
      expect(relatorio.arquivo.conversaoDeCor).toBe('srgb');
    }
  });
});
