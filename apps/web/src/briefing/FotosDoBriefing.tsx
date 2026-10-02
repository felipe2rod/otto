'use client';

// As fotos do briefing (docs/mvp/experiencia.md, 3.4): enviar do computador ou trazer do banco de
// imagens. Cada arquivo tem o próprio estado (enviando, enviada, não enviou), e a foto enviada já diz
// as medidas e QUANTO SERIA AMPLIADA em cada formato escolhido. A foto de 1280 px esticada a 210% foi
// o problema da POC: o designer precisa ver isso antes de enviar. Avisa, não bloqueia.
import { ampliacoesPorFormato, type FormatoDoBriefing, IMAGENS_POR_BRIEFING, type ImagemDoBanco, type ImagemTrazida, TIPOS_DE_IMAGEM } from '@otto/shared';
import { useEffect, useRef, useState } from 'react';
import { type ApiDeArquivos, enderecoDoArquivo } from '../api/arquivos';
import type { ApiDeImagens } from '../api/imagens';
import { fraseDoEnvio } from '../editor/envio';
import { BuscaDeImagens } from '../imagens/BuscaDeImagens';
import formulario from '../produto/Formulario.module.css';
import { briefing } from '../textos/briefing';
import { editor } from '../textos/editor';
import type { ImagemDoFormulario } from './formulario';
import estilos from './NovaPeca.module.css';

const textos = briefing.imagens;
/** O limite da API é 25 MB por arquivo; conferir aqui poupa o envio de um arquivo que será recusado. */
const LIMITE_EM_MB = 25;

interface Envio {
  id: number;
  nome: string;
  estado: 'enviando' | 'falhou';
  frase?: string;
  /** Presente quando dá para tentar de novo (falha do envio, não recusa do arquivo). */
  arquivo?: File;
}

export interface PropriedadesDasFotos {
  imagens: readonly ImagemDoFormulario[];
  formatos: readonly FormatoDoBriefing[];
  arquivos: Pick<ApiDeArquivos, 'enviarImagem' | 'dados'>;
  banco: ApiDeImagens;
  /** Recebe a lista de agora e devolve a nova: os envios terminam fora de ordem. */
  aoMudar(mudar: (imagens: ImagemDoFormulario[]) => ImagemDoFormulario[]): void;
  /** Quantos arquivos estão indo agora: o botão de criar espera. */
  aoEnviar(quantos: number): void;
  /** A sugestão de busca: o título da peça serve de ponto de partida. */
  textoDaBusca?: string;
  desativado?: boolean;
}

