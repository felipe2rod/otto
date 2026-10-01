// Um .zip, escrito aqui: o formato é pequeno e a plataforma já traz a compressão (deflate) e o CRC-32.
// Só o que o pacote de exportação precisa: arquivos em memória, nomes em UTF-8, sem a extensão de 64 bits.
// Mesma entrada e mesma data, mesmos bytes.
import { crc32, deflateRawSync } from 'node:zlib';

export interface ArquivoDoZip {
  /** Caminho dentro do .zip, com "/" entre pastas. */
  nome: string;
  bytes: Uint8Array;
}

const LIMITE_DE_32_BITS = 0xffff_ffff;
const LIMITE_DE_ENTRADAS = 0xffff;
const VERSAO = 20;
/**
 * "Feito por": Unix (3) no byte de cima. O unzip do Linux só lê o nome como UTF-8 quando o arquivo se diz
 * feito no Unix (medido: dizendo-se feito no DOS, "Praça" saía trocado, mesmo com o bit de UTF-8). O Windows
 * e o macOS seguem o bit de UTF-8 de qualquer jeito.
 */
const FEITO_NO_UNIX = (3 << 8) | VERSAO;
/** Arquivo comum, leitura e escrita para o dono e leitura para os outros (0644): sem isto, extrair no Unix dá arquivo sem permissão. */
const ATRIBUTOS_DE_ARQUIVO_COMUM = (0o100644 << 16) >>> 0;
/** Bit 11: o nome está em UTF-8. */
const NOME_EM_UTF8 = 0x0800;
const ARMAZENADO = 0;
const COMPRIMIDO = 8;

/** Nome que não sai da pasta de quem extrai: relativo, sem "..", sem barra invertida, sem unidade de disco. */
function conferirNome(nome: string): void {
  const partes = nome.split('/');
  const ruim =
    nome.length === 0 ||
    nome.startsWith('/') ||
    nome.includes('\\') ||
    /^[A-Za-z]:/.test(nome) ||
    [...nome].some((c) => c.charCodeAt(0) < 0x20) ||
    partes.some((p) => p === '' || p === '.' || p === '..');
  if (ruim) throw new Error('nome de arquivo inválido para o .zip');
}

/** Data e hora no formato do DOS (resolução de 2 s), em UTC para não depender do fuso da máquina. */
function dataDoDos(quando: Date): { hora: number; data: number } {
  const ano = Math.min(2107, Math.max(1980, quando.getUTCFullYear()));
  return {
    hora: (quando.getUTCHours() << 11) | (quando.getUTCMinutes() << 5) | (quando.getUTCSeconds() >> 1),
    data: ((ano - 1980) << 9) | ((quando.getUTCMonth() + 1) << 5) | quando.getUTCDate(),
  };
}

export function montarZip(arquivos: readonly ArquivoDoZip[], quando: Date): Uint8Array {
  if (arquivos.length > LIMITE_DE_ENTRADAS) throw new Error('arquivos demais para um .zip sem a extensão de 64 bits');
  const nomes = new Set<string>();
  for (const a of arquivos) {
    if (a.bytes.byteLength > LIMITE_DE_32_BITS) throw new Error('arquivo grande demais para um .zip sem a extensão de 64 bits');
    conferirNome(a.nome);
    if (nomes.has(a.nome)) throw new Error('nome de arquivo repetido no .zip');
    nomes.add(a.nome);
  }
  const { hora, data } = dataDoDos(quando);
  const partes: Buffer[] = [];
  const diretorio: Buffer[] = [];
  let posicao = 0;

  for (const a of arquivos) {
    const nome = Buffer.from(a.nome, 'utf8');
    const original = Buffer.from(a.bytes.buffer, a.bytes.byteOffset, a.bytes.byteLength);
    const comprimido = original.byteLength > 0 ? deflateRawSync(original, { level: 3 }) : original;
    // o que não encolhe (PNG, fonte já comprimida) vai como está
    const [metodo, conteudo] = comprimido.byteLength < original.byteLength ? [COMPRIMIDO, comprimido] : [ARMAZENADO, original];
    const soma = crc32(original);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(VERSAO, 4);
    local.writeUInt16LE(NOME_EM_UTF8, 6);
    local.writeUInt16LE(metodo, 8);
    local.writeUInt16LE(hora, 10);
    local.writeUInt16LE(data, 12);
    local.writeUInt32LE(soma, 14);
    local.writeUInt32LE(conteudo.byteLength, 18);
    local.writeUInt32LE(original.byteLength, 22);
    local.writeUInt16LE(nome.byteLength, 26);
    local.writeUInt16LE(0, 28);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(FEITO_NO_UNIX, 4);
    central.writeUInt16LE(VERSAO, 6);
    central.writeUInt16LE(NOME_EM_UTF8, 8);
    central.writeUInt16LE(metodo, 10);
    central.writeUInt16LE(hora, 12);
    central.writeUInt16LE(data, 14);
    central.writeUInt32LE(soma, 16);
    central.writeUInt32LE(conteudo.byteLength, 20);
    central.writeUInt32LE(original.byteLength, 24);
    central.writeUInt16LE(nome.byteLength, 28);
    // 30 a 37: sem campo extra, sem comentário, disco 0, atributos internos 0
    central.writeUInt32LE(ATRIBUTOS_DE_ARQUIVO_COMUM, 38);
    central.writeUInt32LE(posicao, 42);

    partes.push(local, nome, conteudo);
    diretorio.push(central, nome);
    posicao += local.byteLength + nome.byteLength + conteudo.byteLength;
    if (posicao > LIMITE_DE_32_BITS) throw new Error('pacote grande demais para um .zip sem a extensão de 64 bits');
  }

  const tamanhoDoDiretorio = diretorio.reduce((soma, b) => soma + b.byteLength, 0);
  const fim = Buffer.alloc(22);
  fim.writeUInt32LE(0x06054b50, 0);
  fim.writeUInt16LE(arquivos.length, 8);
  fim.writeUInt16LE(arquivos.length, 10);
  fim.writeUInt32LE(tamanhoDoDiretorio, 12);
  fim.writeUInt32LE(posicao, 16);
  return Buffer.concat([...partes, ...diretorio, fim]);
}
