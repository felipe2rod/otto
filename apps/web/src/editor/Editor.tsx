'use client';

// Casca do editor (docs/mvp/experiencia.md, seção 4.1): ferramentas e Otto à esquerda, Propriedades
// e Camadas à direita, canvas no meio.
//
// O estado mora fora do React, em três partes (docs/mvp/frontend.md, seção 3): documento, tarefa do
// Otto e interface. Aqui nascem a visão (câmera), a interface e, quando a peça abre, a sessão do
// documento: é por ela que TODO gesto (arraste, seta, painel, Delete) vira lote do catálogo, com a
// fila otimista, o conflito de versão e a falta de conexão tratados num lugar só.
import type { Documento, Medidor, Operacao } from '@otto/documento';
import { useEffect, useMemo, useRef, useState } from 'react';
import { editor as textos } from '../textos/editor';
import { erros } from '../textos/erros';
import { type AmbienteDoEditor, ProvedorDoEditor } from './ambiente';
import { AreaDoCanvas } from './canvas/AreaDoCanvas';
import { caixaDoConteudo } from './canvas/guias';
import { type FabricaDeMotor, type MotorDeRender, naoDesenhado } from './canvas/motor';
import { temWebGL as detectarWebGL } from './canvas/webgl';
import { type FaltasDoRender, SEM_FALTAS } from './casca/AvisosDoRender';
import { BarraDeFerramentas } from './casca/BarraDeFerramentas';
import { BarraDoTopo } from './casca/BarraDoTopo';
import { EstadoDaPeca, type SituacaoDaPeca } from './casca/EstadoDaPeca';
import { Painel } from './casca/Painel';
import estilos from './Editor.module.css';
import { criarFonteDaApi, type FonteDaPeca } from './fonteDaPeca';
import { loteDeMoverPorSeta, loteDeRemover, loteDeReordenar } from './nucleo/acoes';
import { criarArmazem, useArmazem } from './nucleo/armazem';
import { resolverAtalho } from './nucleo/atalhos';
import { aplicadorDoCatalogo } from './nucleo/catalogo';
import { criarInterface } from './nucleo/interface';
import { criarSessaoDoDocumento, type RespostaDoEnvio, type Salvamento, type SessaoDoDocumento } from './nucleo/sessaoDoDocumento';
import { criarVisao } from './nucleo/visao';
import { PainelDeCamadas } from './paineis/PainelDeCamadas';
import { PainelDePropriedades } from './paineis/PainelDePropriedades';
import { SENTINELA_DO_EDITOR } from './sentinela';

type Sessao = SessaoDoDocumento<Documento, Operacao>;

export interface PropriedadesDoEditor {
  pecaId: string;
  /** De onde vem a peça e para onde vão os lotes. Padrão: a API. */
  fonte?: FonteDaPeca;
  criarMotor?: FabricaDeMotor;
  temWebGL?: () => boolean;
}

/** O que o topo mostra da sessão. Só muda quando um destes campos muda. */
export interface EstadoDaPecaAberta {
  salvamento: Salvamento;
  pendentes: number;
  versao: number;
  somenteLeitura: boolean;
}

const SEM_PECA: EstadoDaPecaAberta = { salvamento: 'salvo', pendentes: 0, versao: 0, somenteLeitura: true };
const INTERVALO_DE_NOVA_TENTATIVA = 5000;
const DURACAO_DO_AVISO = 7000;

const emCampoDeTexto = (alvo: EventTarget | null): boolean => alvo instanceof HTMLElement && (alvo.closest('input, textarea, select') !== null || alvo.isContentEditable);

/** Foco em lugar nenhum ou na área do canvas: é onde o Tab, o espaço e as setas são do editor, não da navegação. */
function focoNoCanvas(): boolean {
  const ativo = document.activeElement;
  return ativo === null || ativo === document.body || (ativo instanceof HTMLElement && ativo.closest('[data-area-do-canvas]') !== null);
}

const semDestino = async (): Promise<RespostaDoEnvio<Documento>> => ({ tipo: 'recusado', codigo: 'somente_leitura' });

