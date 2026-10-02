'use client';

// Importar um PSD (ADR 028, item 4; docs/mvp/backend.md, 17.14). Três passos numa tela só:
// 1. escolher ou soltar o arquivo (o tamanho é conferido antes de enviar);
// 2. ver o que o arquivo é e QUE FONTES o texto dele pede, e decidir, por fonte, entre trocar por outra
//    e deixar o texto virar imagem. É o centro da tela: nada é trocado em silêncio;
// 3. acompanhar a importação e abrir a peça, onde o relatório diz o que veio editável, o que virou
//    imagem e o que ficou de fora.
// Um arquivo enviado e ainda não importado espera 24 horas: a tela o mostra para continuar ou desistir.
//
// Nome de arquivo, de camada e de fonte é conteúdo de terceiro: entra como texto, nunca como HTML.
import { BYTES_DO_PSD_NO_MAXIMO, ESTADOS_FINAIS_DA_IMPORTACAO, type FonteDaLista, type FonteDoPsd, IMPORTACOES_ABERTAS_POR_CONTA, type Importacao, type Marca, pesoMaisProximo } from '@otto/shared';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import formulario from '../produto/Formulario.module.css';
import { criarServicos, type Servicos } from '../produto/servicos';
import { editor } from '../textos/editor';
import { erros as errosGerais } from '../textos/erros';
import { importar as textos } from '../textos/importar';
import { contarDestinos, type EscolhaNaTela, type Escolhas, escolhaDe, escolhasParaOPedido, opcoesDe, trocasSemFonte } from './fontesDoPsd';
import estilos from './ImportarPsd.module.css';

export interface PropriedadesDeImportarPsd {
  servicos?: Pick<Servicos, 'importacoes' | 'cadastros' | 'fontes'>;
  irPara?: (endereco: string) => void;
  /** Espera entre as consultas do andamento. Trocada nos testes. */
  esperar?: (ms: number) => Promise<void>;
}

type Fase =
  | { tipo: 'escolher'; erro?: string; recusa?: { arquivo: string; motivo: string } }
  | { tipo: 'enviando'; arquivo: string }
  /** Uma importação aberta na tela: enviada (as fontes), na fila ou rodando (o andamento), ou terminada. */
  | { tipo: 'aberta'; importacao: Importacao };

const INTERVALO_DE_CONSULTA = 1500;
const LIMITE = textos.tamanho(BYTES_DO_PSD_NO_MAXIMO);
const ehPsd = (arquivo: File): boolean => /\.(psd|psb)$/i.test(arquivo.name);
const semExtensao = (nome: string): string => nome.replace(/\.(psd|psb)$/i, '').trim() || nome;
const nomeDoPeso = (peso: number): string => editor.propriedades.nomeDoPeso(peso, editor.propriedades.pesos[peso]);
const emCurso = (i: Importacao): boolean => i.estado === 'na_fila' || i.estado === 'rodando';

/** A frase de uma recusa do servidor. Nunca o código cru. */
function fraseDoErro(codigo: string): string {
  if (codigo === 'limite_de_importacoes') return textos.erros.limite_de_importacoes(IMPORTACOES_ABERTAS_POR_CONTA);
  if (codigo === 'arquivo_grande_demais' || codigo === 'corpo_grande_demais') return textos.erros.arquivo_grande_demais(LIMITE);
  const propria = (textos.erros as Readonly<Record<string, unknown>>)[codigo];
  if (typeof propria === 'string') return propria;
  return errosGerais.doCodigo(codigo) !== errosGerais.generico ? errosGerais.doCodigo(codigo) : textos.erros.padrao;
}

