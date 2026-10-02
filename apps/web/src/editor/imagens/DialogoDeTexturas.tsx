'use client';

// Texturas no editor: papel, retícula, grão. A escolhida vira arquivo da conta e entra como camada de
// imagem por operação do catálogo, cobrindo a prancheta, com o modo de mesclagem e a opacidade com que
// costuma ser usada. As descrições vêm do servidor.
import type { Textura } from '@otto/shared';
import { useEffect, useId, useRef, useState } from 'react';
import type { ApiDeTexturas } from '../../api/imagens';
import formulario from '../../produto/Formulario.module.css';
import { texturas as textos } from '../../textos/briefing';
import { editor } from '../../textos/editor';
import { useAmbiente } from '../ambiente';
import estilos from './DialogoDeImagens.module.css';

const nomeDoModo = (modo: string): string => (editor.mesclagem as Readonly<Record<string, string>>)[modo] ?? modo;

export function DialogoDeTexturas({ api, aoFechar }: { api: ApiDeTexturas; aoFechar: () => void }) {
  const ambiente = useAmbiente();
  const dialogo = useRef<HTMLDialogElement>(null);
  const idDoTitulo = useId();
  /** Nulo: carregando. Indefinido: a leitura falhou. */
  const [lista, setLista] = useState<Textura[] | null | undefined>(null);
  const [trazendo, setTrazendo] = useState<string | null>(null);
  const [naoVeio, setNaoVeio] = useState<string | null>(null);

  // <dialog> modal: o navegador prende o foco e fecha no Esc. Ao sair, o foco volta para quem abriu.
  useEffect(() => {
    const d = dialogo.current;
    const quemAbriu = document.activeElement;
    if (d && !d.open) {
      if (typeof d.showModal === 'function') d.showModal();
      else d.setAttribute('open', '');
    }
    return () => {
      const destino = quemAbriu instanceof HTMLElement && quemAbriu.isConnected ? quemAbriu : document.querySelector<HTMLElement>('[data-abre-texturas]');
      destino?.focus();
    };
  }, []);

  useEffect(() => {
    let desmontado = false;
    void api.listar().then((itens) => !desmontado && setLista(itens));
    return () => {
      desmontado = true;
    };
  }, [api]);

  const usar = async (textura: Textura) => {
    setNaoVeio(null);
    setTrazendo(textura.nome);
    const r = await api.trazer(textura.nome);
    setTrazendo(null);
    if (!r.ok || !ambiente.inserirTextura(r.textura, textura.nome)) return setNaoVeio(textura.nome);
    aoFechar();
  };

  return (
    <dialog ref={dialogo} className={estilos.dialogo} aria-labelledby={idDoTitulo} onClose={aoFechar}>
      <div className={estilos.topo}>
        <h2 id={idDoTitulo} className={estilos.titulo}>
          {textos.titulo}
        </h2>
        <button type="button" className={estilos.fechar} aria-label={textos.fechar} title={textos.fechar} onClick={aoFechar}>
          <span aria-hidden="true">×</span>
        </button>
      </div>
      <div className={estilos.corpo}>
        <p className={formulario.nota}>{textos.explica}</p>
        {lista === null && (
          <p className={formulario.nota} role="status">
            {textos.carregando}
          </p>
        )}
        {lista === undefined && (
          <p className={formulario.erro} role="alert">
            {textos.erro}
          </p>
        )}
        {naoVeio && (
          <p className={formulario.erro} role="alert">
            {textos.naoVeio(naoVeio)}
          </p>
        )}
        {lista && (
          <ul className={estilos.texturas} aria-label={textos.lista}>
            {lista.map((textura) => (
              <li key={textura.nome} className={estilos.textura}>
                <div>
                  <strong>{textura.nome}</strong>
                  <span>{textura.descricao}</span>
                  <small>{textos.comoEntra(nomeDoModo(textura.modoDeMesclagem), Math.round(textura.opacidade * 100))}</small>
                </div>
                <button type="button" className={formulario.botao} aria-label={textos.usarEsta(textura.nome)} disabled={trazendo !== null} onClick={() => void usar(textura)}>
                  {trazendo === textura.nome ? textos.trazendo : textos.usar}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </dialog>
  );
}
