// Formulário de briefing: caminho padrão para criar (ADR 033). Chega ao Otto como dado estruturado.
import { useEffect, useId, useState } from 'react';
import type { EsforcoCriativo } from '../../servidor/esforco';
import { api, type FichaDaMarca } from '../api';
import { EscolhaDeFonte } from './Propriedades';
import { SeletorDeEsforco } from './SeletorDeEsforco';

interface Formato {
  nome: string;
  largura: number;
  altura: number;
}

const FORMATOS: Formato[] = [
  { nome: 'Feed', largura: 1080, altura: 1350 },
  { nome: 'Quadrado', largura: 1080, altura: 1080 },
  { nome: 'Story', largura: 1080, altura: 1920 },
  { nome: 'Banner', largura: 1200, altura: 628 },
  { nome: 'Capa', largura: 1584, altura: 396 },
];

const ESTILOS = ['sóbrio', 'ousado', 'editorial', 'acolhedor', 'varejo', 'minimalista'];

export interface DadosDoBriefing {
  nome: string;
  objetivo: string;
  publico: string;
  formatos: Formato[];
  textos: { titulo: string; subtitulo: string; chamada: string; rodape: string };
  identidade: { cores: { primaria: string; destaque: string; fundo: string; texto: string }; fonteDeTitulo: string; fonteDeTexto: string };
  imagens: { fonte: 'pixabay'; termos: string } | { fonte: 'upload'; arquivos: { hash: string; largura: number; altura: number; nome: string }[] } | { fonte: 'nenhuma' };
  estilo: string[];
  restricoes: string;
  observacoes: string;
  logo?: { nome: string; no: unknown; avisos: string[] } | undefined;
  /** site público da marca; lido, vira a ficha em "marca" */
  site?: string;
  marca?: (FichaDaMarca & { captura: string; avisos: string[] }) | undefined;
  /** false enquanto as cores e fontes são as do formulário em branco, não as da marca */
  identidadeDefinida?: boolean;
  icones?: { nome: string; no: unknown; avisos: string[] }[] | undefined;
}

const EM_BRANCO: DadosDoBriefing = {
  nome: '',
  objetivo: 'vender',
  publico: '',
  formatos: [FORMATOS[0]!],
  textos: { titulo: '', subtitulo: '', chamada: '', rodape: '' },
  identidade: { cores: { primaria: '#0F3B2C', destaque: '#F4C430', fundo: '#F4EFE3', texto: '#17171C' }, fonteDeTitulo: 'DM Serif Display', fonteDeTexto: 'IBM Plex Sans' },
  imagens: { fonte: 'pixabay', termos: '' },
  estilo: [],
  restricoes: '',
  observacoes: '',
  site: '',
  identidadeDefinida: false,
};

const EXEMPLO: DadosDoBriefing = {
  ...EM_BRANCO,
  nome: 'Lançamento de tênis de corrida',
  objetivo: 'vender',
  publico: 'corredores amadores, 25 a 40 anos',
  formatos: [FORMATOS[0]!, FORMATOS[2]!],
  textos: { titulo: 'Corra mais leve', subtitulo: 'Nova linha Vento 2, com 20% menos peso', chamada: 'Compre agora', rodape: 'ventoesportes.com.br' },
  identidade: { cores: { primaria: '#FF5B1F', destaque: '#F4EFE3', fundo: '#17171C', texto: '#F4EFE3' }, fonteDeTitulo: 'Anton', fonteDeTexto: 'IBM Plex Sans' },
  imagens: { fonte: 'pixabay', termos: 'running shoes' },
  estilo: ['ousado'],
  restricoes: 'Sem pessoas de rosto visível',
  identidadeDefinida: true,
};

const CHAVE_SALVOS = 'otto.briefingsSalvos';

function lerSalvos(): DadosDoBriefing[] {
  try {
    return JSON.parse(localStorage.getItem(CHAVE_SALVOS) ?? '[]') as DadosDoBriefing[];
  } catch {
    return [];
  }
}