export function ImportarPsd({
  servicos: deFora,
  irPara = (endereco) => window.location.assign(endereco),
  esperar = (ms) => new Promise((seguir) => setTimeout(seguir, ms)),
}: PropriedadesDeImportarPsd) {
  const [servicos] = useState(() => deFora ?? criarServicos());
  const api = servicos.importacoes;
  const [fase, setFase] = useState<Fase>({ tipo: 'escolher' });
  /** As importações da conta: as que esperam (enviadas), as em curso e as recentes. */
  const [lista, setLista] = useState<Importacao[]>([]);
  const [marcas, setMarcas] = useState<Marca[]>([]);
  const [catalogo, setCatalogo] = useState<FonteDaLista[]>([]);
  const [escolhas, setEscolhas] = useState<Escolhas>({});
  const [nome, setNome] = useState('');
  const [marcaId, setMarcaId] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [desistindo, setDesistindo] = useState<string | null>(null);
  const [soltando, setSoltando] = useState(false);
  const entrada = useRef<HTMLInputElement>(null);
  const vivo = useRef(true);
  const acompanhando = useRef<string | null>(null);
  const id = useId();

  const recarregarLista = useCallback(async () => {
    const itens = await api.listar();
    if (vivo.current && itens) setLista(itens);
  }, [api]);

  useEffect(() => {
    vivo.current = true;
    void recarregarLista();
    void servicos.cadastros.marcas().then((lidas) => vivo.current && setMarcas(lidas ?? []));
    void servicos.fontes.catalogo().then((itens) => vivo.current && setCatalogo(itens));
    return () => {
      vivo.current = false;
    };
  }, [servicos, recarregarLista]);

  /** Consulta a importação até ela parar de andar. Consulta que falha não é falha da importação: tenta de novo. */
  const acompanhar = useCallback(
    async (importacaoId: string) => {
      if (acompanhando.current === importacaoId) return;
      acompanhando.current = importacaoId;
      while (vivo.current && acompanhando.current === importacaoId) {
        await esperar(INTERVALO_DE_CONSULTA);
        if (!vivo.current || acompanhando.current !== importacaoId) return;
        const r = await api.consultar(importacaoId);
        if (!vivo.current || acompanhando.current !== importacaoId) return;
        if (!r.ok) continue;
        setFase({ tipo: 'aberta', importacao: r.importacao });
        if (ESTADOS_FINAIS_DA_IMPORTACAO.includes(r.importacao.estado)) break;
      }
      acompanhando.current = null;
      void recarregarLista();
    },
    [api, esperar, recarregarLista],
  );

  /** Põe uma importação na tela: enviada mostra as fontes; em curso, o andamento. */
  const abrir = useCallback(
    (importacao: Importacao) => {
      setErro(null);
      setEscolhas({});
      setNome(importacao.pedido?.nome ?? semExtensao(importacao.arquivo.nome));
      setMarcaId('');
      setFase({ tipo: 'aberta', importacao });
      if (emCurso(importacao)) void acompanhar(importacao.id);
    },
    [acompanhar],
  );

  // a peça pronta abre sozinha: é lá que o relatório aparece
  const pronta = fase.tipo === 'aberta' && fase.importacao.estado === 'pronta' ? fase.importacao.documentoId : undefined;
  useEffect(() => {
    if (pronta) irPara(`/editor/p/${encodeURIComponent(pronta)}`);
  }, [pronta, irPara]);

  const enviar = async (arquivo: File | undefined) => {
    if (!arquivo || fase.tipo === 'enviando') return;
    // conferido aqui para não mandar 100 MB que seriam recusados: o servidor fecha a conexão de arquivo grande demais sem ler
    const local = !ehPsd(arquivo)
      ? textos.local.naoEPsd(arquivo.name)
      : arquivo.size === 0
        ? textos.local.vazio(arquivo.name)
        : arquivo.size > BYTES_DO_PSD_NO_MAXIMO
          ? textos.local.grandeDemais(arquivo.name, textos.tamanho(arquivo.size), LIMITE)
          : undefined;
    if (local) return setFase({ tipo: 'escolher', erro: local });
    setFase({ tipo: 'enviando', arquivo: arquivo.name });
    const r = await api.enviar(arquivo);
    if (!vivo.current) return;
    if (r.ok) {
      abrir(r.importacao);
      return void recarregarLista();
    }
    if (r.codigo === 'psd_recusado') return setFase({ tipo: 'escolher', recusa: { arquivo: arquivo.name, motivo: typeof r.detalhe?.motivo === 'string' ? r.detalhe.motivo : '' } });
    setFase({ tipo: 'escolher', erro: fraseDoErro(r.codigo) });
    void recarregarLista();
  };

  const importar = async (importacao: Importacao) => {
    if (ocupado || trocasSemFonte(importacao.fontes, escolhas).length > 0) return;
    setOcupado(true);
    setErro(null);
    const fontes = escolhasParaOPedido(importacao.fontes, escolhas);
    const r = await api.pedir(importacao.id, { ...(nome.trim() ? { nome: nome.trim() } : {}), ...(marcaId ? { marcaId } : {}), ...(fontes.length > 0 ? { fontes } : {}) });
    if (!vivo.current) return;
    setOcupado(false);
    if (!r.ok) {
      setErro(fraseDoErro(r.codigo));
      // fora do estado: outra aba já pediu ou desistiu; a tela mostra como está agora
      if (r.codigo === 'importacao_fora_do_estado') {
        const agora = await api.consultar(importacao.id);
        if (agora.ok && vivo.current) setFase({ tipo: 'aberta', importacao: agora.importacao });
      }
      return;
    }
    setFase({ tipo: 'aberta', importacao: r.importacao });
    void acompanhar(r.importacao.id);
  };

  const desistir = async (importacao: Importacao) => {
    setOcupado(true);
    const r = await api.desistir(importacao.id);
    if (!vivo.current) return;
    setOcupado(false);
    setDesistindo(null);
    if (!r.ok && r.codigo !== 'nao_encontrado') setErro(fraseDoErro(r.codigo));
    else if (fase.tipo === 'aberta' && fase.importacao.id === importacao.id) setFase({ tipo: 'escolher' });
    void recarregarLista();
  };

  const outroArquivo = () => {
    acompanhando.current = null;
    setErro(null);
    setFase({ tipo: 'escolher' });
  };

  const escolher = (fonte: FonteDoPsd, escolha: EscolhaNaTela) => setEscolhas((antes) => ({ ...antes, [fonte.postScript]: escolha }));
  const pesosDe = (familia: string): number[] => catalogo.find((f) => f.familia === familia)?.pesos ?? [];
  const trocarPor = (fonte: FonteDoPsd, familia: string, pesoPedido = fonte.sugestao?.peso ?? fonte.peso ?? 400) =>
    escolher(fonte, { fazer: 'substituir', familia, peso: pesoMaisProximo(pesosDe(familia), pesoPedido) ?? pesoPedido });

  const aberta = fase.tipo === 'aberta' ? fase.importacao : undefined;
  const pendentes = lista.filter((i) => (i.estado === 'enviada' || emCurso(i)) && i.id !== aberta?.id);
  const recentes = lista.filter((i) => ESTADOS_FINAIS_DA_IMPORTACAO.includes(i.estado) && i.estado !== 'descartada' && i.id !== aberta?.id).slice(0, 5);

  return (
    <div className={estilos.tela}>
      {/* ---------- 1. escolher o arquivo ---------- */}
      {(fase.tipo === 'escolher' || fase.tipo === 'enviando') && (
        // biome-ignore lint/a11y/noStaticElementInteractions: soltar o arquivo é o atalho; o botão dentro da zona é o caminho pelo teclado
        <div
          className={estilos.zona}
          data-soltando={soltando ? 'sim' : undefined}
          data-zona-de-soltar
          onDragOver={(e) => {
            e.preventDefault();
            setSoltando(true);
          }}
          onDragLeave={() => setSoltando(false)}
          onDrop={(e) => {
            e.preventDefault();
            setSoltando(false);
            void enviar(e.dataTransfer.files[0]);
          }}
        >
          {fase.tipo === 'enviando' ? (
            <>
              <strong role="status">{textos.escolher.enviando(fase.arquivo)}</strong>
              <span>{textos.escolher.conferindo}</span>
            </>
          ) : (
            <>
              <strong>{textos.escolher.solte}</strong>
              <span>{textos.escolher.ou}</span>
              <input
                ref={entrada}
                className={estilos.escondido}
                type="file"
                accept=".psd,.psb,image/vnd.adobe.photoshop"
                aria-label={textos.escolher.rotulo}
                tabIndex={-1}
                onChange={(e) => {
                  const arquivo = e.target.files?.[0];
                  e.target.value = '';
                  void enviar(arquivo);
                }}
              />
              <button type="button" className={formulario.principal} onClick={() => entrada.current?.click()}>
                {textos.escolher.botao}
              </button>
              <span>{textos.escolher.limites(LIMITE)}</span>
              <p className={formulario.nota}>{textos.escolher.oQueVem}</p>
            </>
          )}
        </div>
      )}

      {fase.tipo === 'escolher' && fase.erro && (
        <p className={formulario.erro} role="alert">
          {fase.erro}
        </p>
      )}
      {fase.tipo === 'escolher' && fase.recusa && (
        <div className={formulario.erro} role="alert" data-recusa={fase.recusa.motivo}>
          <p>
            <strong>{textos.recusa.titulo(fase.recusa.arquivo)}</strong>
          </p>
          <p>{textos.recusa.motivos[fase.recusa.motivo] ?? textos.recusa.generico}</p>
          {textos.recusa.comoConverter[fase.recusa.motivo] && <p data-como-converter>{textos.recusa.comoConverter[fase.recusa.motivo]}</p>}
        </div>
      )}

      {/* ---------- 2. o arquivo e as fontes ---------- */}
      {aberta?.estado === 'enviada' &&
        (() => {
          const semFonte = trocasSemFonte(aberta.fontes, escolhas);
          const destinos = contarDestinos(aberta.fontes, escolhas);
          return (
            <form
              className={estilos.cartao}
              aria-label={textos.titulo}
              onSubmit={(e) => {
                e.preventDefault();
                void importar(aberta);
              }}
            >
              <div>
                <h2>{textos.arquivo.titulo}</h2>
                <p className={estilos.nomeDoArquivo} data-nome-do-arquivo>
                  {aberta.arquivo.nome}
                </p>
                <p className={estilos.fatos}>
                  {textos.arquivo.resumo(aberta.arquivo.formato, aberta.arquivo.largura, aberta.arquivo.altura, aberta.arquivo.camadas, textos.tamanho(aberta.arquivo.bytes))}
                </p>
              </div>
              <div className={estilos.duas}>
                <label className={formulario.campo}>
                  <span className={formulario.rotulo}>{textos.arquivo.nomeDaPeca}</span>
                  <input type="text" aria-label={textos.arquivo.nomeDaPeca} value={nome} maxLength={120} disabled={ocupado} onChange={(e) => setNome(e.target.value)} />
                </label>
                {marcas.length > 0 && (
                  <label className={formulario.campo}>
                    <span className={formulario.rotulo}>{textos.arquivo.marca}</span>
                    <select aria-label={textos.arquivo.marca} value={marcaId} disabled={ocupado} onChange={(e) => setMarcaId(e.target.value)}>
                      <option value="">{textos.arquivo.semMarca}</option>
                      {marcas.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.nome}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>

              <section aria-labelledby={`${id}-fontes`}>
                <h2 id={`${id}-fontes`}>{textos.fontes.titulo}</h2>
                {aberta.fontes.length === 0 ? (
                  <p className={formulario.nota}>{textos.fontes.semTexto}</p>
                ) : (
                  <>
                    <p className={formulario.nota}>{textos.fontes.explica}</p>
                    <ul className={estilos.fontes} aria-label={textos.fontes.lista}>
                      {aberta.fontes.map((fonte) => {
                        const escolha = escolhaDe(fonte, escolhas);
                        const opcoes = opcoesDe(fonte);
                        return (
                          <li key={fonte.postScript} className={estilos.fonte} data-situacao={fonte.situacao} data-destino={escolha?.fazer ?? 'editavel'}>
                            <div>
                              <span className={estilos.postScript}>{fonte.postScript}</span>
                              <p className={estilos.situacao}>
                                {fonte.situacao === 'na_biblioteca'
                                  ? fonte.familia
                                    ? textos.fontes.situacao.na_biblioteca(fonte.familia, nomeDoPeso(fonte.peso ?? 400))
                                    : textos.fontes.situacao.na_biblioteca_sem_nome
                                  : textos.fontes.situacao[fonte.situacao]}
                              </p>
                            </div>
                            {opcoes.length > 0 && escolha && (
                              <fieldset className={estilos.opcoes}>
                                <legend className={formulario.soParaLeitorDeTela}>{textos.fontes.oQueFazer(fonte.postScript)}</legend>
                                {opcoes.map((opcao) => (
                                  <label key={opcao} className={estilos.opcao}>
                                    <input
                                      type="radio"
                                      name={`${id}-${fonte.postScript}`}
                                      checked={escolha.fazer === opcao}
                                      disabled={ocupado}
                                      onChange={() =>
                                        opcao === 'substituir' ? escolher(fonte, { fazer: 'substituir', familia: '', peso: fonte.sugestao?.peso ?? 400 }) : escolher(fonte, { fazer: opcao })
                                      }
                                    />
                                    {textos.fontes.opcoes[opcao]}
                                  </label>
                                ))}
                                {escolha.fazer === 'substituir' && (
                                  <div className={estilos.troca}>
                                    <select
                                      aria-label={textos.fontes.trocarPor(fonte.postScript)}
                                      value={escolha.familia}
                                      disabled={ocupado}
                                      onChange={(e) => trocarPor(fonte, e.target.value, escolha.peso)}
                                    >
                                      <option value="">{textos.fontes.escolhaAFonte}</option>
                                      {catalogo.map((f) => (
                                        <option key={f.familia} value={f.familia}>
                                          {f.familia}
                                        </option>
                                      ))}
                                      {escolha.familia !== '' && !catalogo.some((f) => f.familia === escolha.familia) && <option value={escolha.familia}>{escolha.familia}</option>}
                                    </select>
                                    <select
                                      aria-label={textos.fontes.pesoDaTroca(fonte.postScript)}
                                      value={escolha.peso}
                                      disabled={ocupado || escolha.familia === ''}
                                      onChange={(e) => escolher(fonte, { ...escolha, peso: Number(e.target.value) })}
                                    >
                                      {[...new Set([...pesosDe(escolha.familia), escolha.peso])]
                                        .sort((a, b) => a - b)
                                        .map((peso) => (
                                          <option key={peso} value={peso}>
                                            {nomeDoPeso(peso)}
                                          </option>
                                        ))}
                                    </select>
                                    {fonte.sugestao && escolha.familia !== fonte.sugestao.familia && (
                                      <p className={estilos.sugestao}>
                                        {textos.fontes.sugestao(fonte.sugestao.familia, nomeDoPeso(fonte.sugestao.peso))}
                                        <button
                                          type="button"
                                          className={formulario.discreto}
                                          onClick={() => fonte.sugestao && escolher(fonte, { fazer: 'substituir', familia: fonte.sugestao.familia, peso: fonte.sugestao.peso })}
                                        >
                                          {textos.fontes.usarSugestao}
                                        </button>
                                      </p>
                                    )}
                                  </div>
                                )}
                              </fieldset>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                    <p className={formulario.nota} role="status" data-resumo-das-fontes>
                      {semFonte.length > 0 ? textos.fontes.faltaEscolher(semFonte.length) : textos.fontes.resumo(destinos.editaveis, destinos.imagens)}
                    </p>
                  </>
                )}
              </section>

              {erro && (
                <p className={formulario.erro} role="alert">
                  {erro}
                </p>
              )}
              {aberta.expiraEm && <p className={formulario.nota}>{textos.arquivo.expira(new Date(aberta.expiraEm).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }))}</p>}
              {desistindo === aberta.id ? (
                <div className={estilos.acoes}>
                  <p className={`${formulario.nota} ${estilos.empurra}`}>{textos.acoes.confirmarDesistir(aberta.arquivo.nome)}</p>
                  <button type="button" className={formulario.botao} disabled={ocupado} onClick={() => setDesistindo(null)}>
                    {textos.relatorio.fechar}
                  </button>
                  <button type="button" className={formulario.botao} disabled={ocupado} onClick={() => void desistir(aberta)}>
                    {textos.pendentes.desistirCurto}
                  </button>
                </div>
              ) : (
                <div className={estilos.acoes}>
                  <button type="button" className={`${formulario.discreto} ${estilos.empurra}`} disabled={ocupado} onClick={() => setDesistindo(aberta.id)}>
                    {textos.acoes.desistir}
                  </button>
                  <button type="submit" className={formulario.principal} disabled={ocupado || semFonte.length > 0}>
                    {ocupado ? textos.acoes.pedindo : textos.acoes.importar}
                  </button>
                </div>
              )}
            </form>
          );
        })()}

      {/* ---------- 3. o andamento e o fim ---------- */}
      {aberta && emCurso(aberta) && (
        <div className={estilos.cartao} data-andamento={aberta.estado}>
          <p className={estilos.nomeDoArquivo}>{aberta.arquivo.nome}</p>
          {/* sem barra de porcentagem: a importação não informa quanto falta */}
          <p className={estilos.andamento} role="status">
            {aberta.estado === 'na_fila' ? textos.andamento.na_fila : textos.andamento.rodando}
          </p>
          <p className={formulario.nota}>{textos.andamento.costuma}</p>
        </div>
      )}
      {aberta?.estado === 'pronta' && (
        <div className={estilos.cartao} data-andamento="pronta">
          <p className={estilos.nomeDoArquivo}>{aberta.arquivo.nome}</p>
          <p className={estilos.andamento} role="status">
            {textos.andamento.pronta}
          </p>
          {aberta.documentoId && (
            <a className={formulario.principal} href={`/editor/p/${encodeURIComponent(aberta.documentoId)}`}>
              {textos.andamento.abrir}
            </a>
          )}
        </div>
      )}
      {aberta && (aberta.estado === 'falhou' || aberta.estado === 'descartada') && (
        <div className={estilos.cartao} data-andamento={aberta.estado}>
          <div className={formulario.erro} role="alert">
            <p>
              <strong>{aberta.estado === 'falhou' ? textos.falhou.titulo(aberta.arquivo.nome) : aberta.arquivo.nome}</strong>
            </p>
            {aberta.estado === 'descartada' ? (
              <p>{textos.descartada}</p>
            ) : aberta.erro?.codigo === 'psd_recusado' ? (
              <>
                <p>{textos.recusa.motivos[aberta.erro.motivo ?? ''] ?? textos.recusa.generico}</p>
                {textos.recusa.comoConverter[aberta.erro.motivo ?? ''] && <p data-como-converter>{textos.recusa.comoConverter[aberta.erro.motivo ?? '']}</p>}
              </>
            ) : (
              <p>{textos.falhou.codigos[aberta.erro?.codigo ?? ''] ?? textos.falhou.generico}</p>
            )}
          </div>
          <div className={estilos.acoes}>
            <button type="button" className={formulario.principal} onClick={outroArquivo}>
              {textos.recusa.outroArquivo}
            </button>
          </div>
        </div>
      )}

      {/* ---------- o que ficou para trás ---------- */}
      {pendentes.length > 0 && (
        <section>
          <h2 className={estilos.subtitulo}>{textos.pendentes.titulo}</h2>
          <ul className={estilos.lista} aria-label={textos.pendentes.lista}>
            {pendentes.map((i) => (
              <li key={i.id}>
                <strong>{i.arquivo.nome}</strong>
                <small>{emCurso(i) ? textos.pendentes.emCurso : textos.tamanho(i.arquivo.bytes)}</small>
                {desistindo === i.id ? (
                  <>
                    <span className={formulario.nota}>{textos.acoes.confirmarDesistir(i.arquivo.nome)}</span>
                    <button type="button" className={formulario.botao} disabled={ocupado} onClick={() => void desistir(i)}>
                      {textos.pendentes.desistirCurto}
                    </button>
                    <button type="button" className={formulario.discreto} onClick={() => setDesistindo(null)}>
                      {textos.relatorio.fechar}
                    </button>
                  </>
                ) : (
                  <>
                    <button type="button" className={formulario.botao} aria-label={textos.pendentes.continuar(i.arquivo.nome)} disabled={fase.tipo === 'enviando'} onClick={() => abrir(i)}>
                      {textos.pendentes.continuarCurto}
                    </button>
                    {i.estado === 'enviada' && (
                      <button type="button" className={formulario.discreto} aria-label={textos.pendentes.desistir(i.arquivo.nome)} disabled={ocupado} onClick={() => setDesistindo(i.id)}>
                        {textos.pendentes.desistirCurto}
                      </button>
                    )}
                  </>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
      {recentes.length > 0 && (
        <section>
          <h2 className={estilos.subtitulo}>{textos.recentes.titulo}</h2>
          <ul className={estilos.lista} aria-label={textos.recentes.lista}>
            {recentes.map((i) => (
              <li key={i.id}>
                <strong>{i.arquivo.nome}</strong>
                {i.estado === 'pronta' && i.documentoId ? (
                  <a className={formulario.discreto} href={`/editor/p/${encodeURIComponent(i.documentoId)}`} aria-label={textos.recentes.abrir(i.arquivo.nome)}>
                    {textos.andamento.abrir}
                  </a>
                ) : (
                  <small>{textos.recentes.naoTerminou}</small>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
