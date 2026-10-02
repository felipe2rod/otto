import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { CODIGOS_DE_ERRO, ListaDeTexturas, lerContaId, TexturaTrazida } from '@otto/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { CasosDeUsoDeArquivo } from '../../arquivo/application/casos-de-uso-de-arquivo';
import { ArmazenamentoEmMemoria } from '../../arquivo/infrastructure/adaptadores/memoria/armazenamento-em-memoria';
import { RepositorioDeArquivosEmMemoria } from '../../arquivo/infrastructure/memoria/repositorio-de-arquivos-em-memoria';
import { EscopoDaConta } from '../../plataforma/escopo/escopo-da-conta';
import { type EventoDeUso, RegistroDeUso } from '../../plataforma/uso/registro-de-uso';
import { CasosDeUsoDeTexturas } from './casos-de-uso-de-texturas';
import { GeradorDeTexturas, TEXTURAS } from './texturas';

const contaA = EscopoDaConta.abrir(lerContaId('01990000-0000-7000-8000-00000000000a'));
const contaB = EscopoDaConta.abrir(lerContaId('01990000-0000-7000-8000-00000000000b'));
const JPEG = new Uint8Array(readFileSync(path.resolve(import.meta.dirname, '../../../../../packages/render/recursos-de-teste/imagens/foto-paisagem.jpg')));

class GeradorDeMentira extends GeradorDeTexturas {
  geradas: string[] = [];
  async gerar(nome: string): Promise<Uint8Array> {
    this.geradas.push(nome);
    return JPEG;
  }
}
class UsoEspiao extends RegistroDeUso {
  eventos: EventoDeUso[] = [];
  registrar(_escopo: EscopoDaConta, evento: EventoDeUso): void {
    this.eventos.push(evento);
  }
}

let armazenamento: ArmazenamentoEmMemoria;
let registros: RepositorioDeArquivosEmMemoria;
let gerador: GeradorDeMentira;
let uso: UsoEspiao;
const montar = (comGerador = true) =>
  new CasosDeUsoDeTexturas({
    armazenamento,
    arquivos: new CasosDeUsoDeArquivo(registros, armazenamento, randomUUID, { bytesPorArquivo: 5 * 1024 * 1024, ladoMaximoDeImagem: 12_000, megapixelsNoMaximo: 80 }),
    uso,
    ...(comGerador ? { gerador } : {}),
  });

beforeEach(() => {
  armazenamento = new ArmazenamentoEmMemoria();
  registros = new RepositorioDeArquivosEmMemoria();
  gerador = new GeradorDeMentira();
  uso = new UsoEspiao();
});

describe('texturas do Otto', () => {
  it('lista as seis, com modo de mesclagem, opacidade e medidas, sem gerar nada', async () => {
    const lista = ListaDeTexturas.parse(montar().listar());
    expect(lista.itens.map((t) => t.nome)).toEqual(['papel', 'papel-amassado', 'reticula', 'grao-de-filme', 'poeira-e-arranhoes', 'concreto']);
    expect(lista.itens[0]).toEqual({ nome: 'papel', descricao: TEXTURAS[0]?.descricao, modoDeMesclagem: 'multiplicacao', opacidade: 0.6, largura: 1600, altura: 1600 });
    expect(gerador.geradas).toEqual([]);
  });

  it('trazer faz da textura um arquivo da conta e devolve o nó pronto, com o modo e a opacidade de costume', async () => {
    const r = TexturaTrazida.parse(await montar().trazer(contaA, 'papel'));
    expect(r.no).toMatchObject({ tipo: 'imagem', arquivo: r.sha256, modoDeMesclagem: 'multiplicacao', opacidade: 0.6, origem: { banco: 'Texturas do Otto', autor: 'Otto', url: '' } });
    expect((await registros.buscar(contaA, r.sha256))?.origem).toMatchObject({ banco: 'Texturas do Otto' });
    expect(await registros.buscar(contaB, r.sha256)).toBeUndefined();
    expect(uso.eventos.at(-1)).toEqual({ evento: 'textura_trazida', textura: 'papel' });
  });

  it('a textura é gerada uma vez e fica guardada na biblioteca: a segunda conta não gera de novo', async () => {
    await montar().trazer(contaA, 'concreto');
    await montar().trazer(contaB, 'concreto');
    await montar().trazer(contaA, 'concreto');
    expect(gerador.geradas).toEqual(['concreto']);
  });

  it('textura trazida não gasta o teto diário de imagens de banco da conta', async () => {
    await montar().trazer(contaA, 'papel');
    expect(await registros.contarTrazidosDesde(contaA, new Date(0))).toBe(0);
  });

  it('nome que não é textura é "não encontrado", e nunca vira caminho', async () => {
    for (const nome of ['inventada', '../../etc/passwd', 'papel/../concreto', '']) await expect(montar().trazer(contaA, nome)).rejects.toMatchObject({ codigo: CODIGOS_DE_ERRO.naoEncontrado });
    expect(gerador.geradas).toEqual([]);
  });

  it('sem gerador (a API não desenha) e sem a textura guardada: "não encontrado"; com ela guardada, traz', async () => {
    await expect(montar(false).trazer(contaA, 'reticula')).rejects.toMatchObject({ codigo: CODIGOS_DE_ERRO.naoEncontrado });
    await montar().preparar();
    expect(gerador.geradas).toHaveLength(6);
    expect((await montar(false).trazer(contaA, 'reticula')).sha256).toMatch(/^[0-9a-f]{64}$/);
    // preparar de novo não gera de novo
    await montar().preparar();
    expect(gerador.geradas).toHaveLength(6);
  });

  it('para o Otto: a lista já com o nó de cada textura, como a ferramenta listarTexturas espera', async () => {
    const lista = await montar().paraOOtto(contaA);
    expect(lista).toHaveLength(6);
    expect(lista[2]).toMatchObject({ nome: 'reticula', modoDeMesclagem: 'sobrepor', opacidade: 0.25, no: { tipo: 'imagem', larguraOriginal: expect.any(Number) } });
    expect(await registros.contarTrazidosDesde(contaA, new Date(0))).toBe(0);
  });
});