function paraOAgente(d: DadosDoBriefing) {
  const imagens =
    d.imagens.fonte === 'upload'
      ? {
          fonte: 'upload do designer',
          usarEstas: d.imagens.arquivos.map((a) => ({ descricao: a.nome, no: { tipo: 'imagem', arquivo: a.hash, larguraOriginal: a.largura, alturaOriginal: a.altura, ajuste: 'cobrir', origem: { banco: 'Upload do designer', autor: 'conta', licenca: 'da conta', url: '' } } })),
        }
      : d.imagens.fonte === 'pixabay'
        ? { fonte: 'banco de imagens (Pixabay)', termos: d.imagens.termos || '(escolha pelos textos)' }
        : { fonte: 'nenhuma: peça só tipográfica e com formas' };
  return {
    nome: d.nome,
    objetivo: d.objetivo,
    publico: d.publico,
    formatos: d.formatos,
    textos: Object.fromEntries(Object.entries(d.textos).filter(([, v]) => v.trim())),
    // cores e fontes do formulário em branco não são da marca: sem isso o Otto tratava o padrão como identidade
    identidade: d.identidadeDefinida === false && !d.marca ? 'não definida: a direção de arte escolhe' : d.identidade,
    ...(d.marca ? { marca: semAvisos(d.marca) } : d.site?.trim() ? { site: d.site.trim() } : {}),
    imagens,
    estilo: d.estilo.join(', '),
    ...(d.logo ? { logo: { arquivo: d.logo.nome, usarEste: d.logo.no, avisosDaImportacao: d.logo.avisos } } : {}),
    ...(d.icones?.length ? { icones: d.icones.map((i) => ({ arquivo: i.nome, usarEste: i.no, avisosDaImportacao: i.avisos })) } : {}),
    restricoes: d.restricoes.split('\n').map((s) => s.trim()).filter(Boolean),
    observacoes: d.observacoes,
  };
}

const semAvisos = ({ avisos: _a, ...ficha }: NonNullable<DadosDoBriefing['marca']>) => ficha;

