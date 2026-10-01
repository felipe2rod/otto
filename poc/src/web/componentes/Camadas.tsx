import { useEffect, useState } from 'react';
import { api } from '../api';
import type { Ajuste, No, Prancheta } from '../../documento/esquema';
import { useEditor } from '../estado';

const ICONE: Record<No['tipo'], string> = { texto: 'T', forma: '▭', imagem: '▨', vetor: '✦', grupo: '▤', ajuste: '◐' };

const AJUSTES_PRONTOS: { rotulo: string; ajuste: Ajuste }[] = [
  { rotulo: 'Curvas (contraste em S)', ajuste: { tipo: 'curvas', rgb: [[0, 0], [64, 52], [192, 205], [255, 255]] } },
  { rotulo: 'Níveis', ajuste: { tipo: 'niveis', pretoDeEntrada: 10, brancoDeEntrada: 245, gama: 1, pretoDeSaida: 0, brancoDeSaida: 255 } },
  { rotulo: 'Matiz/saturação', ajuste: { tipo: 'matiz-saturacao', matiz: 0, saturacao: -30, luminosidade: 0 } },
  { rotulo: 'Vibração', ajuste: { tipo: 'vibracao', vibracao: 25, saturacao: 0 } },
  { rotulo: 'Equilíbrio de cor', ajuste: { tipo: 'equilibrio-de-cor', sombras: [0, 0, 10], meiosTons: [0, 0, 0], realces: [8, 0, -10] } },
  { rotulo: 'Filtro de foto quente', ajuste: { tipo: 'filtro-de-foto', cor: '#ec8a00', densidade: 25 } },
  { rotulo: 'Preto e branco', ajuste: { tipo: 'preto-e-branco' } },
  { rotulo: 'Mapa de degradê (duotone)', ajuste: { tipo: 'mapa-de-degrade', paradas: [{ cor: '#10131f', posicao: 0 }, { cor: '#e9b44c', posicao: 1 }] } },
];

export function Camadas() {
  const { doc, selecao } = useEditor();
  if (!doc) return null;
  const pranchetaDaSelecao = doc.pranchetas.find((p) => selecao && (p.id === selecao.id || contem(p.filhos, selecao.id)));
  return (
    <section className="painel camadas" aria-label="Camadas">
      <header className="painel-titulo">
        <h2>Camadas</h2>
        <LegendaDoOtto />
      </header>
      {pranchetaDaSelecao && <AcoesDeCamada prancheta={pranchetaDaSelecao} />}
      {doc.pranchetas.length === 0 && <p className="vazio">Nenhuma prancheta ainda. Preencha um briefing ou peça uma tarefa ao Otto.</p>}
      <ul className="arvore">
        {doc.pranchetas.map((p) => (
          <LinhaDaPrancheta key={p.id} prancheta={p} />
        ))}
      </ul>
    </section>
  );
}

function contem(lista: readonly No[], id: string): boolean {
  return lista.some((n) => n.id === id || (n.tipo === 'grupo' && contem(n.filhos, id)));
}

function LegendaDoOtto() {
  const { tocadosPeloOtto } = useEditor();
  if (tocadosPeloOtto.size === 0) return null;
  return (
    <span className="legenda-otto" title="Camadas criadas ou alteradas pelo Otto nesta tarefa">
      <i /> alterada pelo Otto
    </span>
  );
}

