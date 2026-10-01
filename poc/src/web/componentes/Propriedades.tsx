import { type ReactNode, useEffect, useId, useState } from 'react';
import { coresDoVetor, type Degrade, type Documento, ehVisual, MODOS_DE_MESCLAGEM, type No, type Prancheta, resolverCor, todasAsCamadas } from '../../documento/esquema';
import { caixaDe } from '../../documento/operacoes';
import { api } from '../api';
import { familiasDisponiveis } from '../../render/fontes';
import { useCatalogoDeFontes } from '../recursos';
import { useEditor } from '../estado';

/** Campo que só confirma no Enter ou ao sair: cada confirmação é um lote. */
function Campo({ rotulo, valor, tipo = 'text', aoConfirmar, largo, desativado }: { rotulo: string; valor: string | number; tipo?: 'text' | 'number'; aoConfirmar: (v: string) => void; largo?: boolean; desativado?: boolean }) {
  const [rascunho, setRascunho] = useState(String(valor));
  useEffect(() => {
    setRascunho(String(valor));
  }, [valor]);
  const confirmar = () => {
    if (rascunho !== String(valor)) aoConfirmar(rascunho);
  };
  return (
    <label className={`campo${largo ? ' largo' : ''}`}>
      <span>{rotulo}</span>
      <input
        type={tipo}
        value={rascunho}
        disabled={desativado}
        step={tipo === 'number' ? 'any' : undefined}
        onChange={(e) => setRascunho(e.target.value)}
        onBlur={confirmar}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') setRascunho(String(valor));
        }}
      />
    </label>
  );
}

