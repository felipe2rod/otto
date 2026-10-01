import { useEffect, useRef, useState } from 'react';
import { type Aviso, type EventoDaTarefa, projecaoSonnet5, type Tarefa } from '../api';
import type { EsforcoCriativo } from '../../servidor/esforco';
import { NIVEIS_DE_ESFORCO_CRIATIVO } from '../../servidor/esforco';
import { useEditor } from '../estado';
import { SeletorDeEsforco } from './SeletorDeEsforco';

const ATALHOS = [
  { rotulo: 'Adaptar para story', pedido: 'Adapte a peça para story 1080×1920, recompondo para o formato vertical.' },
  { rotulo: 'Adaptar para banner', pedido: 'Adapte a peça para banner 1200×628, recompondo para o formato horizontal.' },
  { rotulo: '3 variações de título', pedido: 'Faça 3 variações da prancheta principal com títulos diferentes para teste A/B, em pranchetas novas. Mantenha o resto igual.' },
  { rotulo: 'Revisar a peça', pedido: 'Revise a peça: rode a verificação, olhe o render e corrija o que estiver errado sem mudar o conceito.' },
];

function horario(iso: string) {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function Evento({ e }: { e: EventoDaTarefa }) {
  switch (e.tipo) {
    case 'plano':
    case 'mensagem':
      return <p className="ev fala">{(e.texto ?? '').replace(/\*\*|`/g, '')}</p>;
    case 'direcao':
      return (
        <div className="ev revisor direcao">
          <b>Direção de arte</b>
          <p>{e.texto ?? ''}</p>
        </div>
      );
    case 'revisao':
      return (
        <div className="ev revisor">
          <b>Diretor de arte</b>
          <p>{(e.texto ?? '').replace(/\*\*|`/g, '')}</p>
        </div>
      );
    case 'lote':
      return (
        <p className="ev lote">
          <b>Aplicou</b> {e.texto}
        </p>
      );
    case 'lote-recusado':
      return (
        <p className="ev recusado">
          <b>Lote recusado</b> {e.texto}
        </p>
      );
    case 'render':
      return (
        <p className="ev ver">
          <b>Conferiu o render</b> {e.texto}
        </p>
      );
    case 'imagem':
      return (
        <p className="ev ver">
          <b>Imagem</b> {e.texto}
        </p>
      );
    case 'verificacao': {
      const avisos = (e.dados as Aviso[]) ?? [];
      return (
        <div className={`ev verificacao${avisos.some((a) => a.gravidade === 'erro') ? ' com-erro' : avisos.length ? ' com-aviso' : ' limpa'}`}>
          <b>Verificação</b> {avisos.length === 0 ? 'sem erros nem avisos' : `${avisos.filter((a) => a.gravidade === 'erro').length} erros, ${avisos.filter((a) => a.gravidade === 'aviso').length} avisos`}
          {avisos.length > 0 && (
            <ul>
              {avisos.slice(0, 6).map((a, i) => (
                <li key={i}>{a.mensagem}</li>
              ))}
            </ul>
          )}
        </div>
      );
    }
    case 'erro':
      return <p className="ev recusado">{e.texto}</p>;
    default:
      return null;
  }
}

