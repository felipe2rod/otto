'use client';

// O painel do Otto (docs/mvp/experiencia.md, 3.5 a 3.9): pedir, a espera, o "pode", a revisão do
// conjunto de alterações e as pendências. O agente é colega, não modal: o painel fica ao lado do
// canvas, e a tarefa continua se ele for escondido ou a aba fechada.
//
// O estado mora no controle (nucleo/controleDoOtto.ts), fora do React; aqui só se desenha e se chama
// a ação. Nada de modelo, token ou custo na tela: o designer vê o tempo e o que foi feito.
import type { No } from '@otto/documento';
import { briefingDaTarefa, type LimitesDeTarefa, type PedidoDeTarefa, type Pendencia, type PendenciaDaPeca, type Tarefa } from '@otto/shared';
import { type ReactNode, useEffect, useId, useState } from 'react';
import { erros } from '../../textos/erros';
import { duracao, otto as textos } from '../../textos/otto';
import { useAmbiente } from '../ambiente';
import { acharNoPorId } from '../nucleo/acoes';
import { type Armazem, useArmazem } from '../nucleo/armazem';
import type { ControleDoOtto } from '../nucleo/controleDoOtto';
import { emAndamento, etapasNaTela, inicioDoTempo, type LinhaDoRegistro, naoTerminou, type TarefaNaTela } from '../nucleo/tarefaDoOtto';
import estilos from './PainelDoOtto.module.css';

/** Se o navegador pode avisar quando a tarefa terminar: não há como, ainda não foi pedido, ligado ou negado. */
export type EstadoDoAviso = 'indisponivel' | 'a-pedir' | 'ligado' | 'negado';

export interface PropriedadesDoPainelDoOtto {
  otto: ControleDoOtto;
  /** Segurar "ver o antes": o canvas mostra a peça como era antes da tarefa enquanto durar. */
  aoVerOAntes: (ligado: boolean) => void;
  /** A notificação do navegador, pedida em contexto (aqui, na espera), nunca na chegada. */
  aviso: { estado: Pick<Armazem<EstadoDoAviso>, 'obter' | 'assinar'>; pedir: () => void };
  agora?: () => number;
}

type TipoEscolhido = 'ajuste' | 'pedido';

/** O relógio da tela: muda a cada segundo, e só existe enquanto alguém o usa. */
function useAgora(agora: () => number, ligado: boolean): number {
  const [instante, setInstante] = useState(agora);
  useEffect(() => {
    if (!ligado) return;
    setInstante(agora());
    const relogio = setInterval(() => setInstante(agora()), 1000);
    return () => clearInterval(relogio);
  }, [agora, ligado]);
  return instante;
}

export function PainelDoOtto({ otto, aoVerOAntes, aviso, agora = Date.now }: PropriedadesDoPainelDoOtto) {
  const estado = useArmazem(otto.armazem, (e) => e);
  const id = useId();
  const { atual } = estado;
  const tarefa = atual?.tarefa;
  const andando = emAndamento(tarefa);
  const instante = useAgora(agora, andando);
  const rotuloDoEstado = !tarefa ? undefined : naoTerminou(tarefa) && tarefa.estado === 'em_revisao' ? textos.estados.naoTerminou : textos.estados[tarefa.estado];

  return (
    <section className={estilos.painel} aria-labelledby={id} data-estado={tarefa?.estado}>
      <div className={estilos.cabecalho}>
        <h2 id={id} className={estilos.titulo}>
          {textos.titulo}
        </h2>
        {tarefa && (
          <p className={estilos.estado} role="status" data-estado-da-tarefa={tarefa.estado} data-parou={naoTerminou(tarefa) ? 'sim' : undefined}>
            {rotuloDoEstado}
            {andando && tarefa.estado !== 'na_fila' && <span className={estilos.tempo}> · {textos.espera.ha(duracao(instante - inicioDoTempo(tarefa)))}</span>}
          </p>
        )}
      </div>
      <div className={estilos.corpo}>
        {estado.recusa && <Recusa otto={otto} recusa={estado.recusa} ocupado={estado.ocupado} />}
        {!atual || !tarefa ? (
          <Pedido otto={otto} limites={estado.limites} ocupado={estado.ocupado} />
        ) : andando ? (
          <Espera otto={otto} atual={atual} ocupado={estado.ocupado} semAoVivo={estado.semAoVivo} aviso={aviso} limites={estado.limites} />
        ) : tarefa.estado === 'aguardando_confirmacao' ? (
          <Pode otto={otto} atual={atual} ocupado={estado.ocupado} />
        ) : tarefa.estado === 'em_revisao' ? (
          <Revisao otto={otto} atual={atual} ocupado={estado.ocupado} aoVerOAntes={aoVerOAntes} />
        ) : (
          <>
            <Resultado otto={otto} atual={atual} ocupado={estado.ocupado} />
            <Pedido otto={otto} limites={estado.limites} ocupado={estado.ocupado} />
          </>
        )}
        {(!tarefa || !andando) && tarefa?.estado !== 'em_revisao' && <PendenciasDaPeca otto={otto} pendencias={estado.pendencias} />}
      </div>
    </section>
  );
}

