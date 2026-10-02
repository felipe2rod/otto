'use client';

// Busca no banco de imagens (ADR 032), usada no formulário de briefing e dentro do editor. Regras do
// banco que são desta tela: a ORIGEM aparece sempre que há resultado, com o autor e a licença; a prévia
// vem por rota nossa; "usar" traz a imagem para o armazenamento da conta (nunca link direto). O nome do
// banco é o que o servidor devolve: esta tela não conhece banco nenhum pelo nome.
import type { ImagemDoBanco, ImagemTrazida, OrientacaoDeImagem, ResultadoDaBuscaDeImagens } from '@otto/shared';
import { useId, useState } from 'react';
import type { ApiDeImagens } from '../api/imagens';
import formulario from '../produto/Formulario.module.css';
import { imagens as textos } from '../textos/briefing';
import estilos from './BuscaDeImagens.module.css';

const ORIENTACOES: readonly OrientacaoDeImagem[] = ['todas', 'horizontal', 'vertical'];
const chave = (item: Pick<ImagemDoBanco, 'banco' | 'id'>): string => `${item.banco}/${item.id}`;
const frase = (codigo: string): string => textos.erros[codigo] ?? (textos.erros.padrao as string);

type Estado = { tipo: 'parado' } | { tipo: 'buscando' } | { tipo: 'erro'; codigo: string } | { tipo: 'resultado'; resultado: ResultadoDaBuscaDeImagens };

export interface PropriedadesDaBusca {
  api: ApiDeImagens;
  /** A imagem já é arquivo da conta. Devolver `false` diz que ela não entrou (a tela não a marca como usada). */
  aoTrazer(imagem: ImagemTrazida, item: ImagemDoBanco): boolean | undefined | Promise<boolean | undefined>;
  orientacaoInicial?: OrientacaoDeImagem;
  textoInicial?: string;
  /** Não dá para trazer mais (o formulário chegou ao máximo de fotos). */
  cheio?: boolean;
}

export function BuscaDeImagens({ api, aoTrazer, orientacaoInicial = 'todas', textoInicial = '', cheio = false }: PropriedadesDaBusca) {
  const [texto, setTexto] = useState(textoInicial);
  const [orientacao, setOrientacao] = useState<OrientacaoDeImagem>(orientacaoInicial);
  const [estado, setEstado] = useState<Estado>({ tipo: 'parado' });
  const [trazendo, setTrazendo] = useState<string | null>(null);
  const [trazidas, setTrazidas] = useState<ReadonlySet<string>>(new Set());
  const [erroAoTrazer, setErroAoTrazer] = useState<string | null>(null);
  const idDoTexto = useId();
  const idDaOrientacao = useId();

  const buscar = async () => {
    if (texto.trim() === '' || estado.tipo === 'buscando') return;
    setErroAoTrazer(null);
    setEstado({ tipo: 'buscando' });
    const r = await api.buscar(texto, orientacao);
    setEstado(r.ok ? { tipo: 'resultado', resultado: r.resultado } : { tipo: 'erro', codigo: r.codigo });
  };

  const trazer = async (item: ImagemDoBanco) => {
    setErroAoTrazer(null);
    setTrazendo(chave(item));
    const r = await api.trazer({ banco: item.banco, id: item.id });
    if (!r.ok) {
      setTrazendo(null);
      return setErroAoTrazer(r.codigo);
    }
    const entrou = await aoTrazer(r.imagem, item);
    setTrazendo(null);
    if (entrou !== false) setTrazidas((antes) => new Set(antes).add(chave(item)));
  };

  const resultado = estado.tipo === 'resultado' ? estado.resultado : undefined;

  return (
    <div className={estilos.busca}>
      {/* não é <form>: a busca aparece dentro do formulário de briefing, e formulário dentro de formulário não existe */}
      <search className={estilos.consulta} aria-label={textos.titulo}>
        <div className={formulario.campo}>
          <label className={formulario.rotulo} htmlFor={idDoTexto}>
            {textos.campo}
          </label>
          <input
            id={idDoTexto}
            type="search"
            value={texto}
            maxLength={100}
            placeholder={textos.exemplo}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return;
              // Enter busca, e não envia o formulário em volta
              e.preventDefault();
              void buscar();
            }}
          />
        </div>
        <div className={formulario.campo}>
          <label className={formulario.rotulo} htmlFor={idDaOrientacao}>
            {textos.orientacao}
          </label>
          <select id={idDaOrientacao} value={orientacao} onChange={(e) => setOrientacao(e.target.value as OrientacaoDeImagem)}>
            {ORIENTACOES.map((o) => (
              <option key={o} value={o}>
                {textos.orientacoes[o]}
              </option>
            ))}
          </select>
        </div>
        <button type="button" className={formulario.botao} disabled={texto.trim() === '' || estado.tipo === 'buscando'} onClick={() => void buscar()}>
          {estado.tipo === 'buscando' ? textos.buscando : textos.buscar}
        </button>
      </search>

      {estado.tipo === 'erro' && (
        <p className={formulario.erro} role="alert">
          {frase(estado.codigo)}
        </p>
      )}
      {erroAoTrazer && (
        <p className={formulario.erro} role="alert">
          {frase(erroAoTrazer)}
        </p>
      )}

      {resultado && resultado.itens.length === 0 && (
        <p className={formulario.nota} role="status">
          {textos.nenhum}
        </p>
      )}
      {resultado && resultado.itens.length > 0 && (
        <>
          {/* a origem, sempre que há resultado (ADR 032) */}
          <p className={estilos.origem} data-origem-das-imagens>
            {textos.origem(resultado.banco.nome, resultado.banco.licenca)} {textos.ladoMaximo(resultado.banco.ladoMaximo)}
          </p>
          <ul className={estilos.resultados} aria-label={textos.resultados}>
            {resultado.itens.map((item) => {
              const usada = trazidas.has(chave(item));
              const nesta = trazendo === chave(item);
              return (
                <li key={chave(item)} className={estilos.resultado}>
                  {/* biome-ignore lint/performance/noImgElement: a prévia é rota da API, com validade; não passa pelo otimizador de imagens */}
                  <img src={item.previa} alt={textos.foto(item.descricao, item.autor)} loading="lazy" />
                  <div className={estilos.dados}>
                    <span>{textos.autor(item.autor)}</span>
                    <span>{textos.medidas(item.largura, item.altura)}</span>
                    <a href={item.pagina} target="_blank" rel="noreferrer noopener" aria-label={textos.verNoBanco(resultado.banco.nome)}>
                      {textos.paginaNoBanco}
                    </a>
                  </div>
                  <button type="button" className={formulario.botao} aria-label={textos.trazerEsta(item.autor)} disabled={usada || trazendo !== null || cheio} onClick={() => void trazer(item)}>
                    {usada ? textos.trazida : nesta ? textos.trazendo : textos.trazer}
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