export function Editor({ pecaId, fonte: fonteDeFora, criarMotor, temWebGL = detectarWebGL }: PropriedadesDoEditor) {
  const [fontePadrao] = useState(() => (fonteDeFora ? undefined : criarFonteDaApi(pecaId)));
  const fonte = (fonteDeFora ?? fontePadrao) as FonteDaPeca;

  // armazéns criados uma vez por editor montado; nenhum deles é estado do React
  const [visao] = useState(criarVisao);
  const [iface] = useState(criarInterface);
  const [documento] = useState(() => criarArmazem<Documento | undefined>(undefined));
  const [estado] = useState(() => criarArmazem<EstadoDaPecaAberta>(SEM_PECA));
  const [somenteLeitura] = useState(() => criarArmazem(true));
  const [faltas] = useState(() => criarArmazem<FaltasDoRender>(SEM_FALTAS));
  const [aviso] = useState(() => criarArmazem<string | null>(null));

  const [comWebGL] = useState(temWebGL);
  const [situacao, setSituacao] = useState<SituacaoDaPeca>({ estado: 'abrindo' });
  const [tentativa, setTentativa] = useState(0);
  const paineisVisiveis = useArmazem(iface.armazem, (e) => e.paineisVisiveis);
  const mensagem = useArmazem(aviso, (a) => a);
  const semConexao = useArmazem(estado, (e) => e.salvamento === 'sem-conexao');

  // A sessão e o motor mudam sem ninguém precisar renderizar: ficam em ref, lidos por função estável.
  const sessaoRef = useRef<Sessao | undefined>(undefined);
  const medidorRef = useRef<Medidor | undefined>(undefined);
  const revertendo = useRef(false);
  const [obterSessao] = useState(() => () => sessaoRef.current);
  const [aoTerMotor] = useState(() => (motor: MotorDeRender | null) => {
    // o medidor de tinta é o do motor: o mesmo motor de texto do servidor (alinhar e distribuir)
    medidorRef.current = motor?.medidor;
  });
  const [aoPrepararRecursos] = useState(() => (motor: MotorDeRender) => {
    const emFalta = motor.emFalta;
    faltas.definir((f) => ({ ...f, emFalta }));
  });

  /** O que os painéis e os atalhos usam para escrever: um caminho só, sempre pela sessão. */
  const ambiente = useMemo<AmbienteDoEditor>(
    () => ({
      interface: iface,
      documento,
      somenteLeitura,
      listarFontes: () => fonte.listarFontes(),
      aplicar(lote) {
        const sessao = sessaoRef.current;
        if (!lote || !sessao) return false;
        const r = sessao.aplicar(lote.descricao, lote.operacoes);
        // o motivo local é texto do catálogo, escrito para o agente: a tela diz a frase dela
        if (!r.ok) aviso.definir(erros.doCodigo(r.motivo === 'somente_leitura' || r.motivo === 'sem_conexao' ? r.motivo : 'lote_invalido'));
        return r.ok;
      },
    }),
    [iface, documento, somenteLeitura, fonte, aviso],
  );

  // Abre a peça e cria a sessão do documento. Sem WebGL nem busca: a peça não abre assim.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `tentativa` existe para o "tentar de novo" repetir a busca
  useEffect(() => {
    if (!comWebGL) return;
    let desmontado = false;
    let pararDeOuvir: (() => void) | undefined;
    setSituacao({ estado: 'abrindo' });

    void fonte.abrir(pecaId).then((aberta) => {
      if (desmontado) return;
      if (aberta.estado !== 'aberta') {
        setSituacao(aberta);
        return;
      }
      const lotes = fonte.lotes;
      const sessao = criarSessaoDoDocumento<Documento, Operacao>(
        { doc: aberta.peca.arvore, versao: aberta.peca.versao },
        {
          aplicar: aplicadorDoCatalogo(() => medidorRef.current),
          enviar: lotes ? (lote) => lotes.enviar(lote) : semDestino,
          recarregar: async () => {
            const atual = await fonte.abrir(pecaId);
            if (atual.estado !== 'aberta') throw new Error(`a peça não reabriu: ${atual.estado}`);
            return { doc: atual.peca.arvore, versao: atual.peca.versao };
          },
          gerarId: () => crypto.randomUUID(),
        },
      );
      if (!lotes) sessao.definirSomenteLeitura(true);
      sessaoRef.current = sessao;

      let docAnterior: Documento | undefined;
      const espelhar = () => {
        const e = sessao.obter();
        // canvas e painéis leem o documento visível: o confirmado com os lotes ainda por confirmar
        documento.definir(e.visivel);
        somenteLeitura.definir(e.somenteLeitura || e.salvamento === 'sem-conexao');
        estado.definir((a) =>
          a.salvamento === e.salvamento && a.pendentes === e.pendentes && a.versao === e.versao && a.somenteLeitura === e.somenteLeitura
            ? a
            : { salvamento: e.salvamento, pendentes: e.pendentes, versao: e.versao, somenteLeitura: e.somenteLeitura },
        );
        if (e.visivel !== docAnterior) {
          docAnterior = e.visivel;
          const lista = naoDesenhado(e.visivel);
          faltas.definir((f) => ({ ...f, naoDesenhado: lista }));
        }
        if (e.recusa) {
          aviso.definir(erros.doCodigo(e.recusa.codigo));
          sessao.dispensarRecusa();
        }
      };
      pararDeOuvir = sessao.assinar(espelhar);
      espelhar();
      setSituacao({ estado: 'aberta', nome: aberta.peca.nome });
    });
    return () => {
      desmontado = true;
      pararDeOuvir?.();
      sessaoRef.current = undefined;
    };
  }, [fonte, pecaId, comWebGL, documento, estado, somenteLeitura, faltas, aviso, tentativa]);

  const nome = situacao.estado === 'aberta' ? situacao.nome : undefined;
  useEffect(() => {
    document.title = textos.tituloDaPagina(nome);
  }, [nome]);

  // Desfazer e refazer são da API: ela grava um lote de reversão e devolve a árvore, que a sessão adota.
  const [reverter] = useState(() => async (qual: 'desfazer' | 'refazer') => {
    const sessao = sessaoRef.current;
    const lotes = fonte.lotes;
    if (!sessao || !lotes || revertendo.current) return;
    const e = sessao.obter();
    // com lote por confirmar a versão base ainda não é a do servidor: espera a fila esvaziar
    if (e.somenteLeitura || e.pendentes > 0) return;
    revertendo.current = true;
    const r = await lotes[qual](e.versao).finally(() => {
      revertendo.current = false;
    });
    if (r.ok) sessao.adotar({ doc: r.doc, versao: r.versao });
    else aviso.definir(erros.doCodigo(r.codigo));
  });

  // Atalhos. Uma tabela só (nucleo/atalhos.ts); aqui é só a ligação com o teclado.
  useEffect(() => {
    const aoApertar = (e: KeyboardEvent) => {
      const noCanvas = focoNoCanvas();
      if (e.code === 'Space' && noCanvas && !emCampoDeTexto(e.target)) {
        e.preventDefault();
        iface.segurarMao(true);
        return;
      }
      const acao = resolverAtalho(e, { emCampoDeTexto: emCampoDeTexto(e.target), focoNoCanvas: noCanvas });
      if (!acao || acao.tipo === 'sem-ferramenta') return;
      const doc = documento.obter();
      const { selecao } = iface.armazem.obter();
      switch (acao.tipo) {
        case 'ferramenta':
          iface.escolherFerramenta(acao.ferramenta);
          break;
        case 'alternar-paineis':
          iface.alternarPaineis();
          break;
        case 'enquadrar':
          visao.enquadrar(caixaDoConteudo(doc?.pranchetas ?? []));
          break;
        case 'zoom-em-cem':
          visao.zoomEmCem();
          break;
        case 'zoom':
          visao.zoomPorPasso(acao.sentido);
          break;
        case 'desfazer':
        case 'refazer':
          void reverter(acao.tipo);
          break;
        case 'mover': {
          const lote = doc && loteDeMoverPorSeta(doc, selecao, acao.dx, acao.dy);
          // sem camada selecionada a seta continua sendo do navegador
          if (!lote) return;
          ambiente.aplicar(lote);
          break;
        }
        case 'remover': {
          const lote = doc && loteDeRemover(doc, selecao);
          if (!lote) return;
          if (ambiente.aplicar(lote)) iface.selecionar(null);
          break;
        }
        case 'reordenar': {
          const id = selecao?.tipo === 'camadas' && selecao.ids.length === 1 ? selecao.ids[0] : undefined;
          const lote = doc && id ? loteDeReordenar(doc, id, acao.sentido) : null;
          if (!lote) return;
          ambiente.aplicar(lote);
          break;
        }
      }
      e.preventDefault();
    };
    const aoSoltar = (e: KeyboardEvent) => {
      if (e.code === 'Space') iface.segurarMao(false);
    };
    const aoPerderOFoco = () => iface.segurarMao(false);
    window.addEventListener('keydown', aoApertar);
    window.addEventListener('keyup', aoSoltar);
    window.addEventListener('blur', aoPerderOFoco);
    return () => {
      window.removeEventListener('keydown', aoApertar);
      window.removeEventListener('keyup', aoSoltar);
      window.removeEventListener('blur', aoPerderOFoco);
    };
  }, [iface, visao, documento, ambiente, reverter]);

  // Sem conexão: a edição trava (a sessão recusa lote novo) e o lote parado é reenviado, com o
  // mesmo id, quando o navegador volta a ter rede e de tempos em tempos.
  useEffect(() => {
    if (!semConexao) return;
    const tentar = () => sessaoRef.current?.tentarDeNovo();
    const relogio = setInterval(tentar, INTERVALO_DE_NOVA_TENTATIVA);
    window.addEventListener('online', tentar);
    return () => {
      clearInterval(relogio);
      window.removeEventListener('online', tentar);
    };
  }, [semConexao]);

  // Fechar a aba com lote por confirmar pede confirmação: o que não chegou ao servidor se perde.
  useEffect(() => {
    const aoSair = (e: BeforeUnloadEvent) => {
      if (estado.obter().pendentes > 0) e.preventDefault();
    };
    window.addEventListener('beforeunload', aoSair);
    return () => window.removeEventListener('beforeunload', aoSair);
  }, [estado]);

  // O aviso some sozinho; dá para fechar antes.
  useEffect(() => {
    if (!mensagem) return;
    const relogio = setTimeout(() => aviso.definir(null), DURACAO_DO_AVISO);
    return () => clearTimeout(relogio);
  }, [mensagem, aviso]);

  return (
    <ProvedorDoEditor ambiente={ambiente}>
      <div className={estilos.editor} data-otto={SENTINELA_DO_EDITOR} data-paineis={paineisVisiveis ? 'visiveis' : 'ocultos'}>
        <BarraDoTopo
          nomeDaPeca={nome}
          estado={estado}
          faltas={faltas}
          paineisVisiveis={paineisVisiveis}
          aoAlternarPaineis={iface.alternarPaineis}
          aoDesfazer={() => void reverter('desfazer')}
          aoRefazer={() => void reverter('refazer')}
        />

        <p className={estilos.telaEstreita}>{textos.avisos.telaEstreita}</p>

        {paineisVisiveis && (
          <>
            <BarraDeFerramentas interface={iface} />
            <div className={estilos.esquerda}>
              <Painel titulo={textos.paineis.otto.titulo} vazio={textos.paineis.otto.vazio} destaque />
            </div>
          </>
        )}

        <main className={estilos.centro}>
          {comWebGL ? (
            <>
              <AreaDoCanvas
                visao={visao}
                interface={iface}
                documento={documento}
                sessao={obterSessao}
                aoTerMotor={aoTerMotor}
                aoPrepararRecursos={aoPrepararRecursos}
                recursos={fonte.recursos}
                {...(criarMotor ? { criarMotor } : {})}
              />
              <EstadoDaPeca situacao={situacao} aoTentarDeNovo={() => setTentativa((n) => n + 1)} />
              {semConexao && (
                <p className={estilos.semConexao} role="status">
                  {erros.doCodigo('sem_conexao')}
                </p>
              )}
              {mensagem && (
                <div className={estilos.aviso} role="alert">
                  <p>{mensagem}</p>
                  <button type="button" aria-label={textos.avisos.fechar} onClick={() => aviso.definir(null)}>
                    <span aria-hidden="true">×</span>
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className={estilos.semWebGL} role="alert">
              <strong>{textos.avisos.semWebGL.titulo}</strong>
              <p>{textos.avisos.semWebGL.texto}</p>
            </div>
          )}
        </main>

        {paineisVisiveis && (
          <div className={estilos.direita}>
            <PainelDePropriedades />
            <PainelDeCamadas />
          </div>
        )}
      </div>
    </ProvedorDoEditor>
  );
}