// ---------- pedir ----------

function Pedido({ otto, limites, ocupado }: { otto: ControleDoOtto; limites: ReturnType<ControleDoOtto['armazem']['obter']>['limites']; ocupado: boolean }) {
  const ambiente = useAmbiente();
  const vazia = useArmazem(ambiente.documento, (d) => (d?.pranchetas.length ?? 0) === 0);
  const selecao = useArmazem(ambiente.interface.armazem, (e) => e.selecao);
  const [texto, setTexto] = useState('');
  const [tipo, setTipo] = useState<TipoEscolhido>('ajuste');
  const [semSelecao, setSemSelecao] = useState(false);
  const idDoTipo = useId();

  const doc = ambiente.documento.obter();
  const selecionadas = selecao?.tipo === 'camadas' && doc && !semSelecao ? selecao.ids.flatMap((id) => acharNoPorId(doc, id)?.no ?? []) : [];
  const semLimite = limites && !limites.podeEnviar ? limites.motivo : undefined;
  const motivoDoLimite =
    limites && semLimite === 'limite_da_conta'
      ? textos.pedir.semLimite.limite_da_conta(limites.tarefasPorDia)
      : limites && semLimite === 'fila_cheia'
        ? textos.pedir.semLimite.fila_cheia(limites.naFila)
        : semLimite
          ? textos.pedir.semLimite.limite_diario
          : undefined;
  // um ajuste gasta muito menos que uma tarefa que cria peça: pode caber quando o resto não cabe
  const soAjuste = semLimite !== undefined && limites?.podeAjustar === true && !vazia;
  const cabe = !semLimite || (soAjuste && tipo === 'ajuste');
  const podeEnviar = texto.trim() !== '' && !ocupado && cabe;

  const enviar = async () => {
    if (!podeEnviar) return;
    const pedido = texto.trim();
    const comSelecao = selecionadas.length > 0 ? { selecao: selecionadas.map((n) => n.id) } : {};
    const entrada: PedidoDeTarefa = vazia ? { tipo: 'criar', pedido } : { tipo, pedido, ...comSelecao };
    if (await otto.pedir(entrada)) setTexto('');
  };

  return (
    <form
      className={estilos.bloco}
      aria-label={textos.pedir.rotulo}
      onSubmit={(e) => {
        e.preventDefault();
        void enviar();
      }}
    >
      {!vazia && (
        <fieldset className={estilos.tipos}>
          <legend className={estilos.rotulo}>{textos.pedir.tipo}</legend>
          {(['ajuste', 'pedido'] as const).map((t) => (
            <label key={t} className={estilos.tipo}>
              <input type="radio" name={idDoTipo} checked={tipo === t} onChange={() => setTipo(t)} />
              {textos.pedir.tipos[t]}
            </label>
          ))}
        </fieldset>
      )}
      <p className={estilos.apoio}>{vazia ? textos.pedir.oQueE.criar : textos.pedir.oQueE[tipo]}</p>
      {selecionadas.length > 0 && !vazia && (
        <p className={estilos.sobre}>
          <span>{textos.pedir.sobre(selecionadas.map((n) => n.nome))}</span>
          <button type="button" aria-label={textos.pedir.tirarSelecao} title={textos.pedir.tirarSelecao} onClick={() => setSemSelecao(true)}>
            <span aria-hidden="true">×</span>
          </button>
        </p>
      )}
      <textarea
        className={estilos.campo}
        aria-label={textos.pedir.campo}
        placeholder={vazia ? textos.pedir.exemploDeCriar : textos.pedir.exemplo}
        rows={3}
        maxLength={4000}
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            void enviar();
          }
        }}
      />
      {soAjuste ? (
        <p className={estilos.alerta} role="status">
          {textos.pedir.soAjuste}
        </p>
      ) : (
        motivoDoLimite && (
          <p className={estilos.alerta} role="alert">
            {motivoDoLimite}
          </p>
        )
      )}
      <div className={estilos.acoes}>
        {limites && <span className={estilos.discreto}>{textos.pedir.tarefasHoje(limites.tarefasHoje, limites.tarefasPorDia)}</span>}
        <span className={estilos.discreto} aria-hidden="true">
          {textos.pedir.atalho}
        </span>
        <button type="submit" className={estilos.principal} disabled={!podeEnviar}>
          {ocupado ? textos.pedir.enviando : textos.pedir.enviar}
        </button>
      </div>
    </form>
  );
}

