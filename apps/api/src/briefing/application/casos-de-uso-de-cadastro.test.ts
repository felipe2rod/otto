import { randomUUID } from 'node:crypto';
import { CODIGOS_DE_ERRO, lerContaId, Marca } from '@otto/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { RepositorioDeArquivosEmMemoria } from '../../arquivo/infrastructure/memoria/repositorio-de-arquivos-em-memoria';
import { ErroDaAplicacao } from '../../plataforma/erros/erro-da-aplicacao';
import { EscopoDaConta } from '../../plataforma/escopo/escopo-da-conta';
import { type EventoDeUso, RegistroDeUso } from '../../plataforma/uso/registro-de-uso';
import { RepositorioDeCadastrosEmMemoria } from '../infrastructure/memoria/repositorio-de-cadastros-em-memoria';
import { CasosDeUsoDeCadastro } from './casos-de-uso-de-cadastro';

const contaA = EscopoDaConta.abrir(lerContaId('01990000-0000-7000-8000-00000000000a'));
const contaB = EscopoDaConta.abrir(lerContaId('01990000-0000-7000-8000-00000000000b'));
const AGORA = new Date('2026-10-04T12:00:00.000Z');
const hash = () => randomUUID().replaceAll('-', '').repeat(2);

class UsoEspiao extends RegistroDeUso {
  eventos: EventoDeUso[] = [];
  registrar(_escopo: EscopoDaConta, evento: EventoDeUso): void {
    this.eventos.push(evento);
  }
}

let arquivos: RepositorioDeArquivosEmMemoria;
let uso: UsoEspiao;
let casos: CasosDeUsoDeCadastro;
let limites: { marcas: number; briefings: number };

async function arquivoDe(escopo: EscopoDaConta, especie: 'imagem' | 'vetor' = 'vetor'): Promise<string> {
  const sha256 = hash();
  await arquivos.registrar(escopo, {
    id: randomUUID(),
    sha256,
    tipoMime: especie === 'vetor' ? 'image/svg+xml' : 'image/png',
    bytes: 10,
    largura: especie === 'vetor' ? null : 800,
    altura: especie === 'vetor' ? null : 600,
    especie,
    chaveDoObjeto: `x/${sha256}`,
  });
  return sha256;
}

async function erroDe(promessa: Promise<unknown>): Promise<ErroDaAplicacao> {
  try {
    await promessa;
  } catch (e) {
    if (e instanceof ErroDaAplicacao) return e;
    throw e;
  }
  throw new Error('esperava ErroDaAplicacao');
}

beforeEach(() => {
  arquivos = new RepositorioDeArquivosEmMemoria();
  uso = new UsoEspiao();
  limites = { marcas: 3, briefings: 3 };
  casos = new CasosDeUsoDeCadastro({ cadastros: new RepositorioDeCadastrosEmMemoria(), arquivos, gerarId: randomUUID, agora: () => AGORA, uso, limites });
});

describe('marcas', () => {
  it('cria, lista, abre, troca e apaga, no formato do contrato', async () => {
    const logo = await arquivoDe(contaA);
    const criada = Marca.parse(
      await casos.criarMarca(contaA, { nome: 'Café Aurora', cores: { primaria: '#0f3b2c' }, logo: { arquivo: logo }, icones: [{ arquivo: logo }], restricoes: ['nunca foto de pessoa'] }),
    );
    expect(criada).toMatchObject({
      nome: 'Café Aurora',
      cores: { primaria: '#0f3b2c' },
      logo: { arquivo: logo },
      icones: [{ arquivo: logo }],
      restricoes: ['nunca foto de pessoa'],
      criadaEm: AGORA.toISOString(),
    });
    expect((await casos.listarMarcas(contaA)).itens).toEqual([criada]);
    expect(await casos.obterMarca(contaA, criada.id)).toEqual(criada);
    const trocada = await casos.substituirMarca(contaA, criada.id, { nome: 'Aurora' });
    expect(trocada).toEqual({ id: criada.id, nome: 'Aurora', criadaEm: criada.criadaEm, alteradaEm: AGORA.toISOString() });
    await casos.apagarMarca(contaA, criada.id);
    expect((await erroDe(casos.obterMarca(contaA, criada.id))).codigo).toBe(CODIGOS_DE_ERRO.naoEncontrado);
  });

  it('marca sem identidade não ganha cor nem fonte padrão', async () => {
    const criada = await casos.criarMarca(contaA, { nome: 'Sem identidade' });
    expect(Object.keys(criada).sort()).toEqual(['alteradaEm', 'criadaEm', 'id', 'nome']);
  });

  it('logo e ícone precisam ser arquivos DA CONTA: o hash de arquivo de outra conta é recusado', async () => {
    const deB = await arquivoDe(contaB);
    expect(await erroDe(casos.criarMarca(contaA, { nome: 'x', logo: { arquivo: deB } }))).toMatchObject({ codigo: CODIGOS_DE_ERRO.arquivoDesconhecido, detalhe: { quantos: 1 } });
    expect(await erroDe(casos.criarMarca(contaA, { nome: 'x', icones: [{ arquivo: deB }, { arquivo: hash() }] }))).toMatchObject({
      codigo: CODIGOS_DE_ERRO.arquivoDesconhecido,
      detalhe: { quantos: 2 },
    });
    const criada = await casos.criarMarca(contaA, { nome: 'x' });
    expect((await erroDe(casos.substituirMarca(contaA, criada.id, { nome: 'x', logo: { arquivo: deB } }))).codigo).toBe(CODIGOS_DE_ERRO.arquivoDesconhecido);
    expect((await casos.listarMarcas(contaA)).itens).toHaveLength(1);
  });

  it('a marca de A não existe para B: abrir, trocar e apagar respondem "não encontrado", e nada muda', async () => {
    const deA = await casos.criarMarca(contaA, { nome: 'Segredo de A' });
    for (const tentativa of [casos.obterMarca(contaB, deA.id), casos.substituirMarca(contaB, deA.id, { nome: 'tomada' }), casos.apagarMarca(contaB, deA.id)])
      expect((await erroDe(tentativa)).codigo).toBe(CODIGOS_DE_ERRO.naoEncontrado);
    expect((await casos.listarMarcas(contaB)).itens).toEqual([]);
    expect((await casos.obterMarca(contaA, deA.id)).nome).toBe('Segredo de A');
  });

  it('o limite de marcas responde 429 com o limite', async () => {
    for (const n of ['a', 'b', 'c']) await casos.criarMarca(contaA, { nome: n });
    expect(await erroDe(casos.criarMarca(contaA, { nome: 'd' }))).toMatchObject({ codigo: CODIGOS_DE_ERRO.limiteDeCadastros, detalhe: { limite: 3 } });
  });

  it('o evento de uso diz o que a marca tem, em contagens: nome, cores e restrições não saem', async () => {
    const logo = await arquivoDe(contaA);
    const criada = await casos.criarMarca(contaA, {
      nome: 'SENTINELA-NOME',
      cores: { primaria: '#a1b2c3' },
      fonteDeTitulo: 'Anton',
      logo: { arquivo: logo },
      rodape: 'SENTINELA-RODAPE',
      restricoes: ['SENTINELA-RESTRICAO'],
    });
    await casos.apagarMarca(contaA, criada.id);
    expect(uso.eventos).toEqual([
      { evento: 'marca_salva', marcaId: criada.id, nova: true, cores: 1, fontes: 1, comLogo: true, icones: 0, restricoes: 1 },
      { evento: 'marca_apagada', marcaId: criada.id },
    ]);
    expect(JSON.stringify(uso.eventos)).not.toMatch(/SENTINELA|a1b2c3|Anton/);
  });
});

