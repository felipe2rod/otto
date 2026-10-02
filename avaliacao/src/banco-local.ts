// Banco de imagens local, para avaliar sem rede e sem chave: serve as fotos de banco que as rodadas da POC
// já tinham baixado (poc/dados/arquivos, fora do git), cada uma com autor, licença e endereço de origem.
// É material licenciado para isso, não arquivo de cliente (ADR 031, item 3).
//
// A busca é por etiqueta: as etiquetas saem do endereço de origem da foto. O agente busca em inglês e as
// etiquetas estão em português; um vocabulário curto faz a ponte. Com outro banco, troque este adaptador:
// a porta é BancoDeImagens, de @otto/agente.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { BancoDeImagens, ImagemEncontrada, ImagemParaOModelo } from '../../packages/agente/src/index';

interface MetaDeArquivo {
  hash: string;
  tipo: string;
  largura: number;
  altura: number;
  origem?: { banco: string; autor: string; licenca: string; url: string };
}

const semAcento = (t: string): string => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Inglês da busca → etiquetas em português das fotos. */
const VOCABULARIO: Record<string, string[]> = {
  coffee: ['cafe'],
  cup: ['copo', 'xicara', 'xicaras', 'caneca'],
  mug: ['caneca', 'copo'],
  latte: ['leite', 'cappuccino'],
  espresso: ['espresso', 'cafe'],
  beans: ['graos'],
  cafe: ['cafeteria', 'cafe'],
  drink: ['bebida'],
  steam: ['fumegante', 'vapor'],
  saxophone: ['saxofone', 'saxofonista'],
  sax: ['saxofone'],
  saxophonist: ['saxofonista', 'musico'],
  music: ['musica', 'musical'],
  musician: ['musico', 'saxofonista', 'artista'],
  instrument: ['instrumento', 'instrumentos'],
  concert: ['show'],
  running: ['corrida', 'correr'],
  run: ['correr', 'corrida'],
  shoe: ['sapato', 'sapatos', 'tenis', 'sapatilha', 'calcado', 'calcados'],
  shoes: ['sapato', 'sapatos', 'tenis', 'sapatilha', 'calcado', 'calcados'],
  sneaker: ['tenis', 'sapatilha'],
  sneakers: ['tenis', 'sapatilha'],
  sport: ['esporte', 'esportivos', 'desportivo'],
  sports: ['esporte', 'esportivos', 'desportivo'],
  sole: ['solas', 'solados', 'unico'],
  house: ['casa', 'mansao'],
  home: ['casa'],
  cabin: ['cabine', 'casa'],
  forest: ['floresta', 'madeira'],
  wood: ['madeira'],
  architecture: ['arquitetura', 'edificio'],
  modern: ['moderno', 'arquitetura'],
  building: ['edificio', 'construcao'],
  luxury: ['luxo', 'mansao'],
  bread: ['pao', 'bread', 'loaf'],
  bakery: ['pao'],
  wheat: ['trigo'],
  burger: ['hamburguer', 'burger'],
  hamburger: ['hamburguer'],
  food: ['comida'],
  mother: ['mae', 'maternidade'],
  mom: ['mae', 'maternidade'],
  baby: ['bebe'],
  family: ['familia'],
  fire: ['incendio', 'fogueira', 'chama'],
  bonfire: ['fogueira'],
  smoke: ['fumaca', 'nevoa'],
  texture: ['textura'],
  woman: ['senhora', 'femea'],
  black: ['preto'],
  white: ['branco'],
  red: ['vermelho'],
  green: ['verde'],
};

function etiquetasDe(url: string): string[] {
  const ultimo = decodeURIComponent(url.replace(/\/+$/, '').split('/').at(-1) ?? '').replace(/-\d+$/, '');
  return ultimo.split('-').filter(Boolean);
}

export interface BancoLocal extends BancoDeImagens {
  /** Quantas fotos o banco tem. Zero: a pasta não existe nesta máquina. */
  readonly total: number;
  /** Bytes de um arquivo já trazido (ou de qualquer arquivo da pasta), pelo hash. */
  bytes(hash: string): Uint8Array | undefined;
}

export function criarBancoLocal(pasta: string, previa: (bytes: Uint8Array) => ImagemParaOModelo | undefined): BancoLocal {
  const fotos: { meta: MetaDeArquivo; etiquetas: string[]; busca: Set<string> }[] = [];
  if (existsSync(pasta)) {
    for (const nome of readdirSync(pasta).sort()) {
      if (!nome.endsWith('.json')) continue;
      try {
        const meta = JSON.parse(readFileSync(path.join(pasta, nome), 'utf8')) as MetaDeArquivo;
        if (!meta.origem?.url || !/^image\/(jpeg|png|webp)$/.test(meta.tipo) || !existsSync(path.join(pasta, meta.hash))) continue;
        // só foto de banco: textura gerada, captura de site e envio de designer não são resultado de busca
        if (!/pixabay/i.test(meta.origem.banco)) continue;
        const etiquetas = etiquetasDe(meta.origem.url);
        fotos.push({ meta, etiquetas, busca: new Set(etiquetas.map(semAcento)) });
      } catch {
        // meta ilegível: a foto fica fora do banco
      }
    }
  }
  const bytes = (hash: string): Uint8Array | undefined => {
    const arquivo = path.join(pasta, hash);
    return /^[0-9a-f]{64}$/.test(hash) && existsSync(arquivo) ? new Uint8Array(readFileSync(arquivo)) : undefined;
  };
  return {
    total: fotos.length,
    bytes,
    async buscar(consulta, orientacao) {
      const termos = semAcento(consulta)
        .split(/[^a-z0-9]+/)
        .filter((t) => t.length > 1);
      const pontuadas = fotos
        .map((f) => {
          const pontos = termos.filter((t) => f.busca.has(t) || (VOCABULARIO[t] ?? []).some((pt) => f.busca.has(pt))).length;
          return { f, pontos };
        })
        .filter(({ f, pontos }) => pontos > 0 && (orientacao === 'horizontal' ? f.meta.largura > f.meta.altura : orientacao === 'vertical' ? f.meta.altura > f.meta.largura : true))
        .sort((a, b) => b.pontos - a.pontos || a.f.meta.hash.localeCompare(b.f.meta.hash));
      return pontuadas
        .slice(0, 12)
        .map(({ f }): ImagemEncontrada => ({ id: f.meta.hash.slice(0, 12), descricao: f.etiquetas.join(', '), largura: f.meta.largura, altura: f.meta.altura, autor: f.meta.origem?.autor ?? '' }));
    },
    async trazer(id) {
      const foto = fotos.find((f) => f.meta.hash.startsWith(id));
      if (!foto) throw new Error(`a imagem "${id}" não está nos resultados de busca desta tarefa`);
      const { meta } = foto;
      const conteudo = bytes(meta.hash);
      const vista = conteudo ? previa(conteudo) : undefined;
      return {
        no: { tipo: 'imagem', arquivo: meta.hash, larguraOriginal: meta.largura, alturaOriginal: meta.altura, ajuste: 'cobrir', origem: meta.origem },
        largura: meta.largura,
        altura: meta.altura,
        ...(vista ? { previa: vista } : {}),
      };
    },
  };
}
