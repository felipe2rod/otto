import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { CODIGOS_DE_ERRO, ImagemTrazida, lerContaId, ResultadoDaBuscaDeImagens } from '@otto/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { CasosDeUsoDeArquivo } from '../../arquivo/application/casos-de-uso-de-arquivo';
import { ArmazenamentoEmMemoria } from '../../arquivo/infrastructure/adaptadores/memoria/armazenamento-em-memoria';
import { RepositorioDeArquivosEmMemoria } from '../../arquivo/infrastructure/memoria/repositorio-de-arquivos-em-memoria';
import { ErroDaAplicacao } from '../../plataforma/erros/erro-da-aplicacao';
import { EscopoDaConta } from '../../plataforma/escopo/escopo-da-conta';
import { type EventoDeUso, RegistroDeUso } from '../../plataforma/uso/registro-de-uso';
import { BancoDeMentira } from '../infrastructure/adaptadores/memoria/banco-de-mentira';
import { CacheDeBuscasEmMemoria } from '../infrastructure/memoria/cache-de-buscas-em-memoria';
import { BancoIndisponivel } from './banco-de-imagens';
import { CasosDeUsoDeImagens } from './casos-de-uso-de-imagens';

const contaA = EscopoDaConta.abrir(lerContaId('01990000-0000-7000-8000-00000000000a'));
const contaB = EscopoDaConta.abrir(lerContaId('01990000-0000-7000-8000-00000000000b'));
const JPEG = new Uint8Array(readFileSync(path.resolve(import.meta.dirname, '../../../../../packages/render/recursos-de-teste/imagens/foto-paisagem.jpg')));
const HORA = 3_600_000;

class UsoEspiao extends RegistroDeUso {
  eventos: EventoDeUso[] = [];
  registrar(_escopo: EscopoDaConta, evento: EventoDeUso): void {
    this.eventos.push(evento);
  }
}

let banco: BancoDeMentira;
let armazenamento: ArmazenamentoEmMemoria;
let registros: RepositorioDeArquivosEmMemoria;
let uso: UsoEspiao;
let relogio: Date;
let casos: CasosDeUsoDeImagens;

function montar(extra: { semBanco?: boolean; trazidasPorDia?: number; buscasNovasPorMinuto?: number } = {}): void {
  casos = new CasosDeUsoDeImagens({
    ...(extra.semBanco ? {} : { banco }),
    cache: new CacheDeBuscasEmMemoria(),
    arquivos: new CasosDeUsoDeArquivo(registros, armazenamento, randomUUID, { bytesPorArquivo: 5 * 1024 * 1024, ladoMaximoDeImagem: 12_000, megapixelsNoMaximo: 80 }),
    registros,
    agora: () => relogio,
    uso,
    limites: { trazidasPorDia: extra.trazidasPorDia ?? 50, buscasNovasPorMinuto: extra.buscasNovasPorMinuto ?? 20 },
  });
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
  banco = new BancoDeMentira(JPEG);
  armazenamento = new ArmazenamentoEmMemoria();
  registros = new RepositorioDeArquivosEmMemoria();
  uso = new UsoEspiao();
  // o relógio de verdade: o registro de arquivos em memória carimba a hora dele, e o teto do dia compara as duas
  relogio = new Date();
  montar();
});