function CampoDeCor({ rotulo, valor, doc, aoConfirmar, desativado }: { rotulo: string; valor: string; doc: Documento; aoConfirmar: (v: string) => void; desativado?: boolean }) {
  const tokens = Object.entries(doc.tokens.cores);
  return (
    <div className="campo largo cor">
      <span>{rotulo}</span>
      <div className="linha-cor">
        <input type="color" value={resolverCor(doc, valor)} disabled={desativado} onChange={(e) => aoConfirmar(e.target.value)} aria-label={`${rotulo}: cor`} />
        <select value={valor.startsWith('token:') ? valor : ''} disabled={desativado} onChange={(e) => e.target.value && aoConfirmar(e.target.value)} aria-label={`${rotulo}: token`}>
          <option value="">{valor.startsWith('token:') ? '' : `${valor} (solta)`}</option>
          {tokens.map(([nome, v]) => (
            <option key={nome} value={`token:${nome}`}>
              token {nome} · {v}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

function Grupo({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <fieldset className="grupo">
      <legend>{titulo}</legend>
      <div className="grade">{children}</div>
    </fieldset>
  );
}

export function Propriedades() {
  const { doc, selecao, aplicar, tarefa } = useEditor();
  if (!doc) return null;
  const travado = tarefa?.estado === 'rodando';

  let no: No | undefined;
  let prancheta: Prancheta | undefined;
  for (const p of doc.pranchetas) {
    if (selecao?.tipo === 'prancheta' && p.id === selecao.id) prancheta = p;
    for (const n of todasAsCamadas(p.filhos)) if (selecao?.tipo === 'no' && n.id === selecao.id) {
      no = n;
      prancheta = p;
    }
  }

  const alterar = (props: Record<string, unknown>, descricao: string) => no && void aplicar(descricao, [{ op: 'alterar', alvo: no.id, props }]);
  const num = (v: string) => Number(v.replace(',', '.'));

  return (
    <section className="painel propriedades" aria-label="Propriedades">
      <header className="painel-titulo">
        <h2>Propriedades</h2>
      </header>
      {!no && !prancheta && (
        <>
          <p className="vazio">Selecione uma camada ou prancheta.</p>
          <Tokens />
        </>
      )}
      {!no && prancheta && (
        <>
          <Grupo titulo="Prancheta">
            <Campo largo rotulo="Nome" valor={prancheta.nome} desativado={travado} aoConfirmar={(v) => void aplicar('renomear prancheta', [{ op: 'alterarPrancheta', prancheta: prancheta!.id, props: { nome: v } }])} />
            <CampoDeCor rotulo="Fundo" valor={prancheta.fundo} doc={doc} desativado={travado} aoConfirmar={(v) => void aplicar('fundo da prancheta', [{ op: 'alterarPrancheta', prancheta: prancheta!.id, props: { fundo: v } }])} />
          </Grupo>
          <Tokens />
        </>
      )}
      {no && (
        <>
          <Grupo titulo={{ texto: 'Camada de texto', forma: 'Forma', imagem: 'Imagem (objeto inteligente)', vetor: 'Vetor (logo)', grupo: 'Grupo', ajuste: 'Camada de ajuste' }[no.tipo]}>
            <Campo largo rotulo="Nome" valor={no.nome} desativado={travado || no.bloqueado} aoConfirmar={(v) => alterar({ nome: v }, 'renomear camada')} />
            {ehVisual(no) && (
              <>
                <Campo tipo="number" rotulo="X" valor={Math.round(no.x)} desativado={travado || no.bloqueado} aoConfirmar={(v) => alterar({ x: num(v) }, `mover ${no!.nome}`)} />
                <Campo tipo="number" rotulo="Y" valor={Math.round(no.y)} desativado={travado || no.bloqueado} aoConfirmar={(v) => alterar({ y: num(v) }, `mover ${no!.nome}`)} />
                <Campo tipo="number" rotulo="L" valor={Math.round(no.largura)} desativado={travado || no.bloqueado} aoConfirmar={(v) => alterar({ largura: num(v) }, `redimensionar ${no!.nome}`)} />
                <Campo tipo="number" rotulo="A" valor={Math.round(no.altura)} desativado={travado || no.bloqueado} aoConfirmar={(v) => alterar({ altura: num(v) }, `redimensionar ${no!.nome}`)} />
                <Campo tipo="number" rotulo="Rotação °" valor={no.rotacao} desativado={travado || no.bloqueado} aoConfirmar={(v) => alterar({ rotacao: num(v) }, `girar ${no!.nome}`)} />
              </>
            )}
            <Campo tipo="number" rotulo="Opacidade %" valor={Math.round(no.opacidade * 100)} desativado={travado || no.bloqueado} aoConfirmar={(v) => alterar({ opacidade: Math.min(1, Math.max(0, num(v) / 100)) }, `opacidade de ${no!.nome}`)} />
            <label className="campo">
              <span>Mesclagem</span>
              <select value={no.modoDeMesclagem} disabled={travado || no.bloqueado} onChange={(e) => alterar({ modoDeMesclagem: e.target.value }, `mesclagem de ${no!.nome}`)}>
                {no.tipo === 'grupo' && <option value="atravessar">Atravessar</option>}
                {MODOS_DE_MESCLAGEM.map((m) => (
                  <option key={m} value={m}>
                    {ROTULO_DO_MODO[m]}
                  </option>
                ))}
              </select>
            </label>
            <label className="campo largo marcar">
              <input type="checkbox" checked={no.recortadaNaDeBaixo} disabled={travado || no.bloqueado} onChange={(e) => alterar({ recortadaNaDeBaixo: e.target.checked }, `máscara de recorte em ${no!.nome}`)} />
              <span>Máscara de recorte (aparece só onde a camada de baixo tem pixel)</span>
            </label>
          </Grupo>

          <Mascara no={no} desativado={travado || no.bloqueado} alterar={alterar} />
          {no.tipo === 'vetor' && <CoresDoVetor no={no} doc={doc} desativado={travado || no.bloqueado} recolorir={(cores, descricao) => void aplicar(descricao, [{ op: 'recolorir', alvo: no.id, cores }])} />}
          {ehVisual(no) && <EfeitosDeCamada no={no} desativado={travado || no.bloqueado} alterar={alterar} />}
          {no.tipo === 'ajuste' && <EditorDeAjuste no={no} desativado={travado || no.bloqueado} alterar={alterar} />}
          {ehVisual(no) && <Filtros no={no} desativado={travado || no.bloqueado} alterar={alterar} />}

          {no.tipo === 'texto' && (
            <Grupo titulo="Texto">
              <label className="campo largo">
                <span>Conteúdo</span>
                <TextoLongo valor={no.conteudo} desativado={travado || no.bloqueado} aoConfirmar={(v) => alterar({ conteudo: v }, `texto de ${no!.nome}`)} />
              </label>
              <label className="campo largo">
                <span>Fonte</span>
                <EscolhaDeFonte valor={no.fonte} desativado={travado || no.bloqueado} aoEscolher={(f) => alterar({ fonte: f }, `fonte de ${no!.nome}`)} />
              </label>
              <label className="campo">
                <span>Peso</span>
                <select value={no.peso} disabled={travado || no.bloqueado} onChange={(e) => alterar({ peso: Number(e.target.value) }, `peso de ${no!.nome}`)}>
                  <option value={300}>Leve</option>
                  <option value={400}>Regular</option>
                  <option value={500}>Médio</option>
                  <option value={600}>Seminegrito</option>
                  <option value={700}>Negrito</option>
                </select>
              </label>
              <label className="campo marcar">
                <input type="checkbox" checked={no.versalete} disabled={travado || no.bloqueado} onChange={(e) => alterar({ versalete: e.target.checked }, `versalete em ${no!.nome}`)} />
                <span>Versalete</span>
              </label>
              <label className="campo marcar">
                <input type="checkbox" checked={no.kerning !== 'nenhum'} disabled={travado || no.bloqueado} onChange={(e) => alterar({ kerning: e.target.checked ? 'metrico' : 'nenhum' }, `kerning em ${no!.nome}`)} />
                <span>Kerning da fonte</span>
              </label>
              <Campo tipo="number" rotulo="Tamanho px" valor={no.tamanho} desativado={travado || no.bloqueado} aoConfirmar={(v) => alterar({ tamanho: num(v) }, `tamanho de ${no!.nome}`)} />
              <Campo tipo="number" rotulo="Entrelinha" valor={no.entrelinha} desativado={travado || no.bloqueado} aoConfirmar={(v) => alterar({ entrelinha: num(v) }, `entrelinha de ${no!.nome}`)} />
              <Campo tipo="number" rotulo="Tracking" valor={no.espacamento} desativado={travado || no.bloqueado} aoConfirmar={(v) => alterar({ espacamento: num(v) }, `tracking de ${no!.nome}`)} />
              <div className="campo largo">
                <span>Alinhamento</span>
                <div className="segmentado" role="group" aria-label="Alinhamento">
                  {(['esquerda', 'centro', 'direita'] as const).map((a) => (
                    <button key={a} type="button" disabled={travado || no!.bloqueado} aria-pressed={no!.tipo === 'texto' && no!.alinhamento === a} onClick={() => alterar({ alinhamento: a }, `alinhar ${no!.nome}`)}>
                      {a === 'esquerda' ? 'Esquerda' : a === 'centro' ? 'Centro' : 'Direita'}
                    </button>
                  ))}
                  <button type="button" disabled={travado || no.bloqueado} aria-pressed={no.caixaAlta} onClick={() => alterar({ caixaAlta: !(no as Extract<No, { tipo: 'texto' }>).caixaAlta }, `caixa alta em ${no!.nome}`)}>
                    AA
                  </button>
                </div>
              </div>
              <CampoDeCor rotulo="Cor" valor={no.cor} doc={doc} desativado={travado || no.bloqueado} aoConfirmar={(v) => alterar({ cor: v }, `cor de ${no!.nome}`)} />
            </Grupo>
          )}

          {no.tipo === 'forma' && (
            <Grupo titulo="Forma">
              {typeof no.preenchimento === 'string' ? (
                <CampoDeCor rotulo="Preenchimento" valor={no.preenchimento} doc={doc} desativado={travado || no.bloqueado} aoConfirmar={(v) => alterar({ preenchimento: v }, `cor de ${no!.nome}`)} />
              ) : (
                <EditorDeDegrade degrade={no.preenchimento} doc={doc} desativado={travado || no.bloqueado} aoMudar={(d) => alterar({ preenchimento: d }, `degradê de ${no!.nome}`)} />
              )}
              {no.traco && (
                <p className="efeito">
                  Traço interno {no.traco.espessura} px
                  <button type="button" disabled={travado || no.bloqueado} onClick={() => alterar({ traco: null }, `remover traço de ${no!.nome}`)}>
                    remover
                  </button>
                </p>
              )}
              {no.forma === 'retangulo' && <Campo tipo="number" rotulo="Raio" valor={no.raio} desativado={travado || no.bloqueado} aoConfirmar={(v) => alterar({ raio: num(v) }, `raio de ${no!.nome}`)} />}
            </Grupo>
          )}

          {no.tipo === 'imagem' && (
            <Grupo titulo="Imagem">
              <label className="campo">
                <span>Ajuste</span>
                <select value={no.ajuste} disabled={travado || no.bloqueado} onChange={(e) => alterar({ ajuste: e.target.value }, `ajuste de ${no!.nome}`)}>
                  <option value="cobrir">Cobrir</option>
                  <option value="conter">Conter</option>
                </select>
              </label>
              {no.ajuste === 'cobrir' && (
                <>
                  <Campo tipo="number" rotulo="Foco X %" valor={Math.round(no.foco.x * 100)} desativado={travado || no.bloqueado} aoConfirmar={(v) => alterar({ foco: { ...(no as Extract<No, { tipo: 'imagem' }>).foco, x: Math.min(1, Math.max(0, num(v) / 100)) } }, `enquadrar ${no!.nome}`)} />
                  <Campo tipo="number" rotulo="Foco Y %" valor={Math.round(no.foco.y * 100)} desativado={travado || no.bloqueado} aoConfirmar={(v) => alterar({ foco: { ...(no as Extract<No, { tipo: 'imagem' }>).foco, y: Math.min(1, Math.max(0, num(v) / 100)) } }, `enquadrar ${no!.nome}`)} />
                  <Campo tipo="number" rotulo="Zoom" valor={no.zoom} desativado={travado || no.bloqueado} aoConfirmar={(v) => alterar({ zoom: Math.min(4, Math.max(1, num(v))) }, `zoom de ${no!.nome}`)} />
                </>
              )}
              <AjustesDaFoto no={no} doc={doc} desativado={travado || no.bloqueado} alterar={alterar} />
              <p className="credito">
                {no.larguraOriginal}×{no.alturaOriginal} px
                {no.origem && (
                  <>
                    <br />
                    {no.origem.banco}
                    {no.origem.autor !== 'conta' && <> · {no.origem.autor}</>}
                    {no.origem.url && (
                      <>
                        {' · '}
                        <a href={no.origem.url} target="_blank" rel="noreferrer">
                          origem
                        </a>
                      </>
                    )}
                  </>
                )}
              </p>
            </Grupo>
          )}

          {ehVisual(no) && no.sombra && (
            <p className="efeito solto">
              Sombra projetada: {no.sombra.distancia} px, desfoque {no.sombra.desfoque} px, {Math.round(no.sombra.opacidade * 100)}%
              <button type="button" disabled={travado || no.bloqueado} onClick={() => alterar({ sombra: null }, `remover sombra de ${no!.nome}`)}>
                remover
              </button>
            </p>
          )}
          <div className="acoes-camada">
            <button type="button" disabled={travado || no.bloqueado} onClick={() => void aplicar(`trazer ${no!.nome} para a frente`, [{ op: 'reordenar', alvo: no!.id, posicao: 'frente' }])}>
              Trazer para frente
            </button>
            <button type="button" disabled={travado || no.bloqueado} onClick={() => void aplicar(`enviar ${no!.nome} para trás`, [{ op: 'reordenar', alvo: no!.id, posicao: 'tras' }])}>
              Enviar para trás
            </button>
            <button type="button" className="perigo" disabled={travado || no.bloqueado} onClick={() => void aplicar(`remover ${no!.nome}`, [{ op: 'remover', alvo: no!.id }])}>
              Remover
            </button>
          </div>
        </>
      )}
    </section>
  );
}

function TextoLongo({ valor, aoConfirmar, desativado }: { valor: string; aoConfirmar: (v: string) => void; desativado?: boolean }) {
  const [r, setR] = useState(valor);
  useEffect(() => {
    setR(valor);
  }, [valor]);
  return <textarea rows={3} value={r} disabled={desativado} onChange={(e) => setR(e.target.value)} onBlur={() => r !== valor && aoConfirmar(r)} />;
}

function Tokens() {
  const { doc, aplicar, tarefa } = useEditor();
  if (!doc) return null;
  const tokens = Object.entries(doc.tokens.cores);
  if (tokens.length === 0) return null;
  return (
    <Grupo titulo="Identidade visual (tokens)">
      {tokens.map(([nome, valor]) => (
        <label key={nome} className="campo largo token">
          <input type="color" value={valor} disabled={tarefa?.estado === 'rodando'} onChange={(e) => void aplicar(`token ${nome}`, [{ op: 'definirToken', nome, valor: e.target.value }])} />
          <span className="nome-token">{nome}</span>
          <code>{valor}</code>
        </label>
      ))}
    </Grupo>
  );
}

function EditorDeDegrade({ degrade, doc, aoMudar, desativado }: { degrade: Degrade; doc: Documento; aoMudar: (d: Degrade) => void; desativado?: boolean }) {
  const parada = (i: number, mudanca: Partial<Degrade['paradas'][number]>) => aoMudar({ ...degrade, paradas: degrade.paradas.map((p, j) => (j === i ? { ...p, ...mudanca } : p)) });
  return (
    <div className="campo largo degrade">
      <span>
        Degradê {degrade.tipo} · {degrade.angulo}°
      </span>
      <div className="amostra-degrade" style={{ background: `linear-gradient(${90 - degrade.angulo}deg, ${degrade.paradas.map((p) => `${resolverCor(doc, p.cor)}${Math.round(p.opacidade * 255).toString(16).padStart(2, '0')} ${p.posicao * 100}%`).join(', ')})` }} />
      {degrade.paradas.map((p, i) => (
        <div key={i} className="parada">
          <input type="color" value={resolverCor(doc, p.cor)} disabled={desativado} onChange={(e) => parada(i, { cor: e.target.value })} aria-label={`cor da parada ${i + 1}`} />
          <code>{Math.round(p.posicao * 100)}%</code>
          <input type="range" min={0} max={100} value={Math.round(p.opacidade * 100)} disabled={desativado} onChange={(e) => parada(i, { opacidade: Number(e.target.value) / 100 })} aria-label={`opacidade da parada ${i + 1}`} />
        </div>
      ))}
      <Campo tipo="number" rotulo="Ângulo" valor={degrade.angulo} desativado={desativado} aoConfirmar={(v) => aoMudar({ ...degrade, angulo: Number(v) })} />
    </div>
  );
}

type NoImagem = Extract<No, { tipo: 'imagem' }>;

function AjustesDaFoto({ no, doc, desativado, alterar }: { no: NoImagem; doc: Documento; desativado: boolean; alterar: (props: Record<string, unknown>, descricao: string) => void }) {
  const a = no.ajusteDeCor ?? { brilho: 0, contraste: 0, saturacao: 0 };
  const mudarAjuste = (m: Partial<NonNullable<NoImagem['ajusteDeCor']>>, d: string) => alterar({ ajusteDeCor: { ...a, ...m } }, `${d} de ${no.nome}`);
  const faixa = (rotulo: string, chave: 'brilho' | 'contraste' | 'saturacao') => (
    <label className="campo largo faixa">
      <span>
        {rotulo} <code>{a[chave]}</code>
      </span>
      <input type="range" min={-100} max={100} value={a[chave]} disabled={desativado} onChange={(e) => mudarAjuste({ [chave]: Number(e.target.value) }, rotulo.toLowerCase())} />
    </label>
  );
  return (
    <>
      {faixa('Brilho', 'brilho')}
      {faixa('Contraste', 'contraste')}
      {faixa('Saturação', 'saturacao')}
      <div className="campo largo">
        <span>Duotone</span>
        {a.duotone ? (
          <div className="linha-cor">
            <input type="color" value={resolverCor(doc, a.duotone.sombras)} disabled={desativado} onChange={(e) => mudarAjuste({ duotone: { ...a.duotone!, sombras: e.target.value } }, 'duotone')} aria-label="cor das sombras" />
            <input type="color" value={resolverCor(doc, a.duotone.luzes)} disabled={desativado} onChange={(e) => mudarAjuste({ duotone: { ...a.duotone!, luzes: e.target.value } }, 'duotone')} aria-label="cor das luzes" />
            <button type="button" className="texto-botao" disabled={desativado} onClick={() => alterar({ ajusteDeCor: { brilho: a.brilho, contraste: a.contraste, saturacao: a.saturacao } }, `remover duotone de ${no.nome}`)}>
              remover
            </button>
          </div>
        ) : (
          <button type="button" className="texto-botao" disabled={desativado} onClick={() => mudarAjuste({ duotone: { sombras: '#000000', luzes: '#ffffff' } }, 'duotone')}>
            aplicar duotone
          </button>
        )}
      </div>
    </>
  );
}

const ROTULO_DO_MODO: Record<(typeof MODOS_DE_MESCLAGEM)[number], string> = {
  normal: 'Normal',
  escurecer: 'Escurecer',
  multiplicacao: 'Multiplicação',
  'subexposicao-de-cores': 'Subexposição de cores',
  'subexposicao-linear': 'Subexposição linear',
  'cor-mais-escura': 'Cor mais escura',
  clarear: 'Clarear',
  tela: 'Tela',
  'superexposicao-de-cores': 'Superexposição de cores',
  'superexposicao-linear': 'Superexposição linear (adicionar)',
  'cor-mais-clara': 'Cor mais clara',
  sobrepor: 'Sobrepor',
  'luz-suave': 'Luz suave',
  'luz-direta': 'Luz direta',
  'luz-intensa': 'Luz intensa',
  'luz-linear': 'Luz linear',
  'luz-do-ponto': 'Luz do ponto',
  'mistura-solida': 'Mistura sólida',
  diferenca: 'Diferença',
  exclusao: 'Exclusão',
  subtrair: 'Subtrair',
  dividir: 'Dividir',
  matiz: 'Matiz',
  saturacao: 'Saturação',
  cor: 'Cor',
  luminosidade: 'Luminosidade',
};

type Alterar = (props: Record<string, unknown>, descricao: string) => void;

function Mascara({ no, desativado, alterar }: { no: No; desativado: boolean; alterar: Alterar }) {
  const { doc, avisar } = useEditor();
  const [recortando, setRecortando] = useState(false);
  const caixa = caixaDe(no);
  const m = no.mascara;
  const descricao = !m ? 'sem máscara' : m.tipo === 'degrade' ? `degradê ${m.angulo}°, de ${Math.round(m.inicio * 100)}% a ${Math.round(m.fim * 100)}%` : m.tipo === 'forma' ? `${m.forma}${m.suavizar ? `, borda suave ${m.suavizar} px` : ''}${m.inverter ? ', invertida' : ''}` : `sujeito recortado${m.inverter ? ' (invertida: só o fundo)' : ''}`;
  if (!doc) return null;
  return (
    <Grupo titulo="Máscara de camada">
      <p className="efeito">
        {descricao}
        {m && (
          <>
            <button type="button" disabled={desativado} onClick={() => alterar({ mascara: m.tipo === 'degrade' ? null : { ...m, inverter: !('inverter' in m && m.inverter) } }, `${m.tipo === 'degrade' ? 'remover' : 'inverter'} máscara de ${no.nome}`)}>
              {m.tipo === 'degrade' ? 'remover' : 'inverter'}
            </button>
            {m.tipo !== 'degrade' && (
              <button type="button" disabled={desativado} onClick={() => alterar({ mascara: null }, `remover máscara de ${no.nome}`)}>
                remover
              </button>
            )}
          </>
        )}
      </p>
      {!m && (
        <div className="botoes-mascara">
          <button type="button" className="texto-botao" disabled={desativado} onClick={() => alterar({ mascara: { tipo: 'degrade', angulo: 90, inicio: 0.3, fim: 1 } }, `máscara em ${no.nome}`)}>
            esmaecer para cima
          </button>
          {caixa && (
            <button type="button" className="texto-botao" disabled={desativado} onClick={() => alterar({ mascara: { tipo: 'forma', forma: 'elipse', x: caixa.x, y: caixa.y, largura: caixa.w, altura: caixa.h, suavizar: Math.round(Math.min(caixa.w, caixa.h) * 0.12) } }, `vinheta em ${no.nome}`)}>
              elipse de borda suave
            </button>
          )}
          {no.tipo === 'imagem' && (
            <button
              type="button"
              className="texto-botao"
              disabled={desativado || recortando}
              onClick={async () => {
                setRecortando(true);
                try {
                  const s = await api.recortarSujeito(no.arquivo);
                  alterar({ mascara: { tipo: 'sujeito', arquivo: s.arquivo } }, `recortar sujeito de ${no.nome}`);
                } catch (e) {
                  avisar(e instanceof Error ? e.message : String(e));
                }
                setRecortando(false);
              }}
            >
              {recortando ? 'recortando o sujeito…' : 'recortar o sujeito'}
            </button>
          )}
        </div>
      )}
    </Grupo>
  );
}

function EditorDeAjuste({ no, desativado, alterar }: { no: Extract<No, { tipo: 'ajuste' }>; desativado: boolean; alterar: Alterar }) {
  const a = no.ajuste as Record<string, unknown>;
  const numericos = Object.entries(a).filter(([, v]) => typeof v === 'number') as [string, number][];
  return (
    <Grupo titulo={`Ajuste: ${no.ajuste.tipo.replace(/-/g, ' ')}`}>
      {numericos.map(([k, v]) => (
        <Campo key={k} tipo="number" rotulo={k.replace(/([A-Z])/g, ' $1').toLowerCase()} valor={v} desativado={desativado} aoConfirmar={(t) => alterar({ ajuste: { ...a, [k]: Number(t.replace(',', '.')) } }, `ajuste de ${no.nome}`)} />
      ))}
      <label className="campo largo">
        <span>Parâmetros (JSON)</span>
        <TextoLongo
          valor={JSON.stringify(no.ajuste)}
          desativado={desativado}
          aoConfirmar={(t) => {
            try {
              alterar({ ajuste: JSON.parse(t) }, `ajuste de ${no.nome}`);
            } catch {
              // JSON inválido: a operação não sai, o campo volta
            }
          }}
        />
      </label>
    </Grupo>
  );
}

const FILTROS_PRONTOS = [
  { rotulo: 'desfoque', filtro: { tipo: 'desfoque', raio: 8 } },
  { rotulo: 'grão', filtro: { tipo: 'ruido', quantidade: 0.12, monocromatico: true } },
  { rotulo: 'nitidez', filtro: { tipo: 'nitidez', quantidade: 0.8, raio: 2 } },
  { rotulo: 'desfoque de movimento', filtro: { tipo: 'desfoque-de-movimento', angulo: 0, distancia: 30 } },
] as const;

function Filtros({ no, desativado, alterar }: { no: Extract<No, { tipo: 'forma' | 'texto' | 'imagem' | 'vetor' }>; desativado: boolean; alterar: Alterar }) {
  const filtros = no.filtros ?? [];
  if (no.tipo === 'texto') return null;
  return (
    <Grupo titulo={no.tipo === 'imagem' ? 'Filtros inteligentes' : 'Filtros'}>
      {filtros.map((f, i) => (
        <p key={i} className="efeito">
          {f.tipo === 'desfoque' ? `desfoque ${f.raio} px` : f.tipo === 'ruido' ? `grão ${Math.round(f.quantidade * 100)}%` : f.tipo === 'nitidez' ? `nitidez ${f.quantidade} (${f.raio} px)` : `movimento ${f.distancia} px a ${f.angulo}°`}
          <button type="button" disabled={desativado} onClick={() => alterar(filtros.length === 1 ? { filtros: null } : { filtros: filtros.filter((_, j) => j !== i) }, `remover filtro de ${no.nome}`)}>
            remover
          </button>
        </p>
      ))}
      <div className="botoes-mascara">
        {FILTROS_PRONTOS.map((f) => (
          <button key={f.rotulo} type="button" className="texto-botao" disabled={desativado} onClick={() => alterar({ filtros: [...filtros, f.filtro] }, `${f.rotulo} em ${no.nome}`)}>
            + {f.rotulo}
          </button>
        ))}
      </div>
    </Grupo>
  );
}

/** Fonte: biblioteca base ou qualquer família do Google Fonts (com busca). */
export function EscolhaDeFonte({ valor, desativado, aoEscolher }: { valor: string; desativado: boolean; aoEscolher: (f: string) => void }) {
  const catalogo = useCatalogoDeFontes();
  const lista = useId();
  const [rascunho, setRascunho] = useState(valor);
  useEffect(() => setRascunho(valor), [valor]);
  const base = familiasDisponiveis();
  const confirmar = () => {
    const f = rascunho.trim();
    if (!f || f === valor) return;
    if (base.includes(f) || catalogo.some((c) => c.familia === f)) aoEscolher(f);
    else setRascunho(valor);
  };
  return (
    <>
      <input
        list={lista}
        value={rascunho}
        disabled={desativado}
        onChange={(e) => setRascunho(e.target.value)}
        onBlur={confirmar}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        aria-label="Fonte (biblioteca ou Google Fonts)"
      />
      <datalist id={lista}>
        {base.map((f) => (
          <option key={`b-${f}`} value={f}>
            biblioteca
          </option>
        ))}
        {catalogo.slice(0, 1900).map((c) => (
          <option key={c.familia} value={c.familia}>
            Google Fonts · {c.categoria}
          </option>
        ))}
      </datalist>
    </>
  );
}

function CoresDoVetor({ no, doc, desativado, recolorir }: { no: Extract<No, { tipo: 'vetor' }>; doc: Documento; desativado: boolean; recolorir: (cores: Record<string, string>, descricao: string) => void }) {
  const cores = coresDoVetor(no);
  const trocar = (de: string, para: string) => recolorir({ [de]: para }, `cor do ${no.nome}`);
  return (
    <Grupo titulo={`Cores do vetor${no.origem ? ` (${no.origem.nome})` : ''}`}>
      {cores.map((c) => (
        <label key={c} className="campo token">
          <input type="color" value={resolverCor(doc, c)} disabled={desativado} onChange={(e) => trocar(c, e.target.value)} />
          <code>{c}</code>
        </label>
      ))}
      {Object.keys(doc.tokens.cores).length > 0 && (
        <label className="campo largo">
          <span>Versão monocromática</span>
          <select value="" disabled={desativado} onChange={(e) => e.target.value && recolorir({ '*': e.target.value }, `logo monocromático em ${no.nome}`)}>
            <option value="">escolher token…</option>
            {Object.keys(doc.tokens.cores).map((t) => (
              <option key={t} value={`token:${t}`}>
                {t}
              </option>
            ))}
          </select>
        </label>
      )}
    </Grupo>
  );
}

const EFEITOS_PRONTOS = {
  sombraInterna: { rotulo: 'sombra interna', valor: { cor: '#000000', opacidade: 0.4, distancia: 6, angulo: 90, desfoque: 12 } },
  brilhoExterno: { rotulo: 'brilho externo', valor: { cor: '#ffffff', opacidade: 0.5, tamanho: 30 } },
  brilhoInterno: { rotulo: 'brilho interno', valor: { cor: '#ffffff', opacidade: 0.4, tamanho: 20 } },
  sobreposicaoDeCor: { rotulo: 'sobreposição de cor', valor: { cor: '#000000', opacidade: 1, modoDeMesclagem: 'normal' } },
  sobreposicaoDeDegrade: { rotulo: 'sobreposição de degradê', valor: { degrade: { tipo: 'linear', angulo: 90, paradas: [{ cor: '#000000', posicao: 0, opacidade: 0.6 }, { cor: '#000000', posicao: 1, opacidade: 0 }] }, opacidade: 1, modoDeMesclagem: 'normal' } },
} as const;

function EfeitosDeCamada({ no, desativado, alterar }: { no: Extract<No, { tipo: 'forma' | 'texto' | 'imagem' | 'vetor' }>; desativado: boolean; alterar: Alterar }) {
  const atuais = no.efeitos ?? {};
  const mudar = (chave: keyof typeof EFEITOS_PRONTOS, ligar: boolean) => {
    const proximo: Record<string, unknown> = { ...atuais };
    if (ligar) proximo[chave] = EFEITOS_PRONTOS[chave].valor;
    else delete proximo[chave];
    alterar(Object.keys(proximo).length ? { efeitos: proximo } : { efeitos: null }, `${EFEITOS_PRONTOS[chave].rotulo} em ${no.nome}`);
  };
  return (
    <Grupo titulo="Efeitos de camada">
      {(Object.keys(EFEITOS_PRONTOS) as (keyof typeof EFEITOS_PRONTOS)[]).map((k) => (
        <label key={k} className="campo marcar">
          <input type="checkbox" checked={Boolean(atuais[k])} disabled={desativado} onChange={(e) => mudar(k, e.target.checked)} />
          <span>{EFEITOS_PRONTOS[k].rotulo}</span>
        </label>
      ))}
    </Grupo>
  );
}
