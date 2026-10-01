'use client';

// Casca do editor (docs/mvp/experiencia.md, seção 4.1): ferramentas e Otto à esquerda, Propriedades
// e Camadas à direita, canvas no meio.
//
// O estado mora fora do React, em três partes (docs/mvp/frontend.md, seção 3): documento, tarefa do
// Otto e interface. Aqui nascem a visão (câmera), a interface e, quando a peça abre, a sessão do
// documento: é por ela que TODO gesto (arraste, seta, painel, Delete) vira lote do catálogo, com a
// fila otimista, o conflito de versão e a falta de conexão tratados num lugar só.
import { type Documento, type Medidor, type Operacao, todasAsCamadas } from '@otto/documento';
import { useEffect, useMemo, useRef, useState } from 'react';
import { editor as textos } from '../textos/editor';
import { erros } from '../textos/erros';
import { type AmbienteDoEditor, ProvedorDoEditor } from './ambiente';
import { AreaDoCanvas, type OndeSoltou } from './canvas/AreaDoCanvas';
import { caixaDoConteudo } from './canvas/guias';
import { type FabricaDeMotor, type MotorDeRender, naoDesenhado, type RecursosEmFalta } from './canvas/motor';
import { temWebGL as detectarWebGL } from './canvas/webgl';
import { type FaltasDoRender, SEM_FALTAS } from './casca/AvisosDoRender';
import { BarraDeFerramentas } from './casca/BarraDeFerramentas';
import { BarraDoTopo } from './casca/BarraDoTopo';
import { EstadoDaPeca, type SituacaoDaPeca } from './casca/EstadoDaPeca';
import { Painel } from './casca/Painel';
import estilos from './Editor.module.css';
import { type Aviso, criarEnvio } from './envio';
import { DialogoDeExportar } from './exportar/DialogoDeExportar';
import { criarExportador } from './exportar/exportador';
import { criarFonteDaApi, type FonteDaPeca } from './fonteDaPeca';
import { loteDeMoverPorSeta, loteDeRemover, loteDeReordenar } from './nucleo/acoes';
import { criarArmazem, useArmazem } from './nucleo/armazem';
import { resolverAtalho } from './nucleo/atalhos';
import { aplicadorDoCatalogo } from './nucleo/catalogo';
import { agruparSelecao, desagruparSelecao, duplicarSelecao } from './nucleo/comandos';
import { criarInterface } from './nucleo/interface';
import { criarSessaoDoDocumento, type Historico, type RespostaDoEnvio, type Salvamento, type SessaoDoDocumento } from './nucleo/sessaoDoDocumento';
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
/** O servidor fala um catálogo de operações mais novo que o desta página: nenhuma escrita entra até recarregar. */
const CATALOGO_DESATUALIZADO = 'catalogo_desatualizado';
const SEM_HISTORICO: Historico = { podeDesfazer: false, podeRefazer: false };
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
  const [aviso] = useState(() => criarArmazem<Aviso | null>(null));
  const [enviando] = useState(() => criarArmazem<readonly string[]>([]));
  // se há o que desfazer e refazer: quem sabe é a API, e ela diz em toda resposta que muda a peça
  const [historico] = useState(() => criarArmazem<Historico>(SEM_HISTORICO));
  // a exportação em andamento mora aqui, não no diálogo: fechar o diálogo não a interrompe
  const [exportador] = useState(() => (fonte.exportacoes ? criarExportador({ api: fonte.exportacoes }) : undefined));
  const [exportando, setExportando] = useState(false);

  const [comWebGL] = useState(temWebGL);
  const [situacao, setSituacao] = useState<SituacaoDaPeca>({ estado: 'abrindo' });
  const [tentativa, setTentativa] = useState(0);
  const [catalogoVelho, setCatalogoVelho] = useState(false);
  const paineisVisiveis = useArmazem(iface.armazem, (e) => e.paineisVisiveis);
  const mensagem = useArmazem(aviso, (a) => a);
  const semConexao = useArmazem(estado, (e) => e.salvamento === 'sem-conexao');
  const fontesEmFalta = useArmazem(faltas, (f) => f.emFalta.fontes);
  const arquivosEmEnvio = useArmazem(enviando, (e) => e);
  const podeEditar = useArmazem(somenteLeitura, (v) => !v);

  // A sessão e o motor mudam sem ninguém precisar renderizar: ficam em ref, lidos por função estável.
  const sessaoRef = useRef<Sessao | undefined>(undefined);
  const medidorRef = useRef<Medidor | undefined>(undefined);
  const revertendo = useRef(false);
  const [obterSessao] = useState(() => () => sessaoRef.current);
  const motorRef = useRef<MotorDeRender | null>(null);
  const [aoTerMotor] = useState(() => (motor: MotorDeRender | null) => {
    motorRef.current = motor;
    // o medidor de tinta é o do motor: o mesmo motor de texto do servidor (alinhar e distribuir)
    medidorRef.current = motor?.medidor;
  });
  const [aoMudarEmFalta] = useState(() => (emFalta: RecursosEmFalta) => faltas.definir((f) => ({ ...f, emFalta })));

  /** Seleciona camadas pelo nome, na peça como está agora (os ids de nó novo só existem depois do lote). */
  const [selecionarPorNome] = useState(() => (nomes: string[]) => {
    const doc = documento.obter();
    const ids =
      doc?.pranchetas.flatMap((p) =>
        todasAsCamadas(p.filhos)
          .filter((n) => nomes.includes(n.nome))
          .map((n) => n.id),
      ) ?? [];
    iface.selecionar({ tipo: 'camadas', ids });
  });

  /** O que os painéis e os atalhos usam para escrever: um caminho só, sempre pela sessão. */
  const ambiente = useMemo<AmbienteDoEditor>(() => {
    const aplicar: AmbienteDoEditor['aplicar'] = (lote) => {
      const sessao = sessaoRef.current;
      if (!lote || !sessao) return false;
      const r = sessao.aplicar(lote.descricao, lote.operacoes);
      // o motivo local é texto do catálogo, escrito para o agente: a tela diz a frase dela
      if (!r.ok) aviso.definir({ texto: erros.doCodigo(r.motivo === 'somente_leitura' || r.motivo === 'sem_conexao' ? r.motivo : 'lote_invalido'), tom: 'erro' });
      return r.ok;
    };
    const envio = criarEnvio({
      arquivos: () => fonte.arquivos,
      documento: documento.obter,
      // sem prancheta sob o ponteiro: a da seleção, ou a primeira
      pranchetaPadrao: () => {
        const doc = documento.obter();
        const { selecao } = iface.armazem.obter();
        if (!doc || !selecao) return undefined;
        if (selecao.tipo === 'prancheta') return selecao.id;
        return doc.pranchetas.find((p) => todasAsCamadas(p.filhos).some((n) => selecao.ids.includes(n.id)))?.id;
      },
      aplicar,
      selecionarPorNome,
      aviso,
      enviando,
    });
    const avisar = (texto: string) => aviso.definir({ texto, tom: 'erro' });
    return { interface: iface, documento, somenteLeitura, faltas, listarFontes: () => fonte.listarFontes(), aplicar, avisar, inserirArquivos: envio.inserir, trocarImagem: envio.trocarImagem };
  }, [iface, documento, somenteLeitura, faltas, fonte, aviso, enviando, selecionarPorNome]);

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
          enviar: lotes
            ? async (lote) => {
                const r = await lotes.enviar(lote);
                if (r.tipo === 'confirmado' && r.historico) historico.definir(r.historico);
                return r;
              }
            : semDestino,
          recarregar: async () => {
            const atual = await fonte.abrir(pecaId);
            if (atual.estado !== 'aberta') throw new Error(`a peça não reabriu: ${atual.estado}`);
            historico.definir(atual.peca.historico);
            return { doc: atual.peca.arvore, versao: atual.peca.versao };
          },
          gerarId: () => crypto.randomUUID(),
        },
      );
      if (!lotes) sessao.definirSomenteLeitura(true);
      sessaoRef.current = sessao;
      historico.definir(aberta.peca.historico);

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
          // Catálogo velho não é aviso que some: toda alteração seria recusada igual. A edição trava
          // e a faixa fica, com a única saída que existe (recarregar).
          if (e.recusa.codigo === CATALOGO_DESATUALIZADO) {
            setCatalogoVelho(true);
            sessao.definirSomenteLeitura(true);
          } else aviso.definir({ texto: erros.doCodigo(e.recusa.codigo), tom: 'erro' });
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
  }, [fonte, pecaId, comWebGL, documento, estado, somenteLeitura, faltas, aviso, historico, tentativa]);

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
    // a API já disse que não há: o botão está desligado e o atalho não faz a viagem
    if (!historico.obter()[qual === 'desfazer' ? 'podeDesfazer' : 'podeRefazer']) return;
    revertendo.current = true;
    const r = await lotes[qual](e.versao).finally(() => {
      revertendo.current = false;
    });
    if (r.ok) {
      sessao.adotar({ doc: r.doc, versao: r.versao });
      historico.definir(r.historico);
    } else if (r.codigo === CATALOGO_DESATUALIZADO) {
      setCatalogoVelho(true);
      sessao.definirSomenteLeitura(true);
    } else aviso.definir({ texto: erros.doCodigo(r.codigo), tom: 'erro' });
  });

  // Sair do editor encerra a consulta da exportação (o arquivo continua sendo feito no servidor).
  useEffect(() => () => exportador?.limpar(), [exportador]);

  /** Pede ao motor as fontes e imagens outra vez (o que não chegou é tentado de novo). */
  const tentarRecursosDeNovo = async () => {
    const doc = documento.obter();
    if (doc) await motorRef.current?.prepararRecursos(doc).catch(() => undefined);
  };

  /** O nome da peça é do registro, não da árvore: renomear não é lote nem passo do histórico. */
  const renomearPeca = async (novo: string) => {
    if (situacao.estado !== 'aberta' || !fonte.renomear || novo.trim() === '' || novo.trim() === situacao.nome) return;
    const r = await fonte.renomear(pecaId, novo.trim());
    if (r.ok) setSituacao({ estado: 'aberta', nome: r.nome });
    else aviso.definir({ texto: erros.doCodigo(r.codigo), tom: 'erro' });
  };

  // Atalhos. Uma tabela só (nucleo/atalhos.ts); aqui é só a ligação com o teclado.
  useEffect(() => {
    const aoApertar = (e: KeyboardEvent) => {
      // com um diálogo aberto o teclado é dele: nenhum atalho mexe na peça que está atrás
      if (document.querySelector('dialog[open]')) return;
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
        case 'duplicar':
          // a cópia nasce selecionada, como no Photoshop
          if (!duplicarSelecao(ambiente)) return;
          break;
        case 'agrupar':
          // sem o que agrupar, o Ctrl+G continua sendo do navegador
          if (!doc || selecao?.tipo !== 'camadas') return;
          agruparSelecao(ambiente);
          break;
        case 'desagrupar':
          if (!doc || selecao?.tipo !== 'camadas') return;
          desagruparSelecao(ambiente);
          break;
        case 'editar-texto': {
          // só com UMA camada selecionada; se não for de texto, a área do canvas descarta o pedido
          const id = selecao?.tipo === 'camadas' && selecao.ids.length === 1 ? selecao.ids[0] : undefined;
          if (!id) return;
          iface.editarTexto(id);
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
          {...(fonte.renomear ? { aoRenomear: (novo: string) => void renomearPeca(novo) } : {})}
          nomeDaPeca={nome}
          estado={estado}
          historico={historico}
          {...(exportador ? { exportador, aoExportar: () => setExportando(true) } : {})}
          faltas={faltas}
          paineisVisiveis={paineisVisiveis}
          aoAlternarPaineis={iface.alternarPaineis}
          aoDesfazer={() => void reverter('desfazer')}
          aoRefazer={() => void reverter('refazer')}
        />

        <p className={estilos.telaEstreita}>{textos.avisos.telaEstreita}</p>

        {paineisVisiveis && (
          <>
            <BarraDeFerramentas interface={iface} podeInserir={podeEditar && fonte.arquivos !== undefined} aoInserir={(arquivos) => void ambiente.inserirArquivos(arquivos)} />
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
                aoMudarEmFalta={aoMudarEmFalta}
                {...(fonte.arquivos ? { aoSoltarArquivos: (arquivos: File[], onde: OndeSoltou | undefined) => void ambiente.inserirArquivos(arquivos, onde) } : {})}
                recursos={fonte.recursos}
                {...(criarMotor ? { criarMotor } : {})}
              />
              <EstadoDaPeca situacao={situacao} aoTentarDeNovo={() => setTentativa((n) => n + 1)} />
              {semConexao && (
                <p className={estilos.semConexao} role="status">
                  {erros.doCodigo('sem_conexao')}
                </p>
              )}
              {catalogoVelho && (
                <div className={estilos.faixaDeRecarregar} role="alert">
                  <p>{textos.avisos.catalogoDesatualizado}</p>
                  <button type="button" onClick={() => window.location.reload()}>
                    {textos.avisos.recarregar}
                  </button>
                </div>
              )}
              {fontesEmFalta.length > 0 && !catalogoVelho && (
                <div className={estilos.faixaDeFonte} role="status">
                  <p>{textos.avisos.fonteEmFalta(fontesEmFalta.map((f) => `${f.familia} ${f.peso}`).join(', '))}</p>
                  <button type="button" onClick={() => void tentarRecursosDeNovo()}>
                    {textos.avisos.tentarFonteDeNovo}
                  </button>
                </div>
              )}
              {arquivosEmEnvio.length > 0 && (
                <p className={estilos.enviando} role="status">
                  {arquivosEmEnvio.map((nomeDoArquivo) => textos.envio.enviando(nomeDoArquivo)).join(' ')}
                </p>
              )}
              {mensagem && (
                <div className={estilos.aviso} data-tom={mensagem.tom} {...(mensagem.tom === 'erro' ? { role: 'alert' } : { role: 'status', 'aria-label': textos.envio.nota })}>
                  <p>{mensagem.texto}</p>
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

        {exportando && nome !== undefined && fonte.exportacoes && exportador && (
          <DialogoDeExportar nomeDaPeca={nome} api={fonte.exportacoes} exportador={exportador} estado={estado} aoFechar={() => setExportando(false)} />
        )}
      </div>
    </ProvedorDoEditor>
  );
}