function AcoesDeCamada({ prancheta }: { prancheta: Prancheta }) {
  const { selecao, aplicar, tarefa, doc } = useEditor();
  const travado = tarefa?.estado === 'rodando';
  const selecionada = selecao?.tipo === 'no' ? procurar(prancheta.filhos, selecao.id) : undefined;
  const novoNome = (base: string) => {
    let i = 1;
    const nomes = new Set(todos(prancheta.filhos).map((n) => n.nome));
    while (nomes.has(`${base} ${i}`)) i++;
    return `${base} ${i}`;
  };
  if (!doc) return null;
  return (
    <div className="acoes-de-camada">
      <button type="button" disabled={travado || !selecionada} title="Pôr a camada selecionada num grupo" onClick={() => selecionada && void aplicar('agrupar', [{ op: 'agrupar', alvos: [selecionada.id], nome: novoNome('Grupo') }])}>
        Agrupar
      </button>
      <button type="button" disabled={travado || selecionada?.tipo !== 'grupo'} onClick={() => selecionada && void aplicar('desagrupar', [{ op: 'desagrupar', alvo: selecionada.id }])}>
        Desagrupar
      </button>
      <ImportarLogo prancheta={prancheta} novoNome={novoNome} />
      <NovaTextura prancheta={prancheta} novoNome={novoNome} />
      <select
        aria-label="Nova camada de ajuste"
        value=""
        disabled={travado}
        onChange={(e) => {
          const pronto = AJUSTES_PRONTOS[Number(e.target.value)];
          if (!pronto) return;
          void aplicar(`ajuste ${pronto.rotulo}`, [{ op: 'criarNo', prancheta: prancheta.id, no: { tipo: 'ajuste', nome: novoNome(pronto.rotulo.split(' (')[0]!), ajuste: pronto.ajuste } as never }]);
        }}
      >
        <option value="">+ Camada de ajuste</option>
        {AJUSTES_PRONTOS.map((a, i) => (
          <option key={a.rotulo} value={i}>
            {a.rotulo}
          </option>
        ))}
      </select>
    </div>
  );
}

function procurar(lista: readonly No[], id: string): No | undefined {
  for (const n of lista) {
    if (n.id === id) return n;
    if (n.tipo === 'grupo') {
      const d = procurar(n.filhos, id);
      if (d) return d;
    }
  }
  return undefined;
}

function todos(lista: readonly No[]): No[] {
  return lista.flatMap((n) => (n.tipo === 'grupo' ? [n, ...todos(n.filhos)] : [n]));
}

function LinhaDaPrancheta({ prancheta: p }: { prancheta: Prancheta }) {
  const { selecao, selecionar, tocadosPeloOtto } = useEditor();
  return (
    <li>
      <button type="button" className={`linha prancheta${selecao?.tipo === 'prancheta' && selecao.id === p.id ? ' ativa' : ''}`} onClick={() => selecionar({ tipo: 'prancheta', id: p.id })}>
        <span className="icone">▢</span>
        <span className="nome">{p.nome}</span>
        <span className="medida">
          {p.largura}×{p.altura}
        </span>
        {tocadosPeloOtto.has(p.id) && <i className="ponto-otto" aria-label="alterada pelo Otto" />}
      </button>
      <ListaDeCamadas lista={p.filhos} nivel={0} />
    </li>
  );
}

function ListaDeCamadas({ lista, nivel }: { lista: readonly No[]; nivel: number }) {
  return (
    <ul>
      {[...lista].reverse().map((n) => (
        <LinhaDaCamada key={n.id} no={n} nivel={nivel} />
      ))}
    </ul>
  );
}

function LinhaDaCamada({ no: n, nivel }: { no: No; nivel: number }) {
  const { selecao, selecionar, aplicar, tocadosPeloOtto, tarefa } = useEditor();
  const [aberto, setAberto] = useState(true);
  const travado = tarefa?.estado === 'rodando';
  return (
    <li>
      <div className={`linha no${selecao?.tipo === 'no' && selecao.id === n.id ? ' ativa' : ''}${n.visivel ? '' : ' oculta'}`} style={{ paddingLeft: 18 + nivel * 14 }}>
        {n.tipo === 'grupo' ? (
          <button type="button" className="abrir" aria-expanded={aberto} aria-label={aberto ? 'Recolher grupo' : 'Abrir grupo'} onClick={() => setAberto(!aberto)}>
            {aberto ? '▾' : '▸'}
          </button>
        ) : (
          n.recortadaNaDeBaixo && <span className="presa" title="Máscara de recorte na camada de baixo">↳</span>
        )}
        <button type="button" className="alvo" onClick={() => selecionar({ tipo: 'no', id: n.id })}>
          <span className={`icone ${n.tipo}`}>{ICONE[n.tipo]}</span>
          <span className="nome">{n.nome}</span>
          {n.mascara && <span className="marca-mascara" title={`máscara: ${n.mascara.tipo}`}>◑</span>}
          {tocadosPeloOtto.has(n.id) && <i className="ponto-otto" aria-label="alterada pelo Otto" />}
        </button>
        <button
          type="button"
          className="alternar"
          disabled={travado}
          aria-pressed={!n.visivel}
          title={n.visivel ? 'Ocultar' : 'Mostrar'}
          onClick={() => void aplicar(`${n.visivel ? 'ocultar' : 'mostrar'} ${n.nome}`, [{ op: 'alterar', alvo: n.id, props: { visivel: !n.visivel } }])}
        >
          {n.visivel ? '◉' : '○'}
        </button>
        <button
          type="button"
          className={`alternar${n.bloqueado ? ' ligado' : ''}`}
          disabled={travado}
          aria-pressed={n.bloqueado}
          title={n.bloqueado ? 'Desbloquear' : 'Bloquear (o Otto não mexe)'}
          onClick={() => void aplicar(`${n.bloqueado ? 'desbloquear' : 'bloquear'} ${n.nome}`, [{ op: 'alterar', alvo: n.id, props: { bloqueado: !n.bloqueado } }])}
        >
          {n.bloqueado ? '■' : '□'}
        </button>
      </div>
      {n.tipo === 'grupo' && aberto && <ListaDeCamadas lista={n.filhos} nivel={nivel + 1} />}
    </li>
  );
}

