'use client';

// Marcas: o cadastro do cliente do designer (docs/mvp/experiencia.md, 3.3). Guarda o que não muda de
// uma peça para outra; o formulário de briefing puxa daqui. Falha de leitura é erro dito, nunca lista
// vazia: "nenhuma marca" lido como "perdi tudo" seria o pior engano desta tela.
import type { FonteDaLista, Marca } from '@otto/shared';
import { useEffect, useState } from 'react';
import formulario from '../produto/Formulario.module.css';
import { criarServicos, type Servicos } from '../produto/servicos';
import { marcas as textos } from '../textos/briefing';
import { EditorDeMarca } from './EditorDeMarca';
import estilos from './Marcas.module.css';
import { IdentidadeDaMarca, LogoDaMarca } from './ResumoDaMarca';

type Lista = { estado: 'carregando' } | { estado: 'erro' } | { estado: 'ok'; marcas: Marca[] };

export function Marcas({ servicos: deFora }: { servicos?: Servicos }) {
  const [servicos] = useState(() => deFora ?? criarServicos());
  const [lista, setLista] = useState<Lista>({ estado: 'carregando' });
  const [catalogo, setCatalogo] = useState<FonteDaLista[] | null>(null);
  /** O que está aberto para edição: o id da marca, ou "nova". */
  const [aberta, setAberta] = useState<string | null>(null);
  const [tentativa, setTentativa] = useState(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `tentativa` é o gatilho de "tentar de novo"
  useEffect(() => {
    let desmontado = false;
    setLista({ estado: 'carregando' });
    void servicos.cadastros.marcas().then((marcas) => !desmontado && setLista(marcas ? { estado: 'ok', marcas } : { estado: 'erro' }));
    return () => {
      desmontado = true;
    };
  }, [servicos, tentativa]);
  useEffect(() => {
    let desmontado = false;
    void servicos.fontes.catalogo().then((itens) => !desmontado && setCatalogo(itens));
    return () => {
      desmontado = true;
    };
  }, [servicos]);

  if (lista.estado === 'carregando')
    return (
      <p className={formulario.nota} role="status">
        {textos.carregando}
      </p>
    );
  if (lista.estado === 'erro')
    return (
      <div className={formulario.erro} role="alert">
        <p>{textos.erro}</p>
        <button type="button" className={formulario.botao} onClick={() => setTentativa((n) => n + 1)}>
          {textos.tentarDeNovo}
        </button>
      </div>
    );

  const guardar = (marca: Marca) => {
    setLista((l) => (l.estado === 'ok' ? { estado: 'ok', marcas: l.marcas.some((m) => m.id === marca.id) ? l.marcas.map((m) => (m.id === marca.id ? marca : m)) : [...l.marcas, marca] } : l));
    setAberta(null);
  };
  const tirar = (id: string) => {
    setLista((l) => (l.estado === 'ok' ? { estado: 'ok', marcas: l.marcas.filter((m) => m.id !== id) } : l));
    setAberta(null);
  };

  return (
    <>
      <div className={estilos.acoes}>
        <button type="button" className={formulario.principal} disabled={aberta === 'nova'} onClick={() => setAberta('nova')}>
          {textos.nova}
        </button>
      </div>
      {aberta === 'nova' && (
        <section className={estilos.nova} aria-label={textos.nova}>
          <EditorDeMarca servicos={servicos} catalogo={catalogo} aoSalvar={guardar} aoCancelar={() => setAberta(null)} />
        </section>
      )}
      {lista.marcas.length === 0 && aberta !== 'nova' ? (
        <p className={estilos.vazio}>{textos.vazio}</p>
      ) : (
        <ul className={estilos.lista} aria-label={textos.lista}>
          {lista.marcas.map((marca) => (
            <li key={marca.id} className={estilos.marca} data-aberta={aberta === marca.id ? 'sim' : undefined}>
              <LogoDaMarca marca={marca} arquivos={servicos.arquivos} />
              <div className={estilos.resumo}>
                <span className={estilos.nome}>{marca.nome}</span>
                <IdentidadeDaMarca marca={marca} />
              </div>
              <div className={estilos.daMarca}>
                <a className={formulario.discreto} href={`/editor/novo?marca=${encodeURIComponent(marca.id)}`} aria-label={textos.novaPecaPara(marca.nome)}>
                  {textos.novaPecaPara(marca.nome)}
                </a>
                <button type="button" className={formulario.botao} aria-expanded={aberta === marca.id} disabled={aberta === marca.id} onClick={() => setAberta(marca.id)}>
                  {textos.editar(marca.nome)}
                </button>
              </div>
              {aberta === marca.id && <EditorDeMarca servicos={servicos} marca={marca} catalogo={catalogo} aoSalvar={guardar} aoCancelar={() => setAberta(null)} aoApagar={tirar} />}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
