'use client';

// Exportar (docs/mvp/experiencia.md, seção 3.10). O relatório vem ANTES do botão: o designer vê o que
// vai em pixel, o que fica de fora, as fontes e o que falta antes de pedir o arquivo, nunca ao abri-lo.
//
// O diálogo só escolhe e mostra. A exportação em si mora no exportador (fora do React, criado pelo
// editor): fechar o diálogo não a interrompe, e reabrir mostra onde ela está.
//
// O botão principal é o PACOTE: um .zip com os arquivos do formato, as fontes que a licença deixa
// levar e o relatório em texto. "Só os arquivos" é o mesmo pedido sem o pacote.
import { DIAS_DE_RETENCAO_DA_EXPORTACAO, type Exportacao, type PedidoDeExportacao } from '@otto/shared';
import { type MouseEvent, type ReactNode, useEffect, useId, useRef, useState } from 'react';
import type { ApiDeExportacoes, ResultadoDoRelatorio } from '../../api/exportacoes';
import { haQuantoTempo } from '../../pecas/tempo';
import { erros } from '../../textos/erros';
import { exportar as textos } from '../../textos/exportar';
import { useAmbiente } from '../ambiente';
import type { EstadoDaPecaAberta } from '../Editor';
import { type Armazem, useArmazem } from '../nucleo/armazem';
import estilos from './DialogoDeExportar.module.css';
import { type EstadoDoExportador, type Exportador, expirou, progressoPorPrancheta } from './exportador';
import { type FormatoDeExportacao, lerRelatorio, type RelatorioNaTela } from './relatorio';

export interface PropriedadesDoDialogoDeExportar {
  nomeDaPeca: string;
  api: Pick<ApiDeExportacoes, 'relatorio' | 'listar'>;
  exportador: Exportador;
  /** Versão confirmada e lotes por confirmar: a exportação é da versão que o servidor tem. */
  estado: Pick<Armazem<EstadoDaPecaAberta>, 'obter' | 'assinar'>;
  aoFechar: () => void;
  agora?: () => number;
}

type Formato = FormatoDeExportacao;
type Juncao = 'por-prancheta' | 'juntas';
const FORMATOS: readonly Formato[] = ['psd', 'pdf', 'svg', 'png'];
const SEM_PRANCHETAS: readonly { id: string; nome: string; largura: number; altura: number }[] = [];
/** Depois de quantos segundos de espera a tela diz que peça pesada demora. */
const ESPERA_LONGA = 8;

/** O pedido do relatório: sempre como pacote (é assim que vem a lista de fontes), e sem o que não muda o relatório. */
function pedidoDoRelatorio(formato: Formato, pranchetas: string[] | undefined): PedidoDeExportacao {
  const comum = { pacote: true, ...(pranchetas ? { pranchetas } : {}) };
  if (formato === 'psd') return { formato, arquivos: 'por-prancheta', ...comum };
  if (formato === 'pdf') return { formato, arquivos: 'juntas', ...comum };
  if (formato === 'png') return { formato, escala: 1, semFundo: false, ...comum };
  return { formato, ...comum };
}