describe('briefings salvos', () => {
  const dados = { versao: 1 as const, formatos: [{ nome: 'Feed', largura: 1080, altura: 1350 }], textos: { rodape: '@cafeaurora' } };

  it('cria, lista sem os dados, abre com eles, troca e apaga', async () => {
    const marca = await casos.criarMarca(contaA, { nome: 'Café Aurora' });
    const criado = await casos.criarBriefing(contaA, { nome: 'Promoção da semana', dados: { ...dados, marcaId: marca.id }, cuidado: 'direto' });
    expect(criado).toMatchObject({ nome: 'Promoção da semana', dados: { ...dados, marcaId: marca.id }, cuidado: 'direto', usos: 0 });
    expect((await casos.listarBriefings(contaA)).itens).toEqual([{ id: criado.id, nome: 'Promoção da semana', marcaId: marca.id, usos: 0, alteradoEm: AGORA.toISOString() }]);
    expect(await casos.obterBriefing(contaA, criado.id)).toEqual(criado);
    expect(await casos.substituirBriefing(contaA, criado.id, { nome: 'Outro', dados: { versao: 1 } })).toMatchObject({ nome: 'Outro', dados: { versao: 1 } });
    await casos.apagarBriefing(contaA, criado.id);
    expect((await erroDe(casos.obterBriefing(contaA, criado.id))).codigo).toBe(CODIGOS_DE_ERRO.naoEncontrado);
  });

  it('recusa marca que a conta não tem e arquivo que a conta não tem', async () => {
    const marcaDeB = await casos.criarMarca(contaB, { nome: 'de B' });
    expect((await erroDe(casos.criarBriefing(contaA, { nome: 'x', dados: { ...dados, marcaId: marcaDeB.id } }))).codigo).toBe(CODIGOS_DE_ERRO.marcaDesconhecida);
    const fotoDeB = await arquivoDe(contaB, 'imagem');
    expect(await erroDe(casos.criarBriefing(contaA, { nome: 'x', dados: { ...dados, imagens: { fonte: 'minhas', arquivos: [fotoDeB] } } }))).toMatchObject({
      codigo: CODIGOS_DE_ERRO.arquivoDesconhecido,
      detalhe: { quantos: 1 },
    });
    expect((await casos.listarBriefings(contaA)).itens).toEqual([]);
  });

  it('o briefing de A não existe para B', async () => {
    const deA = await casos.criarBriefing(contaA, { nome: 'Segredo de A', dados });
    for (const tentativa of [casos.obterBriefing(contaB, deA.id), casos.substituirBriefing(contaB, deA.id, { nome: 'tomado', dados }), casos.apagarBriefing(contaB, deA.id)])
      expect((await erroDe(tentativa)).codigo).toBe(CODIGOS_DE_ERRO.naoEncontrado);
    expect((await casos.obterBriefing(contaA, deA.id)).nome).toBe('Segredo de A');
  });

  it('limite por conta, e evento de uso sem conteúdo', async () => {
    for (const n of ['a', 'b', 'c']) await casos.criarBriefing(contaA, { nome: `SENTINELA-${n}`, dados });
    expect(await erroDe(casos.criarBriefing(contaA, { nome: 'd', dados }))).toMatchObject({ codigo: CODIGOS_DE_ERRO.limiteDeCadastros, detalhe: { limite: 3 } });
    expect(uso.eventos).toHaveLength(3);
    expect(uso.eventos[0]).toMatchObject({ evento: 'briefing_salvo', novo: true, formatos: 1, comMarca: false });
    expect(JSON.stringify(uso.eventos)).not.toMatch(/SENTINELA|cafeaurora/);
  });
});
