import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { lerContaId } from '@otto/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { CasosDeUsoDeArquivo } from '../../arquivo/application/casos-de-uso-de-arquivo';
import { ArmazenamentoEmMemoria } from '../../arquivo/infrastructure/adaptadores/memoria/armazenamento-em-memoria';
import { RepositorioDeArquivosEmMemoria } from '../../arquivo/infrastructure/memoria/repositorio-de-arquivos-em-memoria';
import { RepositorioDeDocumentosEmMemoria } from '../../documento/infrastructure/memoria/repositorio-de-documentos-em-memoria';
import { EscopoDaConta } from '../../plataforma/escopo/escopo-da-conta';
import { type ArquivoDaPoc, idDoDocumentoImportado, importarDocumentoDaPoc } from './importar-documento-da-poc';

const escopo = EscopoDaConta.abrir(lerContaId('01990000-0000-7000-8000-00000000000a'));
const PNG = readFileSync(path.resolve(import.meta.dirname, '../../../../../packages/render/recursos-de-teste/imagens/recorte-com-alfa.png'));
const SHA = createHash('sha256').update(PNG).digest('hex');

let documentos: RepositorioDeDocumentosEmMemoria;
let repositorioDeArquivos: RepositorioDeArquivosEmMemoria;
let deps: Parameters<typeof importarDocumentoDaPoc>[0];
const arquivosDaPoc = new Map<string, ArquivoDaPoc>([[SHA, { bytes: PNG, origem: { banco: 'Banco de teste', autor: 'fulano', licenca: 'licença de teste', url: 'https://exemplo.invalid/foto' } }]]);
const ler = async (hash: string) => arquivosDaPoc.get(hash);

beforeEach(() => {
  documentos = new RepositorioDeDocumentosEmMemoria();
  repositorioDeArquivos = new RepositorioDeArquivosEmMemoria();
  deps = {
    documentos,
    arquivos: new CasosDeUsoDeArquivo(repositorioDeArquivos, new ArmazenamentoEmMemoria(), randomUUID, { bytesPorArquivo: 25e6, ladoMaximoDeImagem: 12_000, megapixelsNoMaximo: 80 }),
  };
});

/** Um registro como a POC grava: documento com id e nome DENTRO da árvore, histórico e tarefas ao lado. */
const registroDaPoc = (filhos: object[] = []) => ({
  doc: {
    versaoDoFormato: 1,
    id: 'muj30q1zew0wex7b',
    nome: 'Promoção da semana (v2)',
    tokens: { cores: { primaria: '#ff5500' } },
    pranchetas: [{ id: 'p1', nome: 'Feed', tipo: 'prancheta', largura: 1080, altura: 1350, fundo: 'token:primaria', filhos }],
  },
  historico: [{ id: 'l1', antes: {}, operacoes: [] }],
  tarefas: [],
});
const foto = (arquivo: string) => ({ id: 'i1', nome: 'Foto', tipo: 'imagem', x: 0, y: 0, largura: 300, altura: 400, arquivo, larguraOriginal: 600, alturaOriginal: 800 });