export function FotosDoBriefing({ imagens, formatos, arquivos, banco, aoMudar, aoEnviar, textoDaBusca = '', desativado = false }: PropriedadesDasFotos) {
  const [envios, setEnvios] = useState<Envio[]>([]);
  const [buscando, setBuscando] = useState(false);
  const entrada = useRef<HTMLInputElement>(null);
  const sequencia = useRef(0);
  const quantas = useRef(imagens.length);
  quantas.current = imagens.length;
  const cheio = imagens.length >= IMAGENS_POR_BRIEFING;

  const indo = envios.filter((e) => e.estado === 'enviando').length;
  useEffect(() => aoEnviar(indo), [indo, aoEnviar]);

  // foto que veio de rascunho ou de briefing salvo traz só o hash: as medidas são relidas
  useEffect(() => {
    let desmontado = false;
    for (const imagem of imagens) {
      if (imagem.largura !== undefined) continue;
      void arquivos.dados(imagem.sha256).then((dados) => {
        if (desmontado || !dados?.largura || !dados.altura) return;
        const { largura, altura, nome, origem } = dados;
        aoMudar((lista) => lista.map((i) => (i.sha256 === imagem.sha256 && i.largura === undefined ? { ...i, largura, altura, nome: i.nome ?? nome, origem: i.origem ?? origem } : i)));
      });
    }
    return () => {
      desmontado = true;
    };
  }, [imagens, arquivos, aoMudar]);

  const acrescentar = (imagem: ImagemDoFormulario): boolean => {
    if (quantas.current >= IMAGENS_POR_BRIEFING) return false;
    quantas.current += 1;
    aoMudar((lista) => (lista.some((i) => i.sha256 === imagem.sha256) || lista.length >= IMAGENS_POR_BRIEFING ? lista : [...lista, imagem]));
    return true;
  };

  const enviarUm = async (arquivo: File, id: number) => {
    setEnvios((lista) => [...lista.filter((e) => e.id !== id), { id, nome: arquivo.name, estado: 'enviando' }]);
    const r = await arquivos.enviarImagem(arquivo);
    if (r.ok) {
      setEnvios((lista) => lista.filter((e) => e.id !== id));
      acrescentar({ sha256: r.arquivo.sha256, nome: arquivo.name, largura: r.arquivo.largura, altura: r.arquivo.altura });
      return;
    }
    // recusa do arquivo (tipo, tamanho, ilegível) não melhora tentando de novo; falha do envio, sim
    const repetir = !['tipo_nao_aceito', 'arquivo_grande_demais', 'corpo_grande_demais', 'imagem_grande_demais', 'imagem_ilegivel'].includes(r.codigo);
    setEnvios((lista) => lista.map((e) => (e.id === id ? { id, nome: arquivo.name, estado: 'falhou', frase: fraseDoEnvio(arquivo.name, r.codigo, r.detalhe), ...(repetir ? { arquivo } : {}) } : e)));
  };

  const enviar = async (lista: File[]) => {
    for (const arquivo of lista) {
      const id = ++sequencia.current;
      const recusa = !(TIPOS_DE_IMAGEM as readonly string[]).includes(arquivo.type)
        ? editor.envio.tipoNaoAceito(arquivo.name)
        : arquivo.size > LIMITE_EM_MB * 1024 * 1024
          ? editor.envio.grandeDemais(arquivo.name, LIMITE_EM_MB)
          : undefined;
      if (recusa) {
        setEnvios((atuais) => [...atuais, { id, nome: arquivo.name, estado: 'falhou', frase: recusa }]);
        continue;
      }
      if (quantas.current >= IMAGENS_POR_BRIEFING) break;
      await enviarUm(arquivo, id);
    }
  };

  const doBanco = (imagem: ImagemTrazida, item: ImagemDoBanco): boolean =>
    acrescentar({ sha256: imagem.sha256, nome: item.descricao.split(',')[0]?.trim() || undefined, largura: imagem.largura, altura: imagem.altura, origem: imagem.origem });

  return (
    <>
      <div className={formulario.linha}>
        <input
          ref={entrada}
          type="file"
          accept={TIPOS_DE_IMAGEM.join(',')}
          multiple
          hidden
          data-enviar-fotos
          onChange={(e) => {
            const lista = [...(e.target.files ?? [])];
            e.target.value = '';
            void enviar(lista);
          }}
        />
        <button type="button" className={formulario.botao} disabled={desativado || cheio} onClick={() => entrada.current?.click()}>
          {textos.enviar}
        </button>
        <button type="button" className={formulario.botao} aria-expanded={buscando} disabled={desativado} onClick={() => setBuscando((b) => !b)}>
          {buscando ? textos.fecharBusca : textos.buscar}
        </button>
        <span className={formulario.nota}>{textos.maximo(IMAGENS_POR_BRIEFING)}</span>
      </div>

      {buscando && (
        <div className={estilos.painelDaBusca}>
          <BuscaDeImagens api={banco} aoTrazer={doBanco} textoInicial={textoDaBusca} cheio={cheio} />
        </div>
      )}

      {(imagens.length > 0 || envios.length > 0) && (
        <ul className={estilos.fotos} aria-label={textos.lista}>
          {imagens.map((imagem) => {
            const nome = imagem.nome ?? textos.semNome;
            const perdem = imagem.largura && imagem.altura ? ampliacoesPorFormato({ largura: imagem.largura, altura: imagem.altura }, formatos).filter((a) => a.perdeNitidez) : [];
            const [unica] = perdem;
            return (
              <li key={imagem.sha256} className={estilos.foto} data-estado="enviada" data-perde-nitidez={perdem.length > 0 ? 'sim' : undefined}>
                {/* biome-ignore lint/performance/noImgElement: bytes da API, pelo hash; não passa pelo otimizador de imagens */}
                <img src={enderecoDoArquivo(imagem.sha256)} alt="" loading="lazy" />
                <div className={estilos.dadosDaFoto}>
                  <strong>{nome}</strong>
                  <span data-medidas>{imagem.largura && imagem.altura ? textos.medidas(imagem.largura, imagem.altura) : textos.semMedidas}</span>
                  {/* a origem de foto de banco fica à vista (ADR 032) */}
                  {imagem.origem && <span data-origem>{textos.origem(imagem.origem.banco, imagem.origem.autor)}</span>}
                </div>
                {unica && (
                  <p className={estilos.ampliacao} role="status" data-ampliacao>
                    {perdem.length === 1 ? textos.ampliada(unica.formato, unica.ampliacao) : textos.ampliadaEmVarios(perdem)} {textos.usarAssim}
                  </p>
                )}
                <button
                  type="button"
                  className={estilos.tirar}
                  aria-label={textos.tirar(nome)}
                  title={textos.tirar(nome)}
                  disabled={desativado}
                  onClick={() => aoMudar((lista) => lista.filter((i) => i.sha256 !== imagem.sha256))}
                >
                  <span aria-hidden="true">×</span>
                </button>
              </li>
            );
          })}
          {envios.map((envio) => (
            <li key={`envio-${envio.id}`} className={estilos.foto} data-estado={envio.estado}>
              <span className={estilos.semMiniatura} aria-hidden="true" />
              <div className={estilos.dadosDaFoto}>
                <strong>{envio.nome}</strong>
                {envio.estado === 'enviando' ? (
                  <span role="status">{textos.enviando(envio.nome)}</span>
                ) : (
                  <>
                    <span role="alert">{envio.frase ?? textos.naoEnviou(envio.nome)}</span>
                    <span className={formulario.linha}>
                      {envio.arquivo && (
                        <button type="button" className={formulario.discreto} onClick={() => envio.arquivo && void enviarUm(envio.arquivo, envio.id)}>
                          {textos.tentarDeNovo}
                        </button>
                      )}
                      <button type="button" className={formulario.discreto} onClick={() => setEnvios((lista) => lista.filter((e) => e.id !== envio.id))}>
                        {textos.dispensar}
                      </button>
                    </span>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
