'use client';

// O relatório de importação de um PSD, dentro do editor (ADR 028, item 4): o que veio editável, o que
// virou imagem e por quê, o que ficou de fora, e as fontes. Aparece na primeira vez que a peça importada
// abre, e fica consultável pelo topo. "ver" leva à camada. As frases são as de textos/importar.ts,
// escolhidas pelo código; nome de arquivo, de camada e de fonte é conteúdo de terceiro, mostrado como texto.
import { useEffect, useId, useRef } from 'react';
import type { RelatorioDeImportacaoNaTela } from '../../importar/relatorio';
import { importar } from '../../textos/importar';
import estilos from './DialogoDoRelatorio.module.css';

const t = importar.relatorio;

export function DialogoDoRelatorio({ arquivo, relatorio, aoVer, aoFechar }: { arquivo: string; relatorio: RelatorioDeImportacaoNaTela; aoVer: (idDoNo: string) => void; aoFechar: () => void }) {
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
      const destino = quemAbriu instanceof HTMLElement && quemAbriu.isConnected && quemAbriu !== document.body ? quemAbriu : document.querySelector<HTMLElement>('[data-abre-relatorio-de-importacao]');
      destino?.focus();
    };
  }, []);

  const comVer = (itens: readonly { onde: string; texto: string; idDoNo?: string }[]) => (
    <ul className={estilos.lista}>
      {itens.map((item) => (
        <li key={`${item.onde}-${item.texto}`}>
          <strong>{item.onde}</strong>
          <span>{item.texto}</span>
          {item.idDoNo && (
            <button type="button" className={estilos.ver} aria-label={t.verCamada(item.onde)} onClick={() => item.idDoNo && aoVer(item.idDoNo)}>
              {t.ver}
            </button>
          )}
        </li>
      ))}
    </ul>
  );
  const simples = (itens: readonly string[]) => (
    <ul className={estilos.lista}>
      {itens.map((item) => (
        <li key={item}>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );

  return (
    <dialog ref={dialogo} className={estilos.dialogo} aria-labelledby={idDoTitulo} onClose={aoFechar}>
      <div className={estilos.topo}>
        <div>
          <h2 id={idDoTitulo} className={estilos.titulo}>
            {t.titulo}
          </h2>
          <p className={estilos.arquivo}>{t.doArquivo(arquivo)}</p>
        </div>
        <button type="button" className={estilos.fechar} aria-label={t.fechar} title={t.fechar} onClick={aoFechar}>
          <span aria-hidden="true">×</span>
        </button>
      </div>
      <div className={estilos.corpo}>
        <p className={estilos.resumo} data-resumo-da-importacao>
          {relatorio.resumo}
        </p>
        {relatorio.semPerdas && <p className={estilos.nota}>{t.tudoEditavel}</p>}

        {relatorio.virouImagem.length > 0 && (
          <section className={estilos.secao} data-tom="imagem">
            <h3>{t.virouImagem.titulo(relatorio.virouImagem.length)}</h3>
            <p className={estilos.nota}>{t.virouImagem.explica}</p>
            {comVer(relatorio.virouImagem.map((v) => ({ onde: v.onde, texto: v.motivo, ...(v.idDoNo ? { idDoNo: v.idDoNo } : {}) })))}
          </section>
        )}
        {relatorio.deFora.length > 0 && (
          <section className={estilos.secao} data-tom="fora">
            <h3>{t.deFora.titulo(relatorio.deFora.length)}</h3>
            <p className={estilos.nota}>{t.deFora.explica}</p>
            {comVer(relatorio.deFora.map((v) => ({ onde: v.onde, texto: v.motivo })))}
          </section>
        )}
        {relatorio.aproximado.length > 0 && (
          <section className={estilos.secao}>
            <h3>{t.aproximado.titulo(relatorio.aproximado.length)}</h3>
            <p className={estilos.nota}>{t.aproximado.explica}</p>
            {comVer(relatorio.aproximado.map((v) => ({ onde: v.onde, texto: v.oQue, ...(v.idDoNo ? { idDoNo: v.idDoNo } : {}) })))}
          </section>
        )}
        {relatorio.trocas.length > 0 && (
          <section className={estilos.secao}>
            <h3>{t.fontes.trocadas(relatorio.trocas.length)}</h3>
            {simples(relatorio.trocas)}
          </section>
        )}
        {relatorio.faltaram.length > 0 && (
          <section className={estilos.secao} data-tom="imagem">
            <h3>{t.fontes.emFalta(relatorio.faltaram.length)}</h3>
            {simples(relatorio.faltaram)}
            <p className={estilos.nota}>{t.fontes.comoResolver}</p>
          </section>
        )}
        {relatorio.fontesUsadas.length > 0 && (
          <section className={estilos.secao}>
            <h3>{t.fontes.usadas(relatorio.fontesUsadas.length)}</h3>
            <p className={estilos.nota}>{relatorio.fontesUsadas.join(' · ')}</p>
          </section>
        )}
        {relatorio.observacoes.length > 0 && (
          <section className={estilos.secao}>
            <h3>{t.observacoes.titulo}</h3>
            {simples(relatorio.observacoes)}
          </section>
        )}
        <p className={estilos.nota}>{t.semHistorico}</p>
        <details className={estilos.todas}>
          <summary>{t.todas.titulo(relatorio.camadas.length)}</summary>
          <table className={estilos.tabela}>
            <thead>
              <tr>
                <th scope="col">{t.todas.colunas.camada}</th>
                <th scope="col">{t.todas.colunas.como}</th>
              </tr>
            </thead>
            <tbody>
              {relatorio.camadas.map((c, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: o arquivo pode ter camadas com o mesmo nome; a posição é a identidade da linha
                <tr key={i}>
                  <td>{c.onde}</td>
                  <td>{c.como}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </div>
    </dialog>
  );
}