export function DialogoDeExportar({ nomeDaPeca, api, exportador, estado, aoFechar, agora = Date.now }: PropriedadesDoDialogoDeExportar) {
  const ambiente = useAmbiente();
  const pranchetas = useArmazem(ambiente.documento, (d) => d?.pranchetas) ?? SEM_PRANCHETAS;
  const exportacao = useArmazem(exportador.armazem, (e) => e);
  const salvando = useArmazem(estado, (e) => e.pendentes > 0);
  const versao = useArmazem(estado, (e) => e.versao);

  const [formato, setFormato] = useState<Formato>('psd');
  const [juncaoDoPsd, setJuncaoDoPsd] = useState<Juncao>('por-prancheta');
  const [juncaoDoPdf, setJuncaoDoPdf] = useState<Juncao>('juntas');
  const [escala, setEscala] = useState<1 | 2>(1);
  const [semFundo, setSemFundo] = useState(false);
  /** As pranchetas que o designer tirou. Guardar as de fora faz toda prancheta nova entrar marcada. */
  const [deFora, setDeFora] = useState<ReadonlySet<string>>(new Set());
  const [tentativa, setTentativa] = useState(0);
  const [resposta, setResposta] = useState<{ chave: string; resultado: ResultadoDoRelatorio } | null>(null);
  const [recentes, setRecentes] = useState<readonly Exportacao[]>([]);

  const escolhidas = pranchetas.filter((p) => !deFora.has(p.id));
  const ids = escolhidas.length === pranchetas.length ? undefined : escolhidas.map((p) => p.id);
  const pedido = (pacote: boolean): PedidoDeExportacao => {
    const comum = { ...(ids ? { pranchetas: ids } : {}), ...(pacote ? { pacote: true } : {}) };
    if (formato === 'psd') return { formato, arquivos: juncaoDoPsd, ...comum };
    if (formato === 'pdf') return { formato, arquivos: juncaoDoPdf, ...comum };
    if (formato === 'png') return { formato, escala, semFundo, ...comum };
    return { formato, ...comum };
  };

  // O relatório depende do formato, das pranchetas e da versão. Tamanho, fundo e junção não o mudam.
  const escolhendo = exportacao.fase === 'parado';
  const podePedirRelatorio = escolhendo && !salvando && escolhidas.length > 0;
  const chave = `${formato}|${ids?.join(',') ?? '*'}|${versao}|${tentativa}`;
  useEffect(() => {
    if (!podePedirRelatorio) return;
    let vencido = false;
    const [doFormato, lista] = chave.split('|');
    const quais = lista === '*' || lista === undefined ? undefined : lista.split(',');
    void api.relatorio(pedidoDoRelatorio(doFormato as Formato, quais)).then((resultado) => {
      if (!vencido) setResposta({ chave, resultado });
    });
    return () => {
      vencido = true;
    };
  }, [api, chave, podePedirRelatorio]);
  const doPedido = resposta?.chave === chave ? resposta.resultado : undefined;
  const relatorio = doPedido?.ok ? lerRelatorio(doPedido.relatorio, formato) : undefined;

  // As exportações recentes da peça: ao abrir, e de novo quando uma termina ou o designer volta às opções.
  const fase = exportacao.fase;
  useEffect(() => {
    if (fase !== 'parado' && fase !== 'terminou') return;
    let vencido = false;
    void api.listar().then((itens) => {
      if (!vencido) setRecentes(itens);
    });
    return () => {
      vencido = true;
    };
  }, [api, fase]);

  // <dialog> modal: o navegador prende o foco e fecha no Esc.
  const dialogo = useRef<HTMLDialogElement>(null);
  const quemAbriu = useRef<Element | null>(null);
  useEffect(() => {
    const d = dialogo.current;
    if (!d) return;
    if (!d.open) {
      quemAbriu.current = document.activeElement;
      if (typeof d.showModal === 'function') d.showModal();
      else d.setAttribute('open', '');
    }
    // Quem abriu recebe o foco de volta. O navegador só faz isso sozinho quando o diálogo é fechado
    // por close(); aqui ele sai da página (o editor o desmonta), e o foco cairia no corpo.
    return () => {
      const anterior = quemAbriu.current;
      // quem abriu pode ter saído da página (o aviso do topo some quando a exportação recomeça)
      const destino = anterior instanceof HTMLElement && anterior.isConnected ? anterior : document.querySelector<HTMLElement>('[data-abre-exportar]');
      destino?.focus();
    };
  }, []);

  const idDoTitulo = useId();
  const nomeDaPrancheta = (id: string) => pranchetas.find((p) => p.id === id)?.nome ?? id;
  const sigla = textos.sigla[formato];
  const podeExportar = Boolean(relatorio) && escolhidas.length > 0;

  return (
    <dialog ref={dialogo} className={estilos.dialogo} aria-labelledby={idDoTitulo} onClose={aoFechar}>
      <header className={estilos.cabecalho}>
        <h2 id={idDoTitulo} className={estilos.titulo} aria-label={textos.daPeca(nomeDaPeca)}>
          {textos.titulo} <em>{nomeDaPeca}</em>
        </h2>
        <button type="button" className={estilos.fechar} aria-label={textos.fechar} onClick={aoFechar}>
          <span aria-hidden="true">×</span>
        </button>
      </header>

      {escolhendo && (
        <>
          <div className={estilos.corpo}>
            <div className={estilos.opcoes}>
              <Escolha
                rotulo={textos.formato.rotulo}
                valor={formato}
                ordem={FORMATOS}
                opcoes={{ psd: textos.formato.psd, pdf: textos.formato.pdf, svg: textos.formato.svg, png: textos.formato.png }}
                aoEscolher={setFormato}
              />
              <p className={estilos.apoio}>{textos.apoio[formato]}</p>
              {formato === 'psd' && (
                <Escolha
                  rotulo={textos.arquivos.rotulo}
                  valor={juncaoDoPsd}
                  ordem={['por-prancheta', 'juntas']}
                  opcoes={{ 'por-prancheta': textos.arquivos['por-prancheta'], juntas: textos.arquivos.juntas }}
                  aoEscolher={setJuncaoDoPsd}
                />
              )}
              {formato === 'pdf' && (
                <Escolha
                  rotulo={textos.arquivos.rotulo}
                  valor={juncaoDoPdf}
                  ordem={['juntas', 'por-prancheta']}
                  opcoes={{ juntas: textos.arquivos.juntasNoPdf, 'por-prancheta': textos.arquivos['por-prancheta'] }}
                  aoEscolher={setJuncaoDoPdf}
                />
              )}
              {formato === 'png' && (
                <>
                  <Escolha
                    rotulo={textos.escala.rotulo}
                    valor={String(escala) as '1' | '2'}
                    ordem={['1', '2']}
                    opcoes={{ 1: textos.escala[1], 2: textos.escala[2] }}
                    aoEscolher={(v) => setEscala(v === '2' ? 2 : 1)}
                  />
                  <label className={estilos.marcar}>
                    <input type="checkbox" checked={semFundo} onChange={(e) => setSemFundo(e.target.checked)} />
                    {textos.semFundo}
                  </label>
                </>
              )}
              <fieldset className={estilos.grupo}>
                <legend>{textos.pranchetas.rotulo}</legend>
                {pranchetas.map((p) => (
                  <label key={p.id} className={estilos.marcar}>
                    <input
                      type="checkbox"
                      checked={!deFora.has(p.id)}
                      aria-label={textos.pranchetas.item(p.nome, p.largura, p.altura)}
                      onChange={(e) => setDeFora((atual) => new Set(e.target.checked ? [...atual].filter((id) => id !== p.id) : [...atual, p.id]))}
                    />
                    <span>{p.nome}</span>
                    <span className={estilos.medida} aria-hidden="true">
                      {p.largura}×{p.altura}
                    </span>
                  </label>
                ))}
                {escolhidas.length === 0 && (
                  <p className={estilos.falta} role="alert">
                    {textos.pranchetas.nenhuma}
                  </p>
                )}
              </fieldset>
            </div>

            <div className={estilos.relatorio}>
              <h3 className={estilos.subtitulo}>{textos.relatorio.titulo}</h3>
              {escolhidas.length === 0 ? null : salvando ? (
                <p className={estilos.espera} role="status">
                  {textos.relatorio.salvando}
                </p>
              ) : !doPedido ? (
                <p className={estilos.espera} role="status">
                  {textos.relatorio.montando}
                </p>
              ) : relatorio ? (
                <Relatorio relatorio={relatorio} />
              ) : (
                <div className={estilos.erro} role="alert">
                  <p>{textos.relatorio.naoSaiu}</p>
                  <button type="button" className={estilos.botao} onClick={() => setTentativa((n) => n + 1)}>
                    {textos.relatorio.tentarDeNovo}
                  </button>
                </div>
              )}
              <Recentes itens={recentes} agora={agora} />
            </div>
          </div>
          <footer className={estilos.rodape}>
            <p className={estilos.noPacote}>{textos.botao.oQueVaiNoPacote(sigla, (relatorio?.pacote?.vao.length ?? 0) > 0)}</p>
            <button type="button" className={estilos.botao} disabled={!podeExportar} onClick={() => exportador.exportar(pedido(false))}>
              {textos.botao.soArquivos(sigla)}
            </button>
            <button type="button" className={estilos.principal} disabled={!podeExportar} onClick={() => exportador.exportar(pedido(true))}>
              {textos.botao.pacote}
            </button>
          </footer>
        </>
      )}

      {(exportacao.fase === 'pedindo' || exportacao.fase === 'andando') && (
        <div className={estilos.faixa}>
          <div role="status" aria-label={textos.andamento.titulo}>
            <h3 className={estilos.subtitulo}>{textos.andamento.titulo}</h3>
            {exportacao.fase === 'pedindo' ? (
              <p className={estilos.espera}>{textos.andamento.pedindo}</p>
            ) : (
              <>
                {exportacao.exportacao.estado === 'na_fila' && <p className={estilos.espera}>{textos.andamento.naFila}</p>}
                {exportacao.pedido ? (
                  <ul className={estilos.andamento}>
                    {progressoPorPrancheta(
                      exportacao.exportacao,
                      pranchetas.filter((p) => !exportacao.pedido?.pranchetas || exportacao.pedido.pranchetas.includes(p.id)),
                    ).map((p) => (
                      <li key={p.id} data-estado={p.estado}>
                        <span>{p.nome}</span>
                        <span className={estilos.estado}>{textos.andamento.estados[p.estado]}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  // retomada depois de recarregar: a API diz quantas pranchetas terminaram, não quais foram pedidas
                  <p className={estilos.contagem}>{textos.andamento.contagem(exportacao.exportacao.progresso.pranchetasProntas, exportacao.exportacao.progresso.pranchetasNoTotal)}</p>
                )}
              </>
            )}
          </div>
          <Decorrido />
          <Arquivos estado={exportacao} />
          <p className={estilos.apoio}>{textos.andamento.podeFechar}</p>
        </div>
      )}

      {exportacao.fase === 'terminou' && (
        <Resultado estado={exportacao} agora={agora} nomeDaPrancheta={nomeDaPrancheta} aoTentarAsQueFalharam={exportador.tentarAsQueFalharam} aoRecomecar={exportador.limpar} />
      )}

      {exportacao.fase === 'falhou' && (
        <div className={estilos.faixa}>
          <div className={estilos.erro} role="alert">
            <strong>{textos.falha.titulo}</strong>
            <p>{exportacao.codigo === 'sem_conexao' ? textos.falha.semConexao : erros.doCodigo(exportacao.codigo)}</p>
          </div>
          <Arquivos estado={exportacao} />
          <div className={estilos.acoes}>
            {/* exportação retomada que falhou não tem pedido para repetir: só dá para voltar e pedir de novo */}
            {(exportacao.pedido || exportacao.retomar) && (
              <button type="button" className={estilos.principal} onClick={exportador.tentarDeNovo}>
                {textos.falha.tentarDeNovo}
              </button>
            )}
            <button type="button" className={estilos.botao} onClick={exportador.limpar}>
              {textos.falha.voltar}
            </button>
          </div>
        </div>
      )}
    </dialog>
  );
}

/**
 * Há quanto tempo a exportação está andando. Peça pesada passa de 40 segundos: a tela diz que é
 * esperado em vez de parecer travada. Conta do momento em que o diálogo passou a mostrar o andamento.
 */
function Decorrido() {
  const [segundos, setSegundos] = useState(0);
  useEffect(() => {
    const inicio = Date.now();
    const relogio = setInterval(() => setSegundos(Math.round((Date.now() - inicio) / 1000)), 1000);
    return () => clearInterval(relogio);
  }, []);
  if (segundos < ESPERA_LONGA) return null;
  return (
    <p className={estilos.apoio}>
      <span className={estilos.medida}>{textos.andamento.decorrido(segundos)}</span> {textos.andamento.demora}
    </p>
  );
}

/** As exportações da peça nos últimos dias: o que foi, quando, e o link de cada arquivo que ainda existe. */
function Recentes({ itens, agora }: { itens: readonly Exportacao[]; agora: () => number }) {
  const id = useId();
  if (itens.length === 0) return null;
  const t = textos.recentes;
  return (
    <section className={estilos.recentes} aria-labelledby={id}>
      <details>
        <summary id={id}>{t.titulo(itens.length)}</summary>
        <ul>
          {itens.map((e) => {
            const apagada = expirou(e, agora());
            const situacao = apagada ? t.estados.apagada : e.estado === 'pronta' ? undefined : t.estados[e.estado];
            return (
              <li key={e.id}>
                <span>{t.oQueE(textos.sigla[e.formato], e.pacote === true)}</span>
                <span className={estilos.medida}>{haQuantoTempo(e.criadaEm, new Date(agora()))}</span>
                {situacao && <span className={estilos.estado}>{situacao}</span>}
                {!apagada &&
                  e.arquivos.map((a) => (
                    <a key={a.baixar} href={a.baixar} aria-label={textos.resultado.baixarArquivo(a.nome)} title={a.nome}>
                      {a.nome}
                    </a>
                  ))}
              </li>
            );
          })}
        </ul>
      </details>
    </section>
  );
}

/** Um grupo de opções em que vale uma só. Campo de rádio nativo: setas, Tab e leitor de tela de graça. */
function Escolha<V extends string>({
  rotulo,
  valor,
  ordem,
  opcoes,
  aoEscolher,
}: {
  rotulo: string;
  valor: V;
  ordem: readonly V[];
  opcoes: Readonly<Record<V, string>>;
  aoEscolher: (valor: V) => void;
}) {
  const nome = useId();
  return (
    <fieldset className={estilos.grupo}>
      <legend>{rotulo}</legend>
      {ordem.map((v) => (
        <label key={v} className={estilos.marcar}>
          <input type="radio" name={nome} checked={v === valor} onChange={() => aoEscolher(v)} />
          {opcoes[v]}
        </label>
      ))}
    </fieldset>
  );
}

function Secao({ titulo, apoio, tom, children }: { titulo: string; apoio?: string; tom?: 'atencao'; children: ReactNode }) {
  const id = useId();
  return (
    <section className={estilos.secao} aria-labelledby={id} data-tom={tom}>
      <h4 id={id}>{titulo}</h4>
      {apoio && <p className={estilos.apoio}>{apoio}</p>}
      {children}
    </section>
  );
}

/** O relatório, igual antes de exportar e depois (o que de fato saiu). */
function Relatorio({ relatorio }: { relatorio: RelatorioNaTela }) {
  const t = textos.relatorio;
  return (
    <>
      {relatorio.temCamadas ? <p className={estilos.resumo}>{relatorio.resumo}</p> : <p className={estilos.apoio}>{t.soPng}</p>}

      {relatorio.emFalta.length > 0 && (
        <Secao titulo={t.emFalta.titulo(relatorio.emFalta.length)} tom="atencao">
          <ul className={estilos.lista}>
            {relatorio.emFalta.map((frase) => (
              <li key={frase}>{frase}</li>
            ))}
          </ul>
        </Secao>
      )}

      {(relatorio.deFora.length > 0 || relatorio.modoTrocado) && (
        <Secao titulo={t.deFora.titulo(relatorio.deFora.length + (relatorio.modoTrocado ? 1 : 0))} apoio={t.deFora.apoio} tom="atencao">
          <dl className={estilos.pares}>
            {relatorio.deFora.map((c) => (
              <div key={c.onde}>
                <dt>{c.onde}</dt>
                <dd>{c.motivo}</dd>
              </div>
            ))}
          </dl>
          {relatorio.modoTrocado && <p className={estilos.linha}>{t.deFora.modoTrocado}</p>}
        </Secao>
      )}

      {relatorio.temCamadas &&
        (relatorio.emPixel.length === 0 ? (
          <p className={estilos.tudoCerto}>{t.emPixel.vazio}</p>
        ) : (
          <Secao titulo={relatorio.tituloDoEmPixel} apoio={t.emPixel.apoio} tom="atencao">
            <dl className={estilos.pares}>
              {relatorio.emPixel.map((c) => (
                <div key={c.onde}>
                  <dt>{c.onde}</dt>
                  <dd>{c.motivo}</dd>
                </div>
              ))}
            </dl>
          </Secao>
        ))}

      {relatorio.pesosTrocados.length > 0 && (
        <Secao titulo={t.pesosTrocados.titulo(relatorio.pesosTrocados.length)} apoio={t.pesosTrocados.apoio} tom="atencao">
          <ul className={estilos.lista}>
            {relatorio.pesosTrocados.map((frase) => (
              <li key={frase}>{frase}</li>
            ))}
          </ul>
        </Secao>
      )}

      {relatorio.pacote && relatorio.pacote.vao.length + relatorio.pacote.naoVao.length > 0 && (
        <Secao
          titulo={t.pacote.titulo(relatorio.pacote.vao.length, relatorio.pacote.vao.length + relatorio.pacote.naoVao.length)}
          apoio={t.pacote.apoio}
          {...(relatorio.pacote.naoVao.length > 0 ? { tom: 'atencao' as const } : {})}
        >
          <ul className={estilos.etiquetas}>
            {relatorio.pacote.vao.map((fonte) => (
              <li key={fonte}>{fonte}</li>
            ))}
          </ul>
          {relatorio.pacote.naoVao.length > 0 && (
            <ul className={estilos.lista}>
              {relatorio.pacote.naoVao.map((frase) => (
                <li key={frase}>{frase}</li>
              ))}
            </ul>
          )}
        </Secao>
      )}

      {relatorio.fontes.length > 0 && !(relatorio.pacote && relatorio.pacote.vao.length + relatorio.pacote.naoVao.length > 0) && (
        <Secao titulo={t.fontes.titulo(relatorio.fontes.length)} apoio={t.fontes.apoio}>
          <ul className={estilos.etiquetas}>
            {relatorio.fontes.map((fonte) => (
              <li key={fonte}>{fonte}</li>
            ))}
          </ul>
        </Secao>
      )}

      {relatorio.imagens.length > 0 && (
        <Secao titulo={t.imagens.titulo(relatorio.imagens.length)}>
          <ul className={estilos.lista}>
            {relatorio.imagens.map((imagem) => (
              <li key={imagem.texto}>
                {imagem.texto}{' '}
                {imagem.pagina && (
                  <a href={imagem.pagina} target="_blank" rel="noreferrer noopener">
                    {t.imagens.pagina}
                  </a>
                )}
              </li>
            ))}
          </ul>
        </Secao>
      )}

      {relatorio.observacoes.length > 0 && (
        <Secao titulo={t.observacoes.titulo}>
          <ul className={estilos.lista}>
            {relatorio.observacoes.map((frase) => (
              <li key={frase}>{frase}</li>
            ))}
          </ul>
        </Secao>
      )}

      {relatorio.temCamadas && (
        <details className={estilos.todas}>
          <summary>{t.todas.titulo(relatorio.camadas.length)}</summary>
          <table>
            <thead>
              <tr>
                <th scope="col">{t.todas.colunas.onde}</th>
                <th scope="col">{t.todas.colunas.tipo}</th>
                <th scope="col">{t.todas.colunas.comoVai}</th>
              </tr>
            </thead>
            <tbody>
              {relatorio.camadas.map((c) => (
                <tr key={c.onde}>
                  <td>{c.onde}</td>
                  <td>{c.tipo}</td>
                  <td>{c.comoVai}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
    </>
  );
}

/**
 * Os arquivos que já dá para baixar. O link é o endereço estável da API: cada clique ganha um link
 * assinado novo, então não existe "link vencido" na tela. É navegação comum, não fetch: a resposta é
 * um redirecionamento para outra origem, que já vem como anexo com o nome certo.
 */
function Arquivos({ estado, aoBaixar }: { estado: Exclude<EstadoDoExportador, { fase: 'parado' }>; aoBaixar?: (e: MouseEvent<HTMLAnchorElement>) => void }) {
  if (estado.arquivos.length === 0) return null;
  return (
    <ul className={estilos.arquivos}>
      {estado.arquivos.map((a) => (
        <li key={a.baixar}>
          <span className={estilos.nomeDoArquivo}>{a.nome}</span>
          <span className={estilos.medida}>{textos.resultado.tamanho(a.bytes)}</span>
          <a className={estilos.baixar} href={a.baixar} aria-label={textos.resultado.baixarArquivo(a.nome)} onClick={aoBaixar}>
            {textos.resultado.baixar}
          </a>
        </li>
      ))}
    </ul>
  );
}

function Resultado({
  estado,
  agora,
  nomeDaPrancheta,
  aoTentarAsQueFalharam,
  aoRecomecar,
}: {
  estado: Extract<EstadoDoExportador, { fase: 'terminou' }>;
  agora: () => number;
  nomeDaPrancheta: (id: string) => string;
  aoTentarAsQueFalharam: () => void;
  aoRecomecar: () => void;
}) {
  // Os arquivos somem em 7 dias. Confere ao desenhar e de novo ao clicar: a aba pode ter ficado aberta.
  const [, redesenhar] = useState(0);
  const apagados = expirou(estado.exportacao, agora());
  const falharam = estado.exportacao.falhas.map((f) => nomeDaPrancheta(f.pranchetaId));
  const prontas = estado.arquivos.flatMap((a) => (a.pranchetaId ? [nomeDaPrancheta(a.pranchetaId)] : []));
  const relatorio = estado.exportacao.relatorio ? lerRelatorio(estado.exportacao.relatorio, estado.exportacao.formato) : undefined;

  return (
    <>
      <div className={estilos.corpo} data-colunas="uma">
        <div className={estilos.relatorio}>
          {apagados ? (
            <p className={estilos.erro} role="alert">
              {textos.resultado.apagados}
            </p>
          ) : (
            <>
              {falharam.length > 0 && (
                <div className={estilos.erro} role="alert">
                  <p>{prontas.length > 0 ? textos.resultado.emParte(falharam, prontas) : textos.resultado.nenhumaSaiu(falharam)}</p>
                  {/* exportação retomada não tem o pedido original: não dá para repetir só o que falhou */}
                  {estado.pedido && (
                    <button type="button" className={estilos.botao} onClick={aoTentarAsQueFalharam}>
                      {textos.resultado.tentarAsQueFalharam(falharam)}
                    </button>
                  )}
                </div>
              )}
              {estado.arquivos.length > 0 && (
                <>
                  <h3 className={estilos.subtitulo}>{textos.resultado.titulo}</h3>
                  <Arquivos
                    estado={estado}
                    aoBaixar={(e) => {
                      if (!expirou(estado.exportacao, agora())) return;
                      e.preventDefault();
                      redesenhar((n) => n + 1);
                    }}
                  />
                  <p className={estilos.apoio}>{textos.resultado.daVersao}</p>
                  <p className={estilos.apoio}>{textos.resultado.guardados(DIAS_DE_RETENCAO_DA_EXPORTACAO)}</p>
                </>
              )}
            </>
          )}
          {relatorio && !apagados && (
            <>
              <h3 className={estilos.subtitulo}>{textos.relatorio.doQueSaiu}</h3>
              <Relatorio relatorio={relatorio} />
            </>
          )}
        </div>
      </div>
      <footer className={estilos.rodape}>
        <button type="button" className={estilos.botao} onClick={aoRecomecar}>
          {textos.resultado.outra}
        </button>
      </footer>
    </>
  );
}
