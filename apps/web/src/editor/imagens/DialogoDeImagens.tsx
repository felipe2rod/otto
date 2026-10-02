'use client';

// Buscar no banco de imagens de dentro do editor (ADR 032): a imagem escolhida é trazida para a conta
// e vira camada da peça por operação do catálogo, com banco, autor e licença no nó. A origem fica à
// vista nos resultados.
import type { ImagemDoBanco, ImagemTrazida } from '@otto/shared';
import { useEffect, useId, useRef } from 'react';
import type { ApiDeImagens } from '../../api/imagens';
import { BuscaDeImagens } from '../../imagens/BuscaDeImagens';
import { imagens as textos } from '../../textos/briefing';
import { useAmbiente } from '../ambiente';
import estilos from './DialogoDeImagens.module.css';

/** O nome da camada: a primeira etiqueta da imagem no banco; sem etiqueta, quem fez. */
const nomeDaCamada = (item: ImagemDoBanco): string => item.descricao.split(',')[0]?.trim() || item.autor;

export function DialogoDeImagens({ api, aoFechar }: { api: ApiDeImagens; aoFechar: () => void }) {
  const ambiente = useAmbiente();
  const dialogo = useRef<HTMLDialogElement>(null);
  const idDoTitulo = useId();

  // <dialog> modal: o navegador prende o foco e fecha no Esc. Ao sair, o foco volta para quem abriu.
  useEffect(() => {
    const d = dialogo.current;
    const quemAbriu = document.activeElement;
    if (d && !d.open) {
      if (typeof d.showModal === 'function') d.showModal();
      else d.setAttribute('open', '');
    }
    return () => {
      const destino = quemAbriu instanceof HTMLElement && quemAbriu.isConnected ? quemAbriu : document.querySelector<HTMLElement>('[data-abre-imagens]');
      destino?.focus();
    };
  }, []);

  const trazer = (imagem: ImagemTrazida, item: ImagemDoBanco) => ambiente.inserirImagemTrazida(imagem, nomeDaCamada(item));

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
        <BuscaDeImagens api={api} aoTrazer={trazer} />
      </div>
    </dialog>
  );
}
