'use client';

// Nova peça: o formulário de briefing, o caminho padrão para criar (ADR 033; experiencia.md, 3.4).
// Três blocos na ordem do que varia: a marca (o que não muda), esta peça (o que muda) e mais opções.
// O rodapé fixo diz o que falta e quantos formatos vão ser feitos, antes do clique.
//
// O que sai daqui é DADO ESTRUTURADO, para o Otto não entender errado: criar a peça, pedir a tarefa com
// o formulário e abrir o editor, onde o painel do Otto mostra o "pode", a espera e a revisão.
// A peça em branco continua existindo, em segundo plano.
import {
  briefingDaTarefa,
  FORMATOS_POR_TAREFA,
  FORMATOS_SUGERIDOS,
  type FonteDaLista,
  type FormatoDoBriefing,
  type ItemDeBriefing,
  type LimitesDeTarefa,
  type Marca,
  OPCOES_DE_CUIDADO,
} from '@otto/shared';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { type EstadoDaMarca, paraDados } from '../marcas/dadosDaMarca';
import { EditorDeMarca } from '../marcas/EditorDeMarca';
import { IdentidadeDaMarca, LogoDaMarca } from '../marcas/ResumoDaMarca';
import formulario from '../produto/Formulario.module.css';
import { criarServicos, type Servicos } from '../produto/servicos';
import { briefing as textos } from '../textos/briefing';
import { erros } from '../textos/erros';
import { FotosDoBriefing } from './FotosDoBriefing';
import {
  alternarFormato,
  apagarRascunhoLocal,
  daTarefa,
  doRascunho,
  ESTADO_VAZIO,
  type EstadoDoBriefing,
  estaVazio,
  type FonteDasImagens,
  faltas,
  guardarRascunhoLocal,
  type ImagemDoFormulario,
  lerRascunhoLocal,
  paraOPedido,
  paraSalvar,
  podeMaisUmFormato,
} from './formulario';
import estilos from './NovaPeca.module.css';

type Guarda = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export interface OrigemDoFormulario {
  /** Parte de um briefing salvo. */
  briefingId?: string;
  /** "Nova peça com este briefing": o briefing que gerou a peça. */
  pecaId?: string;
  /** Em branco, com a marca já escolhida. */
  marcaId?: string;
}

export interface PropriedadesDeNovaPeca {
  origem?: OrigemDoFormulario;
  servicos?: Servicos;
  irPara?: (endereco: string) => void;
  /** Onde o rascunho fica. O padrão é o armazenamento local do navegador. */
  guarda?: Guarda;
}

const FONTES_DAS_IMAGENS: readonly FonteDasImagens[] = ['minhas', 'banco', 'nenhuma'];
const OBJETIVOS_DE_PRODUTO: readonly string[] = ['vender', 'lançar'];
const NOVA = 'nova';
const ehSugerido = (f: FormatoDoBriefing): boolean => FORMATOS_SUGERIDOS.some((s) => s.nome === f.nome && s.largura === f.largura && s.altura === f.altura);
/** A frase de uma recusa: a do briefing, depois a geral, e por fim a que diz que nada se perdeu. Nunca o código. */
const fraseDaRecusa = (codigo: string): string => textos.erros[codigo] ?? (erros.doCodigo(codigo) !== erros.generico ? erros.doCodigo(codigo) : (textos.erros.padrao as string));
const guardaDoNavegador = (): Guarda | undefined => {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
};