describe('buscar', () => {
  it('devolve os resultados com a origem e a prévia por rota nossa; nenhum endereço do banco sai', async () => {
    const r = ResultadoDaBuscaDeImagens.parse(await casos.buscar(contaA, { consulta: 'café', orientacao: 'todas' }, 'editor'));
    expect(r.banco).toEqual({ id: 'banco-de-mentira', nome: 'Banco de mentira', licenca: 'Licença de mentira', ladoMaximo: 1280 });
    expect(r.itens).toEqual([
      {
        banco: 'banco-de-mentira',
        id: '1001',
        descricao: 'café, xícara, mesa',
        largura: 1280,
        altura: 853,
        autor: 'fulana',
        pagina: 'https://banco-de-mentira.invalid/fotos/1001/',
        previa: '/api/imagens/banco-de-mentira/1001/previa',
      },
      {
        banco: 'banco-de-mentira',
        id: '1002',
        descricao: 'grãos de café',
        largura: 853,
        altura: 1280,
        autor: 'beltrano',
        pagina: 'https://banco-de-mentira.invalid/fotos/1002/',
        previa: '/api/imagens/banco-de-mentira/1002/previa',
      },
    ]);
    expect(JSON.stringify(r)).not.toMatch(/\/get\/|_1280|_640/);
  });

  it('a segunda busca igual em 24 horas não chama o banco de imagens, nem de outra conta', async () => {
    await casos.buscar(contaA, { consulta: 'café', orientacao: 'todas' }, 'editor');
    relogio = new Date(relogio.getTime() + 23 * HORA);
    const segunda = await casos.buscar(contaA, { consulta: 'café', orientacao: 'todas' }, 'editor');
    await casos.buscar(contaB, { consulta: 'café', orientacao: 'todas' }, 'otto');
    expect(banco.buscas).toHaveLength(1);
    expect(segunda.itens).toHaveLength(2);
    // passadas as 24 horas, busca de novo
    relogio = new Date(relogio.getTime() + 2 * HORA);
    await casos.buscar(contaA, { consulta: 'café', orientacao: 'todas' }, 'editor');
    expect(banco.buscas).toHaveLength(2);
  });

  it('maiúscula, acento solto e espaço a mais não fazem busca nova; orientação diferente faz', async () => {
    await casos.buscar(contaA, { consulta: 'Café  Coado', orientacao: 'todas' }, 'editor');
    await casos.buscar(contaA, { consulta: '  café coado ', orientacao: 'todas' }, 'editor');
    expect(banco.buscas).toEqual([{ consulta: 'café coado', orientacao: 'todas' }]);
    await casos.buscar(contaA, { consulta: 'café coado', orientacao: 'vertical' }, 'editor');
    expect(banco.buscas).toHaveLength(2);
  });

  it('consulta vazia é pedido inválido, e a consulta longa é cortada em 100 caracteres', async () => {
    expect(await erroDe(casos.buscar(contaA, { consulta: '   ', orientacao: 'todas' }, 'editor'))).toMatchObject({ codigo: CODIGOS_DE_ERRO.pedidoInvalido, detalhe: { campos: ['q'] } });
    await casos.buscar(contaA, { consulta: 'x'.repeat(300), orientacao: 'todas' }, 'editor');
    expect(banco.buscas[0]?.consulta).toHaveLength(100);
  });

  it('banco fora do ar ou não configurado responde "indisponível", sem dizer o motivo do banco', async () => {
    banco.falha = new BancoIndisponivel('credencial');
    expect(await erroDe(casos.buscar(contaA, { consulta: 'café', orientacao: 'todas' }, 'editor'))).toMatchObject({ codigo: CODIGOS_DE_ERRO.bancoDeImagensIndisponivel });
    montar({ semBanco: true });
    expect((await erroDe(casos.buscar(contaA, { consulta: 'café', orientacao: 'todas' }, 'editor'))).codigo).toBe(CODIGOS_DE_ERRO.bancoDeImagensIndisponivel);
    expect((await erroDe(casos.trazer(contaA, { banco: 'banco-de-mentira', id: '1001' }, 'editor'))).codigo).toBe(CODIGOS_DE_ERRO.bancoDeImagensIndisponivel);
  });

  it('a conta tem um teto de buscas NOVAS por minuto (o que vem do cache não conta); outra conta não é afetada', async () => {
    montar({ buscasNovasPorMinuto: 2 });
    await casos.buscar(contaA, { consulta: 'um', orientacao: 'todas' }, 'editor');
    await casos.buscar(contaA, { consulta: 'dois', orientacao: 'todas' }, 'editor');
    await casos.buscar(contaA, { consulta: 'um', orientacao: 'todas' }, 'editor');
    expect(await erroDe(casos.buscar(contaA, { consulta: 'três', orientacao: 'todas' }, 'editor'))).toMatchObject({ codigo: CODIGOS_DE_ERRO.limiteDeImagens, detalhe: { limite: 2 } });
    expect(banco.buscas).toHaveLength(2);
    await casos.buscar(contaB, { consulta: 'três', orientacao: 'todas' }, 'editor');
    relogio = new Date(relogio.getTime() + 61_000);
    await casos.buscar(contaA, { consulta: 'quatro', orientacao: 'todas' }, 'editor');
    expect(banco.buscas).toHaveLength(4);
  });

  it('o evento de uso diz banco, quantos resultados e se veio do cache; o texto da busca não entra', async () => {
    await casos.buscar(contaA, { consulta: 'SENTINELA-DA-BUSCA', orientacao: 'todas' }, 'otto');
    await casos.buscar(contaA, { consulta: 'SENTINELA-DA-BUSCA', orientacao: 'todas' }, 'editor');
    expect(uso.eventos).toEqual([
      { evento: 'imagens_buscadas', banco: 'banco-de-mentira', origem: 'otto', resultados: 2, doCache: false, duracaoMs: expect.any(Number) },
      { evento: 'imagens_buscadas', banco: 'banco-de-mentira', origem: 'editor', resultados: 2, doCache: true, duracaoMs: expect.any(Number) },
    ]);
    expect(JSON.stringify(uso.eventos)).not.toMatch(/sentinela/i);
  });
});