function Custo({ t }: { t: Tarefa }) {
  const c = t.custo;
  const p = projecaoSonnet5(c);
  return (
    <dl className="custo">
      <div>
        <dt>Tempo</dt>
        <dd>{c.segundos} s</dd>
      </div>
      <div>
        <dt>Chamadas</dt>
        <dd>{c.chamadas}</dd>
      </div>
      <div>
        <dt>Tokens entrada</dt>
        <dd>
          {(c.tokensDeEntrada / 1000).toFixed(1)}k<small> ({Math.round((c.tokensDeCacheLidos / Math.max(1, c.tokensDeEntrada)) * 100)}% cache)</small>
        </dd>
      </div>
      <div>
        <dt>Tokens saída</dt>
        <dd>{(c.tokensDeSaida / 1000).toFixed(1)}k</dd>
      </div>
      <div>
        <dt>Imagens vistas</dt>
        <dd>{c.imagensEnviadas}</dd>
      </div>
      <div>
        <dt>Voltas de conferência</dt>
        <dd>{c.voltasDeConferencia}</dd>
      </div>
      <div className="largo" title="Mesmos tokens com o preço do Sonnet 5 na DigitalOcean. O preço do modelo usado nesta POC ainda não foi conferido.">
        <dt>Projeção com Sonnet 5</dt>
        <dd>
          US$ {p.dolares.toFixed(3)} · R$ {p.reais.toFixed(2)}
        </dd>
      </div>
      <div className="largo">
        <dt>Modelo</dt>
        <dd>{c.modelo}</dd>
      </div>
    </dl>
  );
}