export function Briefing({ aoFechar, aoEnviar }: { aoFechar: () => void; aoEnviar: (briefing: unknown, nome: string, esforco?: EsforcoCriativo) => Promise<void> }) {
  const [d, setD] = useState<DadosDoBriefing>(EM_BRANCO);
  // fora do briefing de propósito: o briefing é dado do cliente; o esforço é parâmetro da tarefa
  const [esforco, setEsforco] = useState<EsforcoCriativo>();
  const [salvos, setSalvos] = useState<DadosDoBriefing[]>(lerSalvos);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string>();
  const [lendoSite, setLendoSite] = useState(false);
  const id = useId();

  useEffect(() => {
    const f = (e: KeyboardEvent) => e.key === 'Escape' && aoFechar();
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  }, [aoFechar]);

  const texto = (campo: keyof DadosDoBriefing['textos']) => ({
    value: d.textos[campo],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setD({ ...d, textos: { ...d.textos, [campo]: e.target.value } }),
  });
  const cor = (campo: keyof DadosDoBriefing['identidade']['cores']) => ({
    value: d.identidade.cores[campo],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setD({ ...d, identidadeDefinida: true, identidade: { ...d.identidade, cores: { ...d.identidade.cores, [campo]: e.target.value } } }),
  });
  const alternarFormato = (f: Formato) => {
    const tem = d.formatos.some((x) => x.nome === f.nome);
    setD({ ...d, formatos: tem ? d.formatos.filter((x) => x.nome !== f.nome) : [...d.formatos, f] });
  };

  const salvar = () => {
    const nome = d.nome.trim() || 'Briefing sem nome';
    const novos = [{ ...d, nome }, ...salvos.filter((s) => s.nome !== nome)].slice(0, 12);
    setSalvos(novos);
    try {
      localStorage.setItem(CHAVE_SALVOS, JSON.stringify(novos));
    } catch {
      setErro('não consegui salvar neste navegador');
    }
  };

  const enviarArquivos = async (lista: FileList | null) => {
    if (!lista?.length) return;
    try {
      const enviados = await Promise.all([...lista].map(async (f) => ({ ...(await api.enviarImagem(f)), nome: f.name })));
      const atuais = d.imagens.fonte === 'upload' ? d.imagens.arquivos : [];
      setD({ ...d, imagens: { fonte: 'upload', arquivos: [...atuais, ...enviados] } });
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    }
  };

  /** Lê o site e preenche identidade e logo; o designer confere e ajusta antes de criar. */
  const lerSite = async () => {
    const url = d.site?.trim();
    if (!url) return;
    setLendoSite(true);
    setErro(undefined);
    try {
      const lido = await api.lerSite(url);
      const { titulo, texto } = lido.ficha.tipografia;
      const fonte = (t: typeof titulo, atual: string) => (t ? (t.noGoogleFonts ? t.familia : (t.substituta ?? atual)) : atual);
      const logoVetor = lido.logo && 'no' in lido.logo ? lido.logo : undefined;
      const logoAvisos = lido.logo && 'imagem' in lido.logo ? lido.logo.avisos : [];
      setD((atual) => ({
        ...atual,
        identidadeDefinida: true,
        identidade: { cores: { ...lido.ficha.paleta }, fonteDeTitulo: fonte(titulo, atual.identidade.fonteDeTitulo), fonteDeTexto: fonte(texto, atual.identidade.fonteDeTexto) },
        ...(!atual.logo && logoVetor ? { logo: { nome: logoVetor.no.origem.nome, no: logoVetor.no, avisos: logoVetor.avisos } } : {}),
        marca: { ...lido.ficha, captura: lido.captura.hash, avisos: [...lido.avisos, ...logoAvisos] },
      }));
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setLendoSite(false);
    }
  };

  const valido = d.textos.titulo.trim() && d.formatos.length > 0;

  return (
    <div className="veu" role="dialog" aria-modal="true" aria-labelledby={`${id}-t`}>
      <form
        className="briefing"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!valido) return;
          setEnviando(true);
          setErro(undefined);
          try {
            await aoEnviar(paraOAgente(d), d.nome.trim() || d.textos.titulo.trim(), esforco);
          } catch (err) {
            setErro(err instanceof Error ? err.message : String(err));
            setEnviando(false);
          }
        }}
      >
        <header className="briefing-topo">
          <div>
            <p className="sobretitulo">Nova peça</p>
            <h1 id={`${id}-t`}>Briefing</h1>
            <p className="apoio">O Otto monta a peça em camadas a partir destes campos. Você revisa antes de aceitar.</p>
          </div>
          <div className="salvos">
            <select
              aria-label="Usar briefing salvo"
              value=""
              onChange={(e) => {
                const s = salvos.find((x) => x.nome === e.target.value);
                if (s) setD({ ...EM_BRANCO, identidadeDefinida: true, ...s });
              }}
            >
              <option value="">{salvos.length ? 'Usar briefing salvo…' : 'Nenhum briefing salvo'}</option>
              {salvos.map((s) => (
                <option key={s.nome}>{s.nome}</option>
              ))}
            </select>
            <button type="button" className="botao secundario" onClick={() => setD(EXEMPLO)}>
              Preencher com exemplo
            </button>
          </div>
        </header>

        <div className="briefing-corpo">
          <section>
            <h2>
              <span>01</span> A peça
            </h2>
            <label className="f">
              <span>Nome</span>
              <input value={d.nome} onChange={(e) => setD({ ...d, nome: e.target.value })} placeholder="Promoção da semana" />
            </label>
            <div className="duas">
              <label className="f">
                <span>Objetivo</span>
                <select value={d.objetivo} onChange={(e) => setD({ ...d, objetivo: e.target.value })}>
                  <option value="vender">Vender</option>
                  <option value="divulgar">Divulgar um evento</option>
                  <option value="informar">Informar</option>
                  <option value="engajar">Engajar</option>
                  <option value="lançar">Lançar produto</option>
                </select>
              </label>
              <label className="f">
                <span>Público</span>
                <input value={d.publico} onChange={(e) => setD({ ...d, publico: e.target.value })} placeholder="clientes atuais, 25 a 45 anos" />
              </label>
            </div>
            <label className="f">
              <span>Esforço criativo</span>
              <SeletorDeEsforco valor={esforco} aoMudar={setEsforco} />
              <small>Quanto o Otto explora e refina antes de entregar. Não muda o estilo nem a quantidade de elementos.</small>
            </label>
            <fieldset className="f">
              <legend>Formatos</legend>
              <div className="chips">
                {FORMATOS.map((f) => (
                  <button key={f.nome} type="button" className="chip" aria-pressed={d.formatos.some((x) => x.nome === f.nome)} onClick={() => alternarFormato(f)}>
                    {f.nome} <small>{f.largura}×{f.altura}</small>
                  </button>
                ))}
              </div>
            </fieldset>
          </section>

          <section>
            <h2>
              <span>02</span> Textos
            </h2>
            <label className="f">
              <span>Título *</span>
              <input required {...texto('titulo')} placeholder="Cappuccino em dobro" />
            </label>
            <label className="f">
              <span>Subtítulo</span>
              <input {...texto('subtitulo')} placeholder="Na compra de um, o segundo sai por R$ 1" />
            </label>
            <div className="duas">
              <label className="f">
                <span>Chamada</span>
                <input {...texto('chamada')} placeholder="Peça já" />
              </label>
              <label className="f">
                <span>Rodapé fixo</span>
                <input {...texto('rodape')} placeholder="@marca · endereço" />
              </label>
            </div>
          </section>

          <section>
            <h2>
              <span>03</span> Identidade
            </h2>
            <div className="f">
              <span>Site da marca</span>
              <div className="site-da-marca">
                <input
                  value={d.site ?? ''}
                  onChange={(e) => setD({ ...d, site: e.target.value, marca: undefined })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void lerSite();
                    }
                  }}
                  placeholder="marca.com.br"
                  inputMode="url"
                />
                <button type="button" className="botao secundario" disabled={!d.site?.trim() || lendoSite} onClick={() => void lerSite()}>
                  {lendoSite ? 'Lendo o site…' : 'Ler identidade'}
                </button>
              </div>
              <small>O Otto abre o site, mede cores, fontes, botões e logo e preenche os campos abaixo. A peça segue a linguagem do site. Confira antes de criar.</small>
              {d.marca && (
                <div className="marca-lida">
                  <img src={`/api/arquivos/${d.marca.captura}`} alt={`Topo de ${d.marca.site}`} />
                  <div>
                    <p>
                      <b>{d.marca.nome || d.marca.site}</b>
                    </p>
                    <p>
                      Título em {d.marca.tipografia.titulo?.familia ?? '?'}
                      {d.marca.tipografia.titulo?.caixaAlta ? ' caixa alta' : ''} · texto em {d.marca.tipografia.texto?.familia ?? '?'} · botão {d.marca.forma.botao} · {d.marca.fotografia.cobertura}% de foto na tela
                    </p>
                    <div className="faixa-de-cores" aria-label="Cores do site">
                      {d.marca.cores.slice(0, 8).map((c) => (
                        <span key={c.cor} style={{ background: c.cor, flexGrow: Math.max(c.peso, 4) }} title={`${c.cor} · ${c.papeis.join(', ')}`} />
                      ))}
                    </div>
                    {d.marca.avisos.map((a) => (
                      <small key={a}>{a}</small>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="cores">
              {(
                [
                  ['primaria', 'Primária'],
                  ['destaque', 'Destaque'],
                  ['fundo', 'Fundo'],
                  ['texto', 'Texto'],
                ] as const
              ).map(([k, r]) => (
                <label key={k} className="amostra">
                  <input type="color" {...cor(k)} />
                  <span>{r}</span>
                  <code>{d.identidade.cores[k]}</code>
                </label>
              ))}
            </div>
            <div className="duas">
              <label className="f">
                <span>Fonte de título</span>
                <EscolhaDeFonte valor={d.identidade.fonteDeTitulo} desativado={false} aoEscolher={(f) => setD({ ...d, identidadeDefinida: true, identidade: { ...d.identidade, fonteDeTitulo: f } })} />
              </label>
              <label className="f">
                <span>Fonte de texto</span>
                <EscolhaDeFonte valor={d.identidade.fonteDeTexto} desativado={false} aoEscolher={(f) => setD({ ...d, identidadeDefinida: true, identidade: { ...d.identidade, fonteDeTexto: f } })} />
              </label>
            </div>
            <div className="f">
              <span>Logo (SVG)</span>
              <input
                type="file"
                accept=".svg,image/svg+xml"
                onChange={async (e) => {
                  const arq = e.target.files?.[0];
                  if (!arq) return;
                  try {
                    const r = await api.importarVetor(arq);
                    setD({ ...d, logo: { nome: arq.name, no: r.no, avisos: r.avisos } });
                  } catch (err) {
                    setErro(err instanceof Error ? err.message : String(err));
                  }
                }}
              />
              {d.logo && (
                <small>
                  {d.logo.nome} importado{d.logo.avisos.length ? ` · avisos: ${d.logo.avisos.join('; ')}` : ''}
                </small>
              )}
            </div>
            <div className="f">
              <span>Ícones e elementos da marca (SVG, opcional)</span>
              <input
                type="file"
                multiple
                accept=".svg,image/svg+xml"
                onChange={async (e) => {
                  const arquivos = [...(e.target.files ?? [])];
                  try {
                    const novos = await Promise.all(arquivos.map(async (arq) => ({ nome: arq.name, ...(await api.importarVetor(arq)) })));
                    setD({ ...d, icones: [...(d.icones ?? []), ...novos.map((n) => ({ nome: n.nome, no: n.no, avisos: n.avisos }))] });
                  } catch (err) {
                    setErro(err instanceof Error ? err.message : String(err));
                  }
                }}
              />
              {d.icones?.map((i) => (
                <small key={i.nome}>
                  {i.nome} importado{i.avisos.length ? ` · avisos: ${i.avisos.join('; ')}` : ''}
                </small>
              ))}
            </div>
            <fieldset className="f">
              <legend>Estilo</legend>
              <div className="chips">
                {ESTILOS.map((s) => (
                  <button key={s} type="button" className="chip" aria-pressed={d.estilo.includes(s)} onClick={() => setD({ ...d, estilo: d.estilo.includes(s) ? d.estilo.filter((x) => x !== s) : [...d.estilo, s] })}>
                    {s}
                  </button>
                ))}
              </div>
            </fieldset>
          </section>

          <section>
            <h2>
              <span>04</span> Imagem
            </h2>
            <div className="segmentado grande" role="radiogroup" aria-label="Fonte da imagem">
              {(
                [
                  ['pixabay', 'Banco de imagens'],
                  ['upload', 'Minhas imagens'],
                  ['nenhuma', 'Sem imagem'],
                ] as const
              ).map(([v, r]) => (
                <button
                  key={v}
                  type="button"
                  role="radio"
                  aria-checked={d.imagens.fonte === v}
                  onClick={() => setD({ ...d, imagens: v === 'pixabay' ? { fonte: v, termos: '' } : v === 'upload' ? { fonte: v, arquivos: [] } : { fonte: v } })}
                >
                  {r}
                </button>
              ))}
            </div>
            {d.imagens.fonte === 'pixabay' && (
              <label className="f">
                <span>Buscar por</span>
                <input value={d.imagens.termos} onChange={(e) => setD({ ...d, imagens: { fonte: 'pixabay', termos: e.target.value } })} placeholder="cappuccino, xícara" />
                <small>Pixabay. Crédito e licença vão no relatório de exportação.</small>
              </label>
            )}
            {d.imagens.fonte === 'upload' && (
              <div className="f">
                <input type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={(e) => void enviarArquivos(e.target.files)} />
                <div className="miniaturas">
                  {d.imagens.arquivos.map((a) => (
                    <img key={a.hash} src={`/api/arquivos/${a.hash}`} alt={a.nome} />
                  ))}
                </div>
              </div>
            )}
          </section>

          <section className="inteira">
            <h2>
              <span>05</span> Restrições e observações
            </h2>
            <div className="duas">
              <label className="f">
                <span>Restrições (uma por linha)</span>
                <textarea rows={3} value={d.restricoes} onChange={(e) => setD({ ...d, restricoes: e.target.value })} placeholder={'nunca foto de pessoa\nlogo sempre no canto inferior direito'} />
              </label>
              <label className="f">
                <span>Observações</span>
                <textarea rows={3} value={d.observacoes} onChange={(e) => setD({ ...d, observacoes: e.target.value })} placeholder="o detalhe que não coube nos campos" />
              </label>
            </div>
          </section>
        </div>

        <footer className="briefing-rodape">
          {erro && <p className="erro">{erro}</p>}
          <button type="button" className="botao secundario" onClick={salvar}>
            Salvar como briefing
          </button>
          <span className="espaco" />
          <button type="button" className="botao" onClick={aoFechar}>
            Cancelar
          </button>
          <button type="submit" className="botao primario" disabled={!valido || enviando}>
            {enviando ? 'Enviando ao Otto…' : `Criar ${d.formatos.length} ${d.formatos.length === 1 ? 'formato' : 'formatos'}`}
          </button>
        </footer>
      </form>
    </div>
  );
}
