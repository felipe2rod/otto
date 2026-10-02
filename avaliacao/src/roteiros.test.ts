// Os roteiros que o pacote do agente entrega ao worker e ao editor (packages/agente/roteiros) precisam
// continuar rodando do começo ao fim contra o ciclo, o catálogo e o motor de verdade. Se o catálogo ou o
// ciclo mudar e um roteiro parar de fechar, é aqui que aparece, antes de quebrar o desenvolvimento dos outros.
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { criarModeloRoteirizado, EntradaDaTarefa, idsDoRoteiro, type Roteiro, rodarTarefa } from '../../packages/agente/src/index';
import { type AmbienteEmMemoria, criarAmbienteEmMemoria, RAIZ } from './ambiente';
import { documentoDoCaso, lerCaso } from './casos';

const PASTA = path.join(RAIZ, 'packages/agente/roteiros');
const ler = (nome: string): Roteiro => JSON.parse(readFileSync(path.join(PASTA, `${nome}.json`), 'utf8')) as Roteiro;
const abertos: AmbienteEmMemoria[] = [];
afterAll(() => {
  for (const a of abertos) a.fechar();
});

describe('roteiros entregues com o pacote do agente', () => {
  it('todo roteiro tem nome, descrição, entrada válida e passos', () => {
    const arquivos = readdirSync(PASTA).filter((n) => n.endsWith('.json'));
    expect(arquivos.sort()).toEqual(['ajuste-titulo.json', 'briefing-dois-formatos.json']);
    for (const arquivo of arquivos) {
      const r = ler(arquivo.replace('.json', ''));
      expect(r.nome, arquivo).toBe(arquivo.replace('.json', ''));
      expect(r.descricao?.length ?? 0, arquivo).toBeGreaterThan(40);
      expect(EntradaDaTarefa.safeParse(r.entrada).success, arquivo).toBe(true);
      expect(r.passos.length, arquivo).toBeGreaterThan(1);
      expect(
        r.passos.every((p) => (p.duracaoMs ?? 0) > 0),
        `${arquivo}: todo passo tem duração, para simular a espera`,
      ).toBe(true);
    }
  });

  it('briefing de dois formatos: pede o "pode", passa por todas as etapas e entrega conferido, sem erro de verificação', async () => {
    const roteiro = ler('briefing-dois-formatos');
    const entrada = EntradaDaTarefa.parse(roteiro.entrada);
    const modelo = criarModeloRoteirizado(roteiro);
    const amb = await criarAmbienteEmMemoria({ modelo, novoId: idsDoRoteiro(roteiro), comBancoDeImagens: false });
    abertos.push(amb);
    let pediu = 0;
    const { preparo, resultado } = await rodarTarefa(amb, entrada, {
      confirmar: () => {
        pediu++;
        return 'pode';
      },
    });
    expect(pediu).toBe(1);
    expect(preparo?.motivos).toEqual(['varias_pranchetas']);
    expect(preparo?.cartao?.conceito).toContain('7h');
    expect(resultado).toMatchObject({ fim: 'entregue', conferida: true, lotes: 5 });
    expect(modelo.restantes()).toBe(0);
    expect(resultado.entrega.pendencias).toHaveLength(1);
    expect(resultado.entrega.pendencias[0]).toMatchObject({ tipo: 'outro', origem: 'otto' });
    expect(amb.verificarAgora().filter((a) => a.gravidade === 'erro')).toEqual([]);
    const etapas = amb.registro.flatMap((r) =>
      r.evento.tipo === 'etapa' ? [`${r.evento.etapa}${r.evento.prancheta ? `:${r.evento.prancheta.nome}` : ''}${r.evento.rodada ? ` ${r.evento.rodada}` : ''}`] : [],
    );
    expect(etapas).toEqual(['leitura', 'direcao', 'producao:Feed', 'conferencia', 'producao:Story', 'conferencia', 'producao:Story', 'conferencia', 'revisao', 'ajustes', 'conferencia 2', 'entrega']);
    // a verificação acusou e o Otto corrigiu: o painel tem o que mostrar no registro fechado
    expect(amb.registro.flatMap((r) => (r.evento.tipo === 'verificacao' ? [r.evento.novos] : []))).toEqual([6, 0, 0]);
    expect(amb.documento().pranchetas.map((p) => `${p.nome} ${p.largura}×${p.altura}`)).toEqual(['Feed 1080×1350', 'Story 1080×1920']);
  }, 60_000);

  it('ajuste gravado com o modelo de verdade: duas chamadas, um lote, entrega com a pendência de contraste', async () => {
    const roteiro = ler('ajuste-titulo');
    const modelo = criarModeloRoteirizado(roteiro);
    const amb = await criarAmbienteEmMemoria({ modelo, novoId: idsDoRoteiro(roteiro), documento: documentoDoCaso(lerCaso('ajuste-titulo-em-destaque')), comBancoDeImagens: false });
    abertos.push(amb);
    const { resultado, preparo } = await rodarTarefa(amb, EntradaDaTarefa.parse(roteiro.entrada));
    expect(preparo?.pedeConfirmacao).toBe(false);
    expect(resultado).toMatchObject({ fim: 'entregue', conferida: true, lotes: 1 });
    expect(resultado.custo.chamadas).toBe(2);
    expect(resultado.entrega.pendencias.some((p) => p.regra === 'contraste')).toBe(true);
    expect(modelo.restantes()).toBe(0);
  }, 60_000);
});