function ImportarLogo({ prancheta, novoNome }: { prancheta: Prancheta; novoNome: (b: string) => string }) {
  const { aplicar, avisar, tarefa } = useEditor();
  return (
    <label className="botao-arquivo" aria-disabled={tarefa?.estado === 'rodando'}>
      Logo (SVG)
      <input
        type="file"
        accept=".svg,image/svg+xml"
        disabled={tarefa?.estado === 'rodando'}
        onChange={async (e) => {
          const arq = e.target.files?.[0];
          e.target.value = '';
          if (!arq) return;
          try {
            const r = await api.importarVetor(arq);
            const [mw, mh] = r.no.moldura;
            const largura = Math.round(prancheta.largura * 0.25);
            const altura = Math.round((largura * mh) / mw);
            await aplicar(`importar ${arq.name}`, [{ op: 'criarNo', prancheta: prancheta.id, no: { ...r.no, nome: novoNome('Logo'), x: Math.round(prancheta.largura * 0.07), y: Math.round(prancheta.altura - altura - prancheta.largura * 0.07), largura, altura } as never }]);
            if (r.avisos.length) avisar(`Logo importado com avisos: ${r.avisos.join('; ')}`);
          } catch (err) {
            avisar(err instanceof Error ? err.message : String(err));
          }
        }}
      />
    </label>
  );
}

interface TexturaDaBiblioteca {
  nome: string;
  descricao: string;
  modoDeMesclagem: string;
  opacidade: number;
  arquivo: string;
  largura: number;
  altura: number;
  origem: unknown;
}

function NovaTextura({ prancheta, novoNome }: { prancheta: Prancheta; novoNome: (b: string) => string }) {
  const { aplicar, tarefa } = useEditor();
  const [lista, setLista] = useState<TexturaDaBiblioteca[]>([]);
  useEffect(() => {
    void fetch('/api/texturas').then(async (r) => setLista((await r.json()) as TexturaDaBiblioteca[]));
  }, []);
  return (
    <select
      aria-label="Nova textura"
      value=""
      disabled={tarefa?.estado === 'rodando' || lista.length === 0}
      onChange={(e) => {
        const t = lista.find((x) => x.nome === e.target.value);
        if (!t) return;
        void aplicar(`textura ${t.nome}`, [
          { op: 'criarNo', prancheta: prancheta.id, no: { tipo: 'imagem', nome: novoNome(`Textura ${t.nome}`), x: 0, y: 0, largura: prancheta.largura, altura: prancheta.altura, arquivo: t.arquivo, larguraOriginal: t.largura, alturaOriginal: t.altura, ajuste: 'cobrir', modoDeMesclagem: t.modoDeMesclagem, opacidade: t.opacidade, origem: t.origem } as never },
        ]);
      }}
    >
      <option value="">+ Textura</option>
      {lista.map((t) => (
        <option key={t.nome} value={t.nome}>
          {t.nome.replace(/-/g, ' ')}: {t.descricao}
        </option>
      ))}
    </select>
  );
}