describe('importarDocumentoDaPoc', () => {
  it('importa o documento na versão 0, com o nome que estava na árvore, e a árvore sem nome nem id', async () => {
    const r = await importarDocumentoDaPoc(deps, escopo, 'muj30q1zew0wex7b', registroDaPoc(), ler);
    expect(r).toEqual({ resultado: 'importado', id: idDoDocumentoImportado('muj30q1zew0wex7b'), familias: [] });
    const doc = await documentos.abrir(escopo, idDoDocumentoImportado('muj30q1zew0wex7b'));
    expect(doc).toMatchObject({ nome: 'Promoção da semana (v2)', versao: 0, pranchetas: 1 });
    expect(doc?.arvore).not.toHaveProperty('nome');
    expect(doc?.arvore).not.toHaveProperty('id');
    expect(doc?.arvore.tokens.cores).toEqual({ primaria: '#ff5500' });
  });

  it('o id importado é sempre o mesmo para o mesmo documento da POC, e é um UUID', () => {
    expect(idDoDocumentoImportado('abc')).toBe(idDoDocumentoImportado('abc'));
    expect(idDoDocumentoImportado('abc')).not.toBe(idDoDocumentoImportado('abd'));
    expect(idDoDocumentoImportado('abc')).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('traz os arquivos que o documento cita, com a origem (banco, autor, licença)', async () => {
    await importarDocumentoDaPoc(deps, escopo, 'x', registroDaPoc([foto(SHA)]), ler);
    expect(await repositorioDeArquivos.buscar(escopo, SHA)).toMatchObject({ sha256: SHA, tipoMime: 'image/png', largura: 600, altura: 800 });
  });

  it('diz as famílias de fonte que o documento usa', async () => {
    const texto = { id: 't1', nome: 'Título', tipo: 'texto', x: 0, y: 0, largura: 100, altura: 50, conteudo: 'Olá', fonte: 'Playfair Display', peso: 700, tamanho: 40, cor: '#000000' };
    const r = await importarDocumentoDaPoc(deps, escopo, 'x', registroDaPoc([texto]), ler);
    expect(r).toMatchObject({ resultado: 'importado', familias: ['Playfair Display'] });
  });

  it('importar de novo não duplica', async () => {
    await importarDocumentoDaPoc(deps, escopo, 'x', registroDaPoc(), ler);
    expect(await importarDocumentoDaPoc(deps, escopo, 'x', registroDaPoc(), ler)).toMatchObject({ resultado: 'ja_existia' });
    expect((await documentos.listar(escopo, { limite: 10 })).itens).toHaveLength(1);
  });

  it('arquivo citado que não existe na POC: recusa o documento inteiro e não cria nada', async () => {
    const r = await importarDocumentoDaPoc(deps, escopo, 'x', registroDaPoc([foto('f'.repeat(64))]), ler);
    expect(r).toEqual({ resultado: 'recusado', motivo: 'arquivo citado não está em poc/dados/arquivos' });
    expect((await documentos.listar(escopo, { limite: 10 })).itens).toEqual([]);
  });

  it('arquivo citado que não é imagem aceita: recusa', async () => {
    const hash = 'e'.repeat(64);
    const lerLixo = async (h: string) => (h === hash ? { bytes: Buffer.from('não sou imagem') } : undefined);
    expect(await importarDocumentoDaPoc(deps, escopo, 'x', registroDaPoc([foto(hash)]), lerLixo)).toEqual({ resultado: 'recusado', motivo: 'arquivo citado recusado: tipo_nao_aceito' });
  });

  it('árvore fora do esquema novo: recusa dizendo o campo, sem citar conteúdo', async () => {
    const torta = registroDaPoc([{ id: 'n1', nome: 'SEGREDO-DO-CLIENTE', tipo: 'forma', forma: 'estrela', x: 0, y: 0, largura: 10, altura: 10, preenchimento: '#000000' }]);
    const r = await importarDocumentoDaPoc(deps, escopo, 'x', torta, ler);
    expect(r.resultado).toBe('recusado');
    expect(r).toMatchObject({ motivo: expect.stringContaining('pranchetas.filhos') });
    expect(JSON.stringify(r)).not.toContain('SEGREDO-DO-CLIENTE');
  });

  it('o que não é um registro da POC é recusado', async () => {
    for (const lixo of [null, 'texto', 42, {}, { doc: 'x' }]) expect((await importarDocumentoDaPoc(deps, escopo, 'x', lixo, ler)).resultado).toBe('recusado');
  });

  it('nome ausente ou vazio vira o nome padrão; nome longo é cortado', async () => {
    const semNome = registroDaPoc();
    (semNome.doc as { nome?: string }).nome = '   ';
    await importarDocumentoDaPoc(deps, escopo, 'a', semNome, ler);
    expect((await documentos.abrir(escopo, idDoDocumentoImportado('a')))?.nome).toBe('Sem título');
    const longo = registroDaPoc();
    longo.doc.nome = 'x'.repeat(300);
    await importarDocumentoDaPoc(deps, escopo, 'b', longo, ler);
    expect((await documentos.abrir(escopo, idDoDocumentoImportado('b')))?.nome).toHaveLength(120);
  });
});