function Recusa({ otto, recusa, ocupado }: { otto: ControleDoOtto; recusa: { codigo: string; detalhe?: Record<string, unknown> }; ocupado: boolean }) {
  // Voltar para antes de uma tarefa aceita, com edições do designer depois: a tela diz quantas vão junto e pergunta.
  if (recusa.codigo === 'editado_depois') {
    const edicoes = typeof recusa.detalhe?.edicoes === 'number' ? recusa.detalhe.edicoes : 1;
    return (
      <div className={estilos.alerta} role="alert">
        <p>{textos.resultado.comEdicoesDepois(edicoes)}</p>
        <div className={estilos.acoes}>
          <button type="button" className={estilos.botao} disabled={ocupado} onClick={() => void otto.desfazer(true)}>
            {textos.resultado.voltarMesmoAssim}
          </button>
          <button type="button" className={estilos.botao} onClick={otto.dispensarRecusa}>
            {textos.resultado.fechar}
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className={estilos.alerta} role="alert">
      <p>{erros.doCodigo(recusa.codigo)}</p>
      <button type="button" className={estilos.botao} onClick={otto.dispensarRecusa}>
        {textos.resultado.fechar}
      </button>
    </div>
  );
}

// ---------- a espera ----------

function nomeDaEtapa(etapa: NonNullable<Tarefa['etapa']>): string {
  const t = textos.espera.etapa;
  if (etapa.etapa === 'producao') return t.producao(etapa.prancheta?.nome);
  if (etapa.etapa === 'conferencia') return t.conferencia(etapa.rodada);
  return t[etapa.etapa];
}

function Espera({
  otto,
  atual,
  ocupado,
  semAoVivo,
  aviso,
  limites,
}: {
  otto: ControleDoOtto;
  atual: TarefaNaTela;
  ocupado: boolean;
  semAoVivo: boolean;
  aviso: PropriedadesDoPainelDoOtto['aviso'];
  limites?: LimitesDeTarefa | undefined;
}) {
  const { tarefa } = atual;
  const estadoDoAviso = useArmazem(aviso.estado, (e) => e);
  const etapas = etapasNaTela(tarefa);
  const naFila = tarefa.estado === 'na_fila';
  // as peças da conta que estão na frente desta (a própria tarefa também vem na lista)
  const naFrente = (limites?.naFrente ?? []).filter((t) => t.tarefaId !== tarefa.id && t.documentoId !== tarefa.documentoId).map((t) => t.nome);
  // o que ele acabou de dizer fica à vista; o resto do passo a passo, fechado logo abaixo
  const ultimaFala = atual.registro.findLast((l) => l.evento.tipo === 'mensagem')?.evento;
  return (
    <div className={estilos.bloco}>
      <PedidoFeito tarefa={tarefa} />
      {naFila && <p className={estilos.apoio}>{naFrente.length > 0 ? textos.espera.naFilaAtras(naFrente) : textos.espera.naFila}</p>}
      {/* Etapas com nome, sem barra de porcentagem: o ciclo do Otto não é previsível, e barra que chuta mente. */}
      {etapas.length > 0 && (
        <ol className={estilos.etapas} aria-label={textos.espera.etapas}>
          {etapas.map(({ etapa, situacao }, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: a lista é a sequência prevista; a posição é a identidade da linha
            <li key={i} data-situacao={situacao} aria-current={situacao === 'atual' ? 'step' : undefined}>
              <span className={estilos.marca} aria-hidden="true" />
              <span>{nomeDaEtapa(etapa)}</span>
              <span className={estilos.soParaLeitorDeTela}>{textos.espera.situacao[situacao]}</span>
            </li>
          ))}
        </ol>
      )}
      {ultimaFala?.tipo === 'mensagem' && (
        <p className={estilos.fala} data-ultima-fala>
          {ultimaFala.texto}
        </p>
      )}
      {semAoVivo && (
        <p className={estilos.alerta} role="status">
          {textos.espera.semAoVivo}
        </p>
      )}
      <p className={estilos.apoio}>{textos.espera.podeFechar}</p>
      {estadoDoAviso === 'a-pedir' && (
        <button type="button" className={estilos.botao} onClick={aviso.pedir}>
          {textos.espera.avisar}
        </button>
      )}
      {estadoDoAviso === 'ligado' && <p className={estilos.discreto}>{textos.espera.avisoLigado}</p>}
      {estadoDoAviso === 'negado' && <p className={estilos.discreto}>{textos.espera.avisoNegado}</p>}
      <Registro linhas={atual.registro} emCurso />
      <div className={estilos.acoes}>
        <button type="button" className={estilos.botao} disabled={ocupado} onClick={() => void otto.cancelar()}>
          {ocupado ? textos.espera.interrompendo : naFila ? textos.espera.cancelar : textos.espera.interromper}
        </button>
      </div>
    </div>
  );
}

/** O pedido como foi enviado: o designer que volta precisa lembrar o que pediu. */
function PedidoFeito({ tarefa }: { tarefa: Tarefa }) {
  // pelo formulário, o que identifica o pedido é o nome da peça ou, sem ele, o título
  const pedido = 'pedido' in tarefa.entrada ? tarefa.entrada.pedido : (tarefa.entrada.briefing.nome ?? tarefa.entrada.briefing.textos?.titulo);
  return pedido ? <blockquote className={estilos.pedido}>{pedido}</blockquote> : null;
}

function textoDaLinha({ evento }: LinhaDoRegistro, nomeDaPrancheta: (id: string) => string | undefined): { texto: string; fala?: boolean } | undefined {
  const t = textos.espera.linha;
  switch (evento.tipo) {
    case 'mensagem':
      return { texto: evento.texto, fala: true };
    case 'revisao':
      return { texto: `${t.segundaConferencia}: ${evento.texto}`, fala: true };
    case 'lote':
      return { texto: t.lote(evento.descricao) };
    case 'lote-recusado':
      return { texto: t.recusado };
    case 'render':
      return { texto: evento.detalhe ? t.renderDeDetalhe : t.render };
    case 'verificacao': {
      // com as pranchetas conferidas, a linha diz qual foi e com que resultado; prancheta que já saiu da peça não tem nome
      const conferidas = (evento.pranchetas ?? []).flatMap((id) => nomeDaPrancheta(id) ?? []);
      if (conferidas.length > 0) return { texto: t.conferida(conferidas, evento.avisos.length) };
      return { texto: evento.avisos.length === 0 ? t.verificacaoLimpa : t.verificacao(evento.avisos.length) };
    }
    case 'imagem':
      return { texto: t.imagem[evento.acao] };
    case 'erro':
      return { texto: t.erro };
    case 'etapa':
      return { texto: nomeDaEtapa(evento) };
    default:
      return undefined;
  }
}

/** O passo a passo, fechado: quem quer ver, abre. As etapas (acima) são o que se lê de relance. */
function Registro({ linhas, emCurso = false }: { linhas: readonly LinhaDoRegistro[]; emCurso?: boolean }) {
  const ambiente = useAmbiente();
  const pranchetas = useArmazem(ambiente.documento, (d) => d?.pranchetas);
  if (linhas.length === 0) return null;
  const nomeDaPrancheta = (id: string) => pranchetas?.find((p) => p.id === id)?.nome;
  return (
    <details className={estilos.registro}>
      <summary>{(emCurso ? textos.espera.registro : textos.espera.registroDepois)(linhas.length)}</summary>
      <ol>
        {linhas.map((linha) => {
          const l = textoDaLinha(linha, nomeDaPrancheta);
          return l ? (
            <li key={linha.sequencia} data-fala={l.fala ? 'sim' : undefined} data-tipo={linha.evento.tipo}>
              {l.texto}
            </li>
          ) : null;
        })}
      </ol>
    </details>
  );
}

// ---------- o "pode" ----------

function Pode({ otto, atual, ocupado }: { otto: ControleDoOtto; atual: TarefaNaTela; ocupado: boolean }) {
  const { tarefa } = atual;
  const [ajustando, setAjustando] = useState(false);
  const [ajuste, setAjuste] = useState('');
  const confirmacao = tarefa.confirmacao;
  const cartao = confirmacao?.cartao ?? null;
  const plano = confirmacao?.plano;
  const t = textos.pode;
  const semDirecao = confirmacao?.motivos.includes('sem_direcao') ?? false;

  return (
    <div className={estilos.bloco}>
      <PedidoFeito tarefa={tarefa} />
      <p className={estilos.pergunta}>{semDirecao ? t.semDirecao : cartao ? t.pergunta : t.perguntaSemDirecao}</p>
      {cartao && (
        <dl className={estilos.cartao}>
          <Linha termo={t.conceito}>{cartao.conceito}</Linha>
          <Linha termo={t.assinatura}>{cartao.assinatura}</Linha>
          <Linha termo={t.paleta}>
            <span className={estilos.paleta}>
              {cartao.paleta.map((cor) => (
                <span key={`${cor.papel}-${cor.cor}`} className={estilos.cor}>
                  <span className={estilos.amostra} style={{ background: cor.cor }} aria-hidden="true" />
                  {t.papeis[cor.papel] ?? cor.papel}
                </span>
              ))}
            </span>
          </Linha>
          <Linha termo={t.tipografia}>{t.fontes(cartao.tipografia.titulo, cartao.tipografia.texto)}</Linha>
          <Linha termo={t.imagem}>{cartao.imagem}</Linha>
        </dl>
      )}
      {plano && (
        <dl className={estilos.cartao}>
          {plano.resumo && <Linha termo={t.plano}>{plano.resumo}</Linha>}
          {plano.criar.length > 0 && <Linha termo={t.vouCriar}>{plano.criar.map((f) => t.formato(f.nome, f.largura, f.altura)).join(' · ')}</Linha>}
          {plano.alterar.length > 0 && (
            <Linha termo={t.vouAlterar}>
              <ul className={estilos.itens}>
                {plano.alterar.map((a) => (
                  <li key={a.prancheta}>{t.alterar(a.nome, a.oQue)}</li>
                ))}
              </ul>
            </Linha>
          )}
          {/* remoção nunca vem misturada no texto: tem linha própria */}
          {plano.remover.length > 0 && (
            <Linha termo={t.vouRemover} atencao>
              <ul className={estilos.itens}>
                {plano.remover.map((r) => (
                  <li key={r.alvo}>{t.remover(r.nome, r.prancheta, r.motivo)}</li>
                ))}
              </ul>
            </Linha>
          )}
        </dl>
      )}
      {confirmacao?.motivos
        .filter((m) => m !== 'sem_direcao')
        .map((m) => (
          <p key={m} className={estilos.apoio}>
            {t.motivos[m]}
          </p>
        ))}

      {ajustando ? (
        <form
          className={estilos.ajuste}
          onSubmit={(e) => {
            e.preventDefault();
            if (ajuste.trim() === '') return;
            void otto.ajustar(ajuste.trim());
            setAjustando(false);
            setAjuste('');
          }}
        >
          {/* biome-ignore lint/a11y/noAutofocus: o campo nasce do botão "ajustar"; o foco precisa ir para ele */}
          <textarea className={estilos.campo} aria-label={t.oQueMuda} placeholder={t.oQueMuda} rows={3} maxLength={2000} autoFocus value={ajuste} onChange={(e) => setAjuste(e.target.value)} />
          <div className={estilos.acoes}>
            <button type="button" className={estilos.botao} onClick={() => setAjustando(false)}>
              {t.desistirDoAjuste}
            </button>
            <button type="submit" className={estilos.principal} disabled={ocupado || ajuste.trim() === ''}>
              {t.mandarAjuste}
            </button>
          </div>
        </form>
      ) : (
        <div className={estilos.acoes}>
          <button type="button" className={estilos.discretoBotao} disabled={ocupado} onClick={() => void otto.cancelar()}>
            {t.cancelar}
          </button>
          <button type="button" className={estilos.botao} disabled={ocupado} onClick={() => setAjustando(true)}>
            {t.ajustar}
          </button>
          <button type="button" className={estilos.principal} disabled={ocupado} onClick={() => void otto.aprovar()}>
            {t.aprovar}
          </button>
        </div>
      )}
      <p className={estilos.discreto}>{t.semPrazo}</p>
      <Registro linhas={atual.registro} emCurso />
    </div>
  );
}

function Linha({ termo, atencao = false, children }: { termo: string; atencao?: boolean; children: ReactNode }) {
  return (
    <div data-atencao={atencao ? 'sim' : undefined}>
      <dt>{termo}</dt>
      <dd>{children}</dd>
    </div>
  );
}

// ---------- pendências ----------

/** A frase da tela para uma pendência. A que o Otto declarou vai com a fala dele; a do sistema e a da verificação, pela frase daqui. */
/** O que a tela precisa de uma pendência: a da entrega (do ciclo) e a da peça (com id e estado) servem. */
export interface PendenciaNaTela {
  id?: string;
  tipo: string;
  texto: string;
  camadas: readonly string[];
  prancheta?: string | undefined;
  origem: Pendencia['origem'];
  regra?: string | undefined;
}

export function fraseDaPendencia(pendencia: PendenciaNaTela, camadas: readonly string[]): string {
  const t = textos.pendencia;
  if (pendencia.origem === 'otto') return pendencia.texto;
  if (pendencia.tipo === 'aviso_da_verificacao') {
    const onde = camadas.length > 0 ? camadas.join(', ') : pendencia.prancheta;
    return t.daVerificacao((pendencia.regra && t.daRegra[pendencia.regra]) || t.regraSemNome, onde);
  }
  const doTipo = t.doTipo[pendencia.tipo] ?? t.doTipo.outro;
  return typeof doTipo === 'function' ? doTipo(pendencia.prancheta) : (doTipo ?? '');
}

function ListaDePendencias({ pendencias, aoDispensar }: { pendencias: readonly PendenciaNaTela[]; aoDispensar?: (id: string) => void }) {
  const ambiente = useAmbiente();
  const doc = useArmazem(ambiente.documento, (d) => d);
  return (
    <ul className={estilos.pendencias}>
      {pendencias.map((p, i) => {
        const nos: No[] = [];
        for (const id of p.camadas) {
          const no = doc && acharNoPorId(doc, id)?.no;
          if (no) nos.push(no);
        }
        const frase = fraseDaPendencia(
          p,
          nos.map((n) => n.nome),
        );
        return (
          <li key={p.id ?? `${p.tipo}-${i}`}>
            <span>{frase}</span>
            {nos.length > 0 && (
              <button
                type="button"
                className={estilos.acaoDaLinha}
                aria-label={textos.revisao.verPendencia(frase)}
                onClick={() => ambiente.interface.selecionar({ tipo: 'camadas', ids: nos.map((n) => n.id) })}
              >
                {textos.revisao.ver}
              </button>
            )}
            {aoDispensar && p.id && (
              <button type="button" className={estilos.acaoDaLinha} aria-label={textos.revisao.dispensarPendencia(frase)} onClick={() => aoDispensar(p.id as string)}>
                {textos.revisao.dispensar}
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** As pendências abertas da peça: sobrevivem ao aceite, até serem dispensadas. */
function PendenciasDaPeca({ otto, pendencias }: { otto: ControleDoOtto; pendencias: readonly PendenciaDaPeca[] }) {
  const id = useId();
  if (pendencias.length === 0) return null;
  return (
    <section className={estilos.bloco} aria-labelledby={id}>
      <h3 id={id} className={estilos.rotulo}>
        {textos.pendencia.titulo(pendencias.length)}
      </h3>
      <ListaDePendencias pendencias={pendencias} aoDispensar={(pendencia) => void otto.dispensarPendencia(pendencia)} />
    </section>
  );
}

// ---------- revisão ----------

function Revisao({ otto, atual, ocupado, aoVerOAntes }: { otto: ControleDoOtto; atual: TarefaNaTela; ocupado: boolean; aoVerOAntes: (ligado: boolean) => void }) {
  const ambiente = useAmbiente();
  const doc = useArmazem(ambiente.documento, (d) => d);
  const { tarefa } = atual;
  const [descartando, setDescartando] = useState<string | null>(null);
  const [ajuste, setAjuste] = useState('');
  const t = textos.revisao;
  const parou = naoTerminou(tarefa);
  const fraseDoFim = parou ? (t.naoTerminou[tarefa.erro?.codigo ?? ''] ?? t.naoTerminou[tarefa.fim ?? ''] ?? t.naoTerminou.interrompida) : undefined;
  const novas = (tarefa.pranchetasNovas ?? []).flatMap((id) => doc?.pranchetas.find((p) => p.id === id) ?? []);
  const idDasPendencias = useId();
  const soltar = () => aoVerOAntes(false);

  const aceitarEAjustar = async () => {
    const pedido = ajuste.trim();
    if (pedido === '' || !(await otto.aceitar())) return;
    setAjuste('');
    await otto.pedir({ tipo: 'ajuste', pedido });
  };

  return (
    <div className={estilos.bloco}>
      <h3 className={estilos.rotulo}>
        {t.titulo}
        {tarefa.duracaoMs !== undefined && <span className={estilos.tempo}> · {t.levou(duracao(tarefa.duracaoMs))}</span>}
      </h3>
      {/* quando o trabalho parou no meio, a frase do SISTEMA vem primeiro; o resumo do Otto, se houver, depois */}
      {fraseDoFim && <p className={estilos.alerta}>{fraseDoFim}</p>}
      {tarefa.resumo && !parou && <p className={estilos.fala}>{tarefa.resumo}</p>}
      {!parou && tarefa.conferida === false && <p className={estilos.apoio}>{t.semConferencia}</p>}

      {/* pendências antes dos botões: é o que o Otto disse que não resolveu */}
      <section aria-labelledby={idDasPendencias}>
        <h4 id={idDasPendencias} className={estilos.rotulo}>
          {t.pendencias(tarefa.pendencias.length)}
        </h4>
        {tarefa.pendencias.length === 0 ? <p className={estilos.apoio}>{tarefa.conferida ? t.semPendencia : t.semPendenciaSemConferir}</p> : <ListaDePendencias pendencias={tarefa.pendencias} />}
      </section>

      {novas.length > 0 && (
        <section>
          <h4 className={estilos.rotulo}>{t.pranchetas}</h4>
          <ul className={estilos.pranchetas}>
            {novas.map((p) => (
              <li key={p.id}>
                {descartando === p.id ? (
                  <>
                    <span>{t.confirmarDescarte(p.nome)}</span>
                    <button
                      type="button"
                      className={estilos.acaoDaLinha}
                      disabled={ocupado}
                      onClick={() => {
                        setDescartando(null);
                        void otto.descartar(p.id);
                      }}
                    >
                      {t.descartar}
                    </button>
                    <button type="button" className={estilos.acaoDaLinha} onClick={() => setDescartando(null)}>
                      {textos.resultado.fechar}
                    </button>
                  </>
                ) : (
                  <>
                    <span>{t.prancheta(p.nome, p.largura, p.altura, p.filhos.length)}</span>
                    <button type="button" className={estilos.acaoDaLinha} aria-label={t.verPrancheta(p.nome)} onClick={() => ambiente.interface.selecionar({ tipo: 'prancheta', id: p.id })}>
                      {t.ver}
                    </button>
                    <button type="button" className={estilos.acaoDaLinha} aria-label={t.descartarPrancheta(p.nome)} disabled={ocupado} onClick={() => setDescartando(p.id)}>
                      {t.descartar}
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className={estilos.acoes}>
        <button type="button" className={estilos.botao} disabled={ocupado} onClick={() => void otto.desfazer()}>
          {t.desfazer}
        </button>
        <button type="button" className={estilos.principal} disabled={ocupado} onClick={() => void otto.aceitar()}>
          {t.aceitar}
        </button>
      </div>
      {/* Segurar mostra a peça de antes; soltar (ou sair de cima, ou perder o foco) volta. Pelo teclado: segurar Espaço ou Enter. */}
      <button
        type="button"
        className={estilos.segurar}
        onPointerDown={() => aoVerOAntes(true)}
        onPointerUp={soltar}
        onPointerLeave={soltar}
        onPointerCancel={soltar}
        onBlur={soltar}
        onKeyDown={(e) => (e.key === ' ' || e.key === 'Enter') && !e.repeat && aoVerOAntes(true)}
        onKeyUp={(e) => (e.key === ' ' || e.key === 'Enter') && soltar()}
      >
        {t.verOAntes}
      </button>

      {parou ? (
        <div className={estilos.ajuste}>
          <p className={estilos.apoio}>{t.avisoDeTentarDeNovo}</p>
          <button type="button" className={estilos.botao} disabled={ocupado} onClick={() => void otto.tentarDeNovo()}>
            {t.tentarDeNovo}
          </button>
        </div>
      ) : (
        <form
          className={estilos.ajuste}
          onSubmit={(e) => {
            e.preventDefault();
            void aceitarEAjustar();
          }}
        >
          <textarea className={estilos.campo} aria-label={t.quaseLa} placeholder={t.quaseLa} rows={2} maxLength={4000} value={ajuste} onChange={(e) => setAjuste(e.target.value)} />
          <button type="submit" className={estilos.botao} disabled={ocupado || ajuste.trim() === ''}>
            {t.aceitarEAjustar}
          </button>
        </form>
      )}
      <Registro linhas={atual.registro} />
    </div>
  );
}

// ---------- o resultado de uma tarefa que já terminou ----------

function Resultado({ otto, atual, ocupado }: { otto: ControleDoOtto; atual: TarefaNaTela; ocupado: boolean }) {
  const { tarefa } = atual;
  const t = textos.resultado;
  const semAlteracao = tarefa.estado === 'aceita' && tarefa.lotes === 0;
  const frase =
    tarefa.estado === 'falhou'
      ? (t.falhou[tarefa.erro?.codigo ?? ''] ?? t.falhou.padrao)
      : semAlteracao
        ? t.semAlteracao
        : tarefa.estado === 'aceita'
          ? t.aceita
          : tarefa.estado === 'desfeita'
            ? t.desfeita
            : t.cancelada;
  return (
    <div className={estilos.bloco} role="status" data-resultado={tarefa.estado}>
      <p className={tarefa.estado === 'falhou' ? estilos.alerta : estilos.apoio}>{frase}</p>
      {/* sem alteração, o motivo é o que o Otto disse: o resumo e as pendências (por exemplo, "não cabe num ajuste rápido") */}
      {semAlteracao && tarefa.resumo && <p className={estilos.fala}>{tarefa.resumo}</p>}
      {semAlteracao && tarefa.pendencias.length > 0 && <ListaDePendencias pendencias={tarefa.pendencias} />}
      <div className={estilos.acoes}>
        {tarefa.estado === 'falhou' && (
          <button type="button" className={estilos.botao} disabled={ocupado} onClick={() => void otto.tentarDeNovo()}>
            {t.tentarDeNovo}
          </button>
        )}
        {tarefa.estado === 'aceita' && !semAlteracao && (
          <button type="button" className={estilos.botao} disabled={ocupado} onClick={() => void otto.desfazer()}>
            {t.voltarParaAntes}
          </button>
        )}
        {/* o briefing que gerou a peça está guardado na tarefa: o formulário abre preenchido com ele */}
        {tarefa.estado === 'aceita' && briefingDaTarefa(tarefa) && (
          <a className={estilos.botao} href={`/editor/novo?peca=${encodeURIComponent(tarefa.documentoId)}`}>
            {t.comEsteBriefing}
          </a>
        )}
        <button type="button" className={estilos.discretoBotao} onClick={otto.fecharResultado}>
          {t.fechar}
        </button>
      </div>
      <Registro linhas={atual.registro} />
    </div>
  );
}