export function PainelDoOtto({ aoAbrirBriefing }: { aoAbrirBriefing: () => void }) {
  const { tarefa, registro, pedirTarefa, aceitar, desfazerTarefa, cancelarTarefa, setComparando, comparando, docAntes } = useEditor();
  const [pedido, setPedido] = useState('');
  const [esforco, setEsforco] = useState<EsforcoCriativo>();
  const [enviando, setEnviando] = useState(false);
  const fimRef = useRef<HTMLDivElement>(null);
  const n = tarefa?.eventos.length ?? 0;
  useEffect(() => {
    fimRef.current?.scrollIntoView({ block: 'end' });
  }, [n]);

  const semPranchetas = (registro?.doc.pranchetas.length ?? 0) === 0;
  const pedir = async (texto: string) => {
    if (!texto.trim()) return;
    setEnviando(true);
    // documento vazio: o texto cria uma peça (uma prancheta); com peça aberta, é um ajuste nela
    await pedirTarefa({ tipo: semPranchetas ? 'criar' : 'pedido', pedido: texto, ...(esforco ? { esforco } : {}) });
    setEnviando(false);
    setPedido('');
  };

  const ultimaVerificacao = [...(tarefa?.eventos ?? [])].reverse().find((e) => e.tipo === 'verificacao');
  const avisosFinais = (ultimaVerificacao?.dados as Aviso[] | undefined) ?? [];
  const historico = registro?.historico ?? [];

  return (
    <section className="painel otto" aria-label="Otto">
      <header className="painel-titulo">
        <h2>
          <span className="marca-otto">Otto</span>
        </h2>
        {tarefa?.estado === 'rodando' && <span className="status status-trabalhando">trabalhando</span>}
        {tarefa?.estado === 'em-revisao' && <span className="status status-revisao">aguardando sua revisão</span>}
      </header>

      {tarefa?.estado === 'em-revisao' && (
        <div className="revisao">
          <h3>Alterações do Otto</h3>
          {tarefa.resumo && <p className="resumo">{tarefa.resumo}</p>}
          {tarefa.pendencias && tarefa.pendencias.length > 0 && (
            <div className="pendencias">
              <b>Pendências</b>
              <ul>
                {tarefa.pendencias.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
            </div>
          )}
          {avisosFinais.length > 0 && <p className="nota">A última verificação deixou {avisosFinais.length} aviso(s).</p>}
          <p className="nota">
            {tarefa.lotes.length} lote(s), marcados em âmbar no canvas e nas camadas.
          </p>
          <div className="botoes">
            <button type="button" className="botao primario" onClick={() => void aceitar()}>
              Aceitar
            </button>
            <button type="button" className="botao" onClick={() => void desfazerTarefa()}>
              Desfazer tudo
            </button>
            <button
              type="button"
              className={`botao secundario${comparando ? ' ligado' : ''}`}
              disabled={!docAntes}
              onPointerDown={() => setComparando(true)}
              onPointerUp={() => setComparando(false)}
              onPointerLeave={() => setComparando(false)}
              title="Segure para ver o documento antes das alterações"
            >
              Segure para ver o antes
            </button>
          </div>
          <Custo t={tarefa} />
        </div>
      )}

      {tarefa && (
        <div className="tarefa">
          <p className="entrada">
            {tarefa.entrada.tipo === 'briefing' ? 'Briefing' : `${tarefa.entrada.tipo === 'criar' ? 'Nova peça: ' : ''}“${tarefa.entrada.pedido}”`}
            {tarefa.entrada.esforco && <small> · esforço {NIVEIS_DE_ESFORCO_CRIATIVO[tarefa.entrada.esforco].rotulo.toLowerCase()}</small>}
          </p>
          <details className="passos" open={tarefa.estado === 'rodando'}>
            <summary>Como o Otto trabalhou ({tarefa.eventos.filter((e) => e.tipo !== 'custo').length} passos)</summary>
            <div className="linha-do-tempo" aria-live="polite">
              {tarefa.eventos.map((e, i) => (
                <Evento key={`${e.quando}-${i}`} e={e} />
              ))}
              {tarefa.estado === 'rodando' && <p className="ev pensando">…</p>}
              <div ref={fimRef} />
            </div>
          </details>
          {tarefa.estado === 'rodando' && (
            <button type="button" className="botao secundario" onClick={() => void cancelarTarefa()}>
              Interromper
            </button>
          )}
        </div>
      )}

      {!tarefa && (
        <div className="pedir">
          <button type="button" className="botao primario largo" onClick={aoAbrirBriefing}>
            Nova peça por briefing
          </button>
          {!semPranchetas && (
            <>
              <div className="atalhos">
                {ATALHOS.map((a) => (
                  <button key={a.rotulo} type="button" className="chip" disabled={enviando} onClick={() => void pedir(a.pedido)}>
                    {a.rotulo}
                  </button>
                ))}
              </div>
            </>
          )}
          <form
            className="pedido-livre"
            onSubmit={(e) => {
              e.preventDefault();
              void pedir(pedido);
            }}
          >
            <label htmlFor="pedido">{semPranchetas ? 'Ou descreva a peça em texto livre' : 'Ou descreva a tarefa com suas palavras'}</label>
            <textarea
              id="pedido"
              rows={3}
              value={pedido}
              placeholder={
                semPranchetas
                  ? 'Ex.: story de lançamento do café gelado da Crové, título "Chegou o verão", azul #0037A6'
                  : 'Ex.: fundo escuro, tipografia maior, foto ocupando a metade de cima'
              }
              onChange={(e) => setPedido(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void pedir(pedido);
              }}
            />
            <label htmlFor="esforco-do-pedido">Esforço criativo</label>
            <SeletorDeEsforco id="esforco-do-pedido" valor={esforco} aoMudar={setEsforco} />
            <button type="submit" className="botao" disabled={enviando || !pedido.trim()}>
              {enviando ? 'Enviando…' : 'Pedir ao Otto'}
            </button>
          </form>
          {registro && registro.tarefas.length > 0 && (() => {
            const ult = registro.tarefas.at(-1)!;
            return (
              <div className="ultima">
                <b>Última tarefa</b> · {ult.estado === 'aceita' ? 'aceita' : ult.estado === 'desfeita' ? 'desfeita' : ult.estado === 'falhou' ? 'não terminou' : ult.estado}
                {ult.custo.chamadas > 0 && <Custo t={ult} />}
              </div>
            );
          })()}
        </div>
      )}

      <details className="historico">
        <summary>Histórico ({historico.length})</summary>
        <ol reversed>
          {[...historico].reverse().map((l) => (
            <li key={l.id} className={l.autoria.tipo}>
              <span className="autor">{l.autoria.tipo === 'agente' ? 'Otto' : 'Você'}</span>
              <span className="desc">{l.descricao}</span>
              <time>{horario(l.quando)}</time>
            </li>
          ))}
        </ol>
      </details>
    </section>
  );
}