export function NovaPeca({ origem = {}, servicos: deFora, irPara = (endereco) => window.location.assign(endereco), guarda: guardaDeFora }: PropriedadesDeNovaPeca) {
  const [servicos] = useState(() => deFora ?? criarServicos());
  /** Nulo até a marca, o briefing de origem e o rascunho serem lidos. */
  const [estado, setEstado] = useState<EstadoDoBriefing | null>(null);
  const [marcas, setMarcas] = useState<Marca[] | null>(null);
  const [marcasFalharam, setMarcasFalharam] = useState(false);
  const [salvos, setSalvos] = useState<ItemDeBriefing[]>([]);
  const [catalogo, setCatalogo] = useState<FonteDaLista[] | null>(null);
  const [limites, setLimites] = useState<LimitesDeTarefa | undefined>(undefined);
  const [nota, setNota] = useState<string | null>(null);
  const [recuperado, setRecuperado] = useState(false);
  /** O rascunho de OUTRA peça que estava guardado quando o formulário abriu de um briefing salvo ou de uma peça. */
  const [rascunhoGuardado, setRascunhoGuardado] = useState<EstadoDoBriefing | null>(null);
  /** A marca aberta para edição dentro do formulário: o id dela, ou "nova". */
  const [editandoMarca, setEditandoMarca] = useState<string | null>(null);
  const [fotosIndo, setFotosIndo] = useState(0);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [nomeando, setNomeando] = useState<string | null>(null);
  const [outro, setOutro] = useState({ nome: '', largura: '', altura: '' });

  const guarda = useRef<Guarda | undefined>(guardaDeFora);
  const mexeu = useRef(false);
  const marcaDigitada = useRef<EstadoDaMarca | null>(null);
  const id = useId();
  const { briefingId, pecaId, marcaId } = origem;

  // ---------- o que o formulário lê ao abrir ----------
  useEffect(() => {
    let desmontado = false;
    guarda.current ??= guardaDoNavegador();
    void (async () => {
      const [lidas, itens] = await Promise.all([servicos.cadastros.marcas(), servicos.cadastros.briefings()]);
      let inicial: EstadoDoBriefing | undefined;
      let aviso: string | null = null;
      if (briefingId) {
        const salvo = await servicos.cadastros.briefing(briefingId);
        if (salvo) inicial = doRascunho(salvo.dados, { cuidado: salvo.cuidado, briefingId: salvo.id });
        else aviso = textos.comecarDe.naoAbriu;
      } else if (pecaId) {
        const dela = await servicos.tarefas(pecaId).daPeca();
        const comBriefing = dela?.itens.map((t) => briefingDaTarefa(t)).find((b) => b !== undefined);
        if (comBriefing) inicial = daTarefa(comBriefing, lidas ?? []);
        // leitura que falhou não é "peça sem briefing": são coisas diferentes, e a tela diz qual foi
        else aviso = dela ? textos.comecarDe.daPecaSemBriefing : textos.comecarDe.naoLeuAPeca;
      }
      let veioDoRascunho = false;
      const local = guarda.current ? lerRascunhoLocal(guarda.current) : undefined;
      // o rascunho vale quando o formulário abre sem origem; com origem, ele fica guardado e a tela avisa
      const deOutraPeca = inicial && local ? local : null;
      if (!inicial && !marcaId && local) {
        inicial = local;
        veioDoRascunho = true;
      }
      inicial ??= { ...ESTADO_VAZIO, marcaId: marcaId ?? null };
      // marca que não existe mais (apagada depois do rascunho) sai, em vez de dar erro ao enviar
      if (lidas && inicial.marcaId && !lidas.some((m) => m.id === inicial?.marcaId)) inicial = { ...inicial, marcaId: null };
      if (desmontado) return;
      setMarcas(lidas ?? []);
      setMarcasFalharam(lidas === undefined);
      setSalvos(itens ?? []);
      setNota(aviso);
      setRecuperado(veioDoRascunho);
      setRascunhoGuardado(deOutraPeca);
      setEstado(inicial);
    })();
    void servicos.fontes.catalogo().then((itens) => !desmontado && setCatalogo(itens));
    void servicos
      .tarefas('')
      .limites()
      .then((l) => !desmontado && setLimites(l));
    return () => {
      desmontado = true;
    };
  }, [servicos, briefingId, pecaId, marcaId]);

  // rascunho automático: fechar a aba sem enviar não perde o que foi digitado
  // (com o rascunho de outra peça ainda guardado, nada é gravado por cima dele sem o designer decidir)
  useEffect(() => {
    if (estado && mexeu.current && guarda.current && !rascunhoGuardado) guardarRascunhoLocal(guarda.current, estado);
  }, [estado, rascunhoGuardado]);

  const mudar = useCallback((parte: Partial<EstadoDoBriefing> | ((antes: EstadoDoBriefing) => EstadoDoBriefing)) => {
    mexeu.current = true;
    setEstado((antes) => (antes ? (typeof parte === 'function' ? parte(antes) : { ...antes, ...parte }) : antes));
  }, []);
  const mudarFotos = useCallback((transformar: (imagens: ImagemDoFormulario[]) => ImagemDoFormulario[]) => mudar((antes) => ({ ...antes, imagens: transformar(antes.imagens) })), [mudar]);

  if (!estado || !marcas)
    return (
      <p className={formulario.nota} role="status">
        {textos.carregando}
      </p>
    );

  const marca = marcas.find((m) => m.id === estado.marcaId);
  const oQueFalta = faltas(estado);
  const semLimite = limites && !limites.podeEnviar ? (limites.motivo ?? 'limite_diario') : undefined;
  const bloqueado = oQueFalta.length > 0 || fotosIndo > 0 || enviando || semLimite !== undefined;
  const proprios = estado.formatos.filter((f) => !ehSugerido(f));
  const naFrente = limites?.naFrente ?? [];

  // ---------- ações ----------
  const abrirSalvo = async (idDoSalvo: string) => {
    setErro(null);
    if (idDoSalvo === '') return mudar({ briefingId: null });
    const salvo = await servicos.cadastros.briefing(idDoSalvo);
    if (!salvo) return setNota(textos.comecarDe.naoAbriu);
    setNota(null);
    setRecuperado(false);
    mudar(() => {
      const novo = doRascunho(salvo.dados, { cuidado: salvo.cuidado, briefingId: salvo.id });
      return novo.marcaId && !marcas.some((m) => m.id === novo.marcaId) ? { ...novo, marcaId: null } : novo;
    });
  };

  const apagarSalvo = async (item: ItemDeBriefing) => {
    const r = await servicos.cadastros.apagarBriefing(item.id);
    if (!r.ok) return setErro(fraseDaRecusa(r.codigo));
    setSalvos((lista) => lista.filter((s) => s.id !== item.id));
    if (estado.briefingId === item.id) mudar({ briefingId: null });
  };

  const salvarComoBriefing = async (nome: string) => {
    if (nome.trim() === '') return;
    setErro(null);
    // com o mesmo nome do briefing de origem, substitui; com outro nome, é um briefing novo
    const origemDele = salvos.find((s) => s.id === estado.briefingId);
    const r = await servicos.cadastros.salvarBriefing({ nome: nome.trim(), ...paraSalvar(estado) }, origemDele?.nome === nome.trim() ? origemDele.id : undefined);
    if (!r.ok) return setErro(fraseDaRecusa(r.codigo));
    const { briefing: salvo } = r;
    setSalvos((lista) => [
      { id: salvo.id, nome: salvo.nome, usos: salvo.usos, alteradoEm: salvo.alteradoEm, ...(salvo.dados.marcaId ? { marcaId: salvo.dados.marcaId } : {}) },
      ...lista.filter((s) => s.id !== salvo.id),
    ]);
    setNomeando(null);
    setNota(textos.rodape.salvo(salvo.nome));
    mudar({ briefingId: salvo.id });
  };

  const guardarMarca = (salva: Marca) => {
    setMarcas((lista) => (lista?.some((m) => m.id === salva.id) ? lista.map((m) => (m.id === salva.id ? salva : m)) : [...(lista ?? []), salva]));
    setEditandoMarca(null);
    marcaDigitada.current = null;
    mudar({ marcaId: salva.id, avulsa: null });
  };

  const escolherMarca = (valor: string) => {
    marcaDigitada.current = null;
    if (valor === NOVA) {
      setEditandoMarca(NOVA);
      return mudar({ marcaId: null });
    }
    setEditandoMarca(null);
    mudar({ marcaId: valor === '' ? null : valor, ...(valor === '' ? {} : { avulsa: null }) });
  };

  const adicionarOutro = () => {
    const formato = { nome: outro.nome.trim(), largura: Number(outro.largura), altura: Number(outro.altura) };
    if (formato.nome === '' || !Number.isInteger(formato.largura) || !Number.isInteger(formato.altura) || !podeMaisUmFormato(estado)) return;
    mudar((antes) => ({ ...antes, formatos: [...antes.formatos, formato] }));
    setOutro({ nome: '', largura: '', altura: '' });
  };

  const criar = async () => {
    if (bloqueado) return;
    setEnviando(true);
    setErro(null);
    let atual = estado;
    // a marca nasce dentro do primeiro briefing: se há uma sendo digitada, ela é salva junto
    const digitada = marcaDigitada.current;
    if (editandoMarca === NOVA && digitada && digitada.nome.trim() !== '') {
      const r = await servicos.cadastros.salvarMarca(paraDados(digitada));
      if (!r.ok) {
        setEnviando(false);
        return setErro(fraseDaRecusa(r.codigo));
      }
      guardarMarca(r.marca);
      atual = { ...atual, marcaId: r.marca.id, avulsa: null };
    }
    // peça e tarefa numa chamada só: o servidor confere o formulário e os limites antes de a peça nascer,
    // então um envio recusado não deixa peça vazia para trás
    const nome = (atual.nome.trim() || atual.titulo.trim()).slice(0, 120);
    const r = await servicos.pecas.criarComTarefa({ ...(nome ? { nome } : {}), tarefa: paraOPedido(atual) });
    if (!r.ok) {
      setEnviando(false);
      return setErro(fraseDaRecusa(r.codigo));
    }
    // o rascunho de outra peça, que o designer ainda não decidiu descartar, fica
    if (guarda.current && !rascunhoGuardado) apagarRascunhoLocal(guarda.current);
    irPara(`/editor/p/${encodeURIComponent(r.pecaId)}`);
  };

  const emBranco = async () => {
    setEnviando(true);
    setErro(null);
    const r = await servicos.pecas.criar();
    if (!r.ok) {
      setEnviando(false);
      return setErro(fraseDaRecusa(r.codigo));
    }
    irPara(`/editor/p/${encodeURIComponent(r.peca.id)}`);
  };

  const limpar = () => {
    if (guarda.current) apagarRascunhoLocal(guarda.current);
    mexeu.current = false;
    setRecuperado(false);
    setNota(null);
    setEstado({ ...ESTADO_VAZIO });
  };

  const texto = (campo: 'nome' | 'titulo' | 'subtitulo' | 'chamada' | 'rodape' | 'publico', maximo: number, opcoes: { exemplo: string; obrigatorio?: boolean; rotulo: string }) => (
    <label className={formulario.campo}>
      <span className={formulario.rotulo}>
        {opcoes.rotulo}
        {opcoes.obrigatorio && <em>{textos.campos.obrigatorio}</em>}
      </span>
      <input
        type="text"
        aria-label={opcoes.rotulo}
        value={estado[campo]}
        maxLength={maximo}
        placeholder={opcoes.exemplo}
        required={opcoes.obrigatorio}
        disabled={enviando}
        onChange={(e) => mudar({ [campo]: e.target.value })}
      />
    </label>
  );

  return (
    <form
      className={estilos.formulario}
      aria-label={textos.titulo}
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void criar();
      }}
    >
      <div className={estilos.partida}>
        <label className={`${formulario.campo} ${estilos.campo}`}>
          <span className={formulario.rotulo}>{textos.comecarDe.rotulo}</span>
          <select aria-label={textos.comecarDe.rotulo} value={estado.briefingId ?? ''} disabled={enviando} onChange={(e) => void abrirSalvo(e.target.value)}>
            <option value="">{textos.comecarDe.nenhum}</option>
            {salvos.map((s) => (
              <option key={s.id} value={s.id}>
                {textos.comecarDe.salvo(s.nome, s.usos)}
              </option>
            ))}
          </select>
        </label>
        {salvos.length > 0 && (
          <details className={estilos.salvos}>
            <summary>{textos.comecarDe.gerenciar}</summary>
            <ul aria-label={textos.comecarDe.gerenciar}>
              {salvos.map((s) => (
                <li key={s.id}>
                  <span>{s.nome}</span>
                  <button type="button" className={formulario.discreto} aria-label={textos.comecarDe.apagar(s.nome)} onClick={() => void apagarSalvo(s)}>
                    {textos.comecarDe.apagar(s.nome)}
                  </button>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>

      {(nota || recuperado || marcasFalharam || rascunhoGuardado) && (
        <div className={estilos.notas}>
          {recuperado && (
            <p className={`${formulario.aviso} ${estilos.notaComAcao}`} role="status" data-rascunho-recuperado>
              {textos.rascunho.recuperado}
              <button type="button" className={formulario.discreto} onClick={limpar}>
                {textos.rascunho.limpar}
              </button>
            </p>
          )}
          {rascunhoGuardado && (
            <p className={`${formulario.aviso} ${estilos.notaComAcao}`} role="status" data-rascunho-guardado>
              {textos.rascunho.guardado}
              <button
                type="button"
                className={formulario.discreto}
                onClick={() => {
                  // o formulário passa a ser o rascunho, como se tivesse aberto sem origem
                  mexeu.current = false;
                  setEstado(rascunhoGuardado.marcaId && !marcas.some((m) => m.id === rascunhoGuardado.marcaId) ? { ...rascunhoGuardado, marcaId: null } : rascunhoGuardado);
                  setRascunhoGuardado(null);
                  setNota(null);
                }}
              >
                {textos.rascunho.voltar}
              </button>
              <button
                type="button"
                className={formulario.discreto}
                onClick={() => {
                  if (guarda.current) apagarRascunhoLocal(guarda.current);
                  setRascunhoGuardado(null);
                }}
              >
                {textos.rascunho.descartar}
              </button>
            </p>
          )}
          {nota && (
            <p className={formulario.aviso} role="status">
              {nota}
            </p>
          )}
          {marcasFalharam && (
            <p className={formulario.aviso} role="status">
              {textos.marca.naoCarregou}
            </p>
          )}
        </div>
      )}

      {/* ---------- 1. a marca: o que não muda ---------- */}
      <section className={estilos.bloco} aria-labelledby={`${id}-marca`}>
        <span className={estilos.numero} aria-hidden="true">
          1
        </span>
        <div className={estilos.corpo}>
          <h2 id={`${id}-marca`} className={estilos.tituloDoBloco}>
            {textos.blocos.marca}
          </h2>
          <div className={estilos.marcaEscolhida}>
            <label className={formulario.campo}>
              <span className={formulario.rotulo}>{textos.marca.rotulo}</span>
              <select aria-label={textos.marca.rotulo} value={editandoMarca === NOVA ? NOVA : (estado.marcaId ?? '')} disabled={enviando} onChange={(e) => escolherMarca(e.target.value)}>
                <option value="">{textos.marca.semMarca}</option>
                {marcas.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nome}
                  </option>
                ))}
                <option value={NOVA}>{textos.marca.nova}</option>
              </select>
            </label>
            {marca && (
              <div className={estilos.resumoDaMarca} data-resumo-da-marca>
                <LogoDaMarca marca={marca} arquivos={servicos.arquivos} />
                <IdentidadeDaMarca marca={marca} />
                {editandoMarca !== marca.id && (
                  <button type="button" className={formulario.discreto} disabled={enviando} onClick={() => setEditandoMarca(marca.id)}>
                    {textos.marca.editar}
                  </button>
                )}
              </div>
            )}
          </div>
          {!marca && editandoMarca !== NOVA && !estado.avulsa && <p className={formulario.nota}>{textos.marca.semMarcaExplica}</p>}
          {!marca && estado.avulsa && (
            <p className={`${formulario.aviso} ${estilos.notaComAcao}`} data-identidade-avulsa>
              {textos.marca.avulsa}
              <button type="button" className={formulario.discreto} onClick={() => mudar({ avulsa: null })}>
                {textos.marca.tirarAvulsa}
              </button>
            </p>
          )}
          {editandoMarca !== null && (
            <EditorDeMarca
              key={editandoMarca}
              servicos={servicos}
              marca={editandoMarca === NOVA ? undefined : marca}
              catalogo={catalogo}
              aoSalvar={guardarMarca}
              aoCancelar={() => {
                setEditandoMarca(null);
                marcaDigitada.current = null;
              }}
              aoDigitar={(digitado) => {
                marcaDigitada.current = digitado;
              }}
            />
          )}
        </div>
      </section>

      {/* ---------- 2. esta peça: o que muda ---------- */}
      <section className={estilos.bloco} aria-labelledby={`${id}-peca`}>
        <span className={estilos.numero} aria-hidden="true">
          2
        </span>
        <div className={estilos.corpo}>
          <h2 id={`${id}-peca`} className={estilos.tituloDoBloco}>
            {textos.blocos.peca}
          </h2>
          {texto('titulo', 300, { rotulo: textos.campos.titulo, exemplo: textos.campos.tituloExemplo, obrigatorio: true })}
          {texto('subtitulo', 500, { rotulo: textos.campos.subtitulo, exemplo: textos.campos.subtituloExemplo })}
          <div className={estilos.duas}>
            {texto('chamada', 200, { rotulo: textos.campos.chamada, exemplo: textos.campos.chamadaExemplo })}
            {texto('rodape', 300, { rotulo: textos.campos.rodape, exemplo: marca?.rodape ? textos.campos.rodapeDaMarca(marca.rodape) : textos.campos.rodapeExemplo })}
          </div>

          <fieldset className={estilos.grupo}>
            <legend className={formulario.rotulo}>
              {textos.formatos.rotulo}
              <em>{textos.campos.obrigatorio}</em>
            </legend>
            <div className={formulario.chips}>
              {FORMATOS_SUGERIDOS.map((f) => {
                const marcado = estado.formatos.some((x) => x.nome === f.nome && x.largura === f.largura && x.altura === f.altura);
                return (
                  <button
                    key={f.nome}
                    type="button"
                    className={formulario.chip}
                    aria-pressed={marcado}
                    disabled={enviando || (!marcado && !podeMaisUmFormato(estado))}
                    onClick={() => mudar((antes) => alternarFormato(antes, f))}
                  >
                    {f.nome} <small>{textos.formatos.medida(f.largura, f.altura)}</small>
                  </button>
                );
              })}
              {proprios.map((f) => (
                <button
                  key={`proprio-${f.nome}`}
                  type="button"
                  className={formulario.chip}
                  aria-pressed="true"
                  aria-label={textos.formatos.tirar(f.nome)}
                  disabled={enviando}
                  onClick={() => mudar((antes) => alternarFormato(antes, f))}
                >
                  {f.nome} <small>{textos.formatos.medida(f.largura, f.altura)}</small> <span aria-hidden="true">×</span>
                </button>
              ))}
            </div>
            <p className={formulario.nota}>{textos.formatos.ate(FORMATOS_POR_TAREFA)}</p>
            <details>
              <summary className={formulario.nota}>{textos.formatos.outro}</summary>
              <div className={estilos.outroFormato}>
                <input
                  className={formulario.entrada}
                  type="text"
                  aria-label={textos.formatos.nomeDoOutro}
                  placeholder={textos.formatos.nomeDoOutro}
                  maxLength={60}
                  value={outro.nome}
                  onChange={(e) => setOutro({ ...outro, nome: e.target.value })}
                />
                <input
                  className={formulario.entrada}
                  type="number"
                  aria-label={textos.formatos.largura}
                  placeholder={textos.formatos.largura}
                  min={16}
                  max={30000}
                  value={outro.largura}
                  onChange={(e) => setOutro({ ...outro, largura: e.target.value })}
                />
                <input
                  className={formulario.entrada}
                  type="number"
                  aria-label={textos.formatos.altura}
                  placeholder={textos.formatos.altura}
                  min={16}
                  max={30000}
                  value={outro.altura}
                  onChange={(e) => setOutro({ ...outro, altura: e.target.value })}
                />
                <button
                  type="button"
                  className={formulario.botao}
                  disabled={!podeMaisUmFormato(estado) || outro.nome.trim() === '' || outro.largura === '' || outro.altura === ''}
                  onClick={adicionarOutro}
                >
                  {textos.formatos.adicionar}
                </button>
              </div>
            </details>
          </fieldset>

          <fieldset className={estilos.grupo}>
            <legend className={formulario.rotulo}>{textos.imagens.rotulo}</legend>
            <div className={estilos.opcoes}>
              {FONTES_DAS_IMAGENS.map((fonte) => (
                <label key={fonte} className={estilos.opcao}>
                  <input type="radio" name={`${id}-imagens`} checked={estado.fonteDasImagens === fonte} disabled={enviando} onChange={() => mudar({ fonteDasImagens: fonte })} />
                  {textos.imagens.fontes[fonte]}
                </label>
              ))}
            </div>
            <p className={formulario.nota}>{textos.imagens.explica[estado.fonteDasImagens]}</p>
            {estado.fonteDasImagens === 'minhas' && (
              <FotosDoBriefing
                imagens={estado.imagens}
                formatos={estado.formatos}
                arquivos={servicos.arquivos}
                banco={servicos.imagens}
                aoMudar={mudarFotos}
                aoEnviar={setFotosIndo}
                textoDaBusca={estado.termos}
                desativado={enviando}
              />
            )}
            {estado.fonteDasImagens === 'banco' && (
              <>
                <label className={formulario.campo}>
                  <span className={formulario.rotulo}>{textos.imagens.termos}</span>
                  <input
                    type="text"
                    aria-label={textos.imagens.termos}
                    value={estado.termos}
                    maxLength={100}
                    placeholder={textos.imagens.termosExemplo}
                    disabled={enviando}
                    onChange={(e) => mudar({ termos: e.target.value })}
                  />
                </label>
                {OBJETIVOS_DE_PRODUTO.includes(estado.objetivo) && (
                  <p className={formulario.aviso} role="status" data-aviso-de-produto>
                    {textos.imagens.avisoDeProduto(undefined)}
                  </p>
                )}
              </>
            )}
          </fieldset>

          <div className={estilos.duas}>
            <label className={formulario.campo}>
              <span className={formulario.rotulo}>{textos.campos.objetivo}</span>
              <select aria-label={textos.campos.objetivo} value={estado.objetivo} disabled={enviando} onChange={(e) => mudar({ objetivo: e.target.value })}>
                <option value="">{textos.campos.semObjetivo}</option>
                {Object.entries(textos.campos.objetivos).map(([valor, nome]) => (
                  <option key={valor} value={valor}>
                    {nome}
                  </option>
                ))}
                {estado.objetivo !== '' && !Object.hasOwn(textos.campos.objetivos, estado.objetivo) && <option value={estado.objetivo}>{estado.objetivo}</option>}
              </select>
            </label>
            {texto('publico', 300, { rotulo: textos.campos.publico, exemplo: textos.campos.publicoExemplo })}
          </div>
          {texto('nome', 120, { rotulo: textos.campos.nome, exemplo: estado.titulo.trim() || textos.campos.nomeExemplo })}
        </div>
      </section>

      {/* ---------- 3. mais opções ---------- */}
      <details className={estilos.bloco}>
        <summary>
          <span className={estilos.numero} aria-hidden="true">
            3
          </span>
          <h2 className={estilos.tituloDoBloco}>
            {textos.blocos.mais}
            <small>{textos.blocos.maisResumo}</small>
          </h2>
        </summary>
        <div className={estilos.corpo}>
          <fieldset className={estilos.grupo}>
            <legend className={formulario.rotulo}>{textos.cuidado.rotulo}</legend>
            <div className={estilos.cuidado}>
              {OPCOES_DE_CUIDADO.map((opcao) => (
                <label key={opcao} className={estilos.nivel}>
                  <span>
                    <input type="radio" name={`${id}-cuidado`} checked={estado.cuidado === opcao} disabled={enviando} onChange={() => mudar({ cuidado: opcao })} />
                    {textos.cuidado.opcoes[opcao]}
                  </span>
                  <small>{textos.cuidado.oQueE[opcao]}</small>
                </label>
              ))}
            </div>
            <p className={formulario.nota}>{textos.cuidado.nota}</p>
          </fieldset>

          <fieldset className={estilos.grupo}>
            <legend className={formulario.rotulo}>{textos.estilo.rotulo}</legend>
            <div className={formulario.chips}>
              {[...new Set([...textos.estilo.opcoes, ...estado.estilo])].map((estilo) => {
                const marcado = estado.estilo.includes(estilo);
                return (
                  <button
                    key={estilo}
                    type="button"
                    className={formulario.chip}
                    aria-pressed={marcado}
                    disabled={enviando || (!marcado && estado.estilo.length >= 6)}
                    onClick={() => mudar((antes) => ({ ...antes, estilo: marcado ? antes.estilo.filter((x) => x !== estilo) : [...antes.estilo, estilo] }))}
                  >
                    {estilo}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <label className={formulario.campo}>
            <span className={formulario.rotulo}>{textos.restricoes.rotulo}</span>
            {marca?.restricoes && marca.restricoes.length > 0 && (
              <ul className={estilos.daMarca} data-restricoes-da-marca>
                <li>{textos.restricoes.daMarca}</li>
                {marca.restricoes.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            )}
            <textarea
              aria-label={textos.restricoes.rotulo}
              rows={3}
              value={estado.restricoes}
              placeholder={textos.restricoes.exemplo}
              disabled={enviando}
              onChange={(e) => mudar({ restricoes: e.target.value })}
            />
          </label>
          <label className={formulario.campo}>
            <span className={formulario.rotulo}>{textos.observacoes.rotulo}</span>
            <textarea
              aria-label={textos.observacoes.rotulo}
              rows={3}
              maxLength={2000}
              value={estado.observacoes}
              placeholder={textos.observacoes.exemplo}
              disabled={enviando}
              onChange={(e) => mudar({ observacoes: e.target.value })}
            />
          </label>
        </div>
      </details>

      {erro && (
        <p className={formulario.erro} role="alert">
          {erro}
        </p>
      )}

      {/* ---------- rodapé fixo: o que falta, e o botão ---------- */}
      <div className={estilos.rodape}>
        <div className={estilos.situacao} role="status" aria-live="polite">
          <strong>{textos.rodape.formatos(estado.formatos.length)}</strong>
          {semLimite ? (
            <span data-falta="limite">{textos.rodape.semLimite[semLimite] ?? textos.rodape.semLimite.limite_diario}</span>
          ) : oQueFalta.length > 0 ? (
            <span data-falta={oQueFalta.join(' ')}>{oQueFalta.map((f) => textos.rodape.faltas[f]).join(' ')}</span>
          ) : fotosIndo > 0 ? (
            <span data-falta="enviando">{textos.rodape.faltas.enviando}</span>
          ) : naFrente.length > 0 ? (
            // o Otto está ocupado em outra peça: diz qual, antes do clique
            <span>{textos.rodape.atrasDe(naFrente.map((t) => t.nome))}</span>
          ) : (
            <span>{textos.rodape.espera}</span>
          )}
        </div>
        {nomeando === null ? (
          <button
            type="button"
            className={formulario.discreto}
            disabled={enviando || estaVazio(estado)}
            onClick={() => setNomeando(salvos.find((s) => s.id === estado.briefingId)?.nome ?? estado.nome)}
          >
            {textos.rodape.salvar}
          </button>
        ) : (
          <span className={estilos.salvarBriefing}>
            <input
              type="text"
              aria-label={textos.rodape.nomeDoBriefing}
              placeholder={textos.rodape.nomeDoBriefing}
              maxLength={120}
              value={nomeando}
              // biome-ignore lint/a11y/noAutofocus: o campo nasce de "Salvar como briefing"; o foco precisa ir para ele
              autoFocus
              onChange={(e) => setNomeando(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setNomeando(null);
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void salvarComoBriefing(nomeando);
                }
              }}
            />
            <button type="button" className={formulario.botao} disabled={nomeando.trim() === ''} onClick={() => void salvarComoBriefing(nomeando)}>
              {textos.rodape.salvarComEsteNome}
            </button>
            <button type="button" className={formulario.discreto} onClick={() => setNomeando(null)}>
              {textos.rodape.cancelar}
            </button>
          </span>
        )}
        <button type="button" className={formulario.discreto} disabled={enviando} onClick={() => void emBranco()}>
          {textos.rodape.emBranco}
        </button>
        <a className={formulario.botao} href="/editor">
          {textos.rodape.cancelar}
        </a>
        <button type="submit" className={formulario.principal} disabled={bloqueado}>
          {enviando ? textos.rodape.enviando : limites && (limites.naFila > 0 || naFrente.length > 0) ? textos.rodape.criarNaFila : textos.rodape.criar}
        </button>
      </div>
    </form>
  );
}