describe('trazer', () => {
  const buscar = () => casos.buscar(contaA, { consulta: 'café', orientacao: 'todas' }, 'editor');

  it('baixa a imagem para o armazenamento da conta, com banco, id, autor, licença e página guardados', async () => {
    await buscar();
    const r = ImagemTrazida.parse(await casos.trazer(contaA, { banco: 'banco-de-mentira', id: '1001' }, 'editor'));
    expect(r).toMatchObject({
      tipo: 'image/jpeg',
      bytes: JPEG.byteLength,
      origem: { banco: 'Banco de mentira', autor: 'fulana', licenca: 'Licença de mentira', pagina: 'https://banco-de-mentira.invalid/fotos/1001/' },
    });
    expect(banco.baixados).toEqual(['https://banco-de-mentira.invalid/get/1001_1280.jpg']);
    const registro = await registros.buscar(contaA, r.sha256);
    expect(registro?.origem).toEqual({ banco: 'Banco de mentira', idExterno: '1001', autor: 'fulana', licenca: 'Licença de mentira', url: 'https://banco-de-mentira.invalid/fotos/1001/' });
    expect(await armazenamento.ler(contaA, registro?.chaveDoObjeto as string)).toEqual(JPEG);
  });

  it('o nó para o documento nunca guarda endereço do banco de imagens: só o hash e a origem em texto', async () => {
    await buscar();
    const r = await casos.trazer(contaA, { banco: 'banco-de-mentira', id: '1001' }, 'editor');
    // as medidas são as do arquivo que chegou, lidas do conteúdo, não as que o banco declarou
    expect(r.no).toEqual({
      tipo: 'imagem',
      arquivo: r.sha256,
      larguraOriginal: r.largura,
      alturaOriginal: r.altura,
      origem: { banco: 'Banco de mentira', autor: 'fulana', licenca: 'Licença de mentira', url: '' },
    });
    expect(JSON.stringify(r.no)).not.toMatch(/https?:|invalid/);
  });

  it('trazer com id que não veio de busca é recusado, e o banco nem é chamado', async () => {
    await buscar();
    expect((await erroDe(casos.trazer(contaA, { banco: 'banco-de-mentira', id: '9999' }, 'editor'))).codigo).toBe(CODIGOS_DE_ERRO.imagemNaoBuscada);
    expect((await erroDe(casos.trazer(contaA, { banco: 'outro-banco', id: '1001' }, 'editor'))).codigo).toBe(CODIGOS_DE_ERRO.imagemNaoBuscada);
    expect(banco.baixados).toEqual([]);
  });

  it('id de busca com mais de 24 horas não vale: os endereços do banco vencem', async () => {
    await buscar();
    relogio = new Date(relogio.getTime() + 25 * HORA);
    expect((await erroDe(casos.trazer(contaA, { banco: 'banco-de-mentira', id: '1001' }, 'editor'))).codigo).toBe(CODIGOS_DE_ERRO.imagemNaoBuscada);
    expect(banco.baixados).toEqual([]);
  });

  it('o que chega do banco é tratado como qualquer envio: conteúdo que não é imagem é recusado e nada é guardado', async () => {
    banco = new BancoDeMentira(new TextEncoder().encode('<html>não sou imagem</html>'));
    montar();
    await buscar();
    expect((await erroDe(casos.trazer(contaA, { banco: 'banco-de-mentira', id: '1001' }, 'editor'))).codigo).toBe(CODIGOS_DE_ERRO.tipoNaoAceito);
    expect(await registros.contarTrazidosDesde(contaA, new Date(0))).toBe(0);
  });

  it('nada de trazer em massa: a conta tem um teto por dia', async () => {
    montar({ trazidasPorDia: 1 });
    await buscar();
    await casos.trazer(contaA, { banco: 'banco-de-mentira', id: '1001' }, 'editor');
    // a mesma imagem de novo não gasta o teto nem baixa outra vez... mas uma segunda, sim
    banco = new BancoDeMentira(JPEG);
    expect(await erroDe(casos.trazer(contaA, { banco: 'banco-de-mentira', id: '1002' }, 'editor'))).toMatchObject({ codigo: CODIGOS_DE_ERRO.limiteDeImagens, detalhe: { limite: 1 } });
    // a conta B tem o teto dela
    expect((await casos.trazer(contaB, { banco: 'banco-de-mentira', id: '1002' }, 'editor')).sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('a imagem trazida por A é arquivo de A: B, que trouxe a mesma, tem o registro e o objeto dela', async () => {
    await buscar();
    const deA = await casos.trazer(contaA, { banco: 'banco-de-mentira', id: '1001' }, 'editor');
    expect(await registros.buscar(contaB, deA.sha256)).toBeUndefined();
    const deB = await casos.trazer(contaB, { banco: 'banco-de-mentira', id: '1001' }, 'otto');
    expect(deB.sha256).toBe(deA.sha256);
    expect((await registros.buscar(contaB, deB.sha256))?.chaveDoObjeto).not.toBe((await registros.buscar(contaA, deA.sha256))?.chaveDoObjeto);
  });

  it('o evento de uso diz bytes e medidas, e se a conta já tinha a imagem', async () => {
    await buscar();
    uso.eventos = [];
    await casos.trazer(contaA, { banco: 'banco-de-mentira', id: '1001' }, 'otto');
    await casos.trazer(contaA, { banco: 'banco-de-mentira', id: '1001' }, 'editor');
    expect(uso.eventos.filter((e) => e.evento === 'imagem_trazida')).toEqual([
      { evento: 'imagem_trazida', banco: 'banco-de-mentira', origem: 'otto', bytes: JPEG.byteLength, largura: expect.any(Number), altura: expect.any(Number), jaTinha: false },
      { evento: 'imagem_trazida', banco: 'banco-de-mentira', origem: 'editor', bytes: JPEG.byteLength, largura: expect.any(Number), altura: expect.any(Number), jaTinha: true },
    ]);
  });
});

describe('prévia', () => {
  it('só de resultado que veio de busca; os bytes saem pelo servidor', async () => {
    await casos.buscar(contaA, { consulta: 'café', orientacao: 'todas' }, 'editor');
    const previa = await casos.previa(contaA, 'banco-de-mentira', '1002');
    expect(previa).toEqual({ bytes: JPEG, tipo: 'image/jpeg' });
    expect(banco.baixados).toEqual(['https://banco-de-mentira.invalid/get/1002_640.jpg']);
    expect((await erroDe(casos.previa(contaA, 'banco-de-mentira', '9999'))).codigo).toBe(CODIGOS_DE_ERRO.naoEncontrado);
    expect((await erroDe(casos.previa(contaA, 'banco-de-mentira', '../../x'))).codigo).toBe(CODIGOS_DE_ERRO.naoEncontrado);
  });

  it('o que o banco devolve como prévia e não é imagem não é repassado ao navegador', async () => {
    banco = new BancoDeMentira(new TextEncoder().encode('<svg onload="alert(1)"></svg>'));
    montar();
    await casos.buscar(contaA, { consulta: 'café', orientacao: 'todas' }, 'editor');
    expect((await erroDe(casos.previa(contaA, 'banco-de-mentira', '1001'))).codigo).toBe(CODIGOS_DE_ERRO.naoEncontrado);
  });
});
