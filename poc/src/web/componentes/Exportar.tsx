import { useEffect, useState } from 'react';
import { api, type RelatorioDeExportacao } from '../api';
import { useEditor } from '../estado';

export function Exportar({ aoFechar }: { aoFechar: () => void }) {
  const { doc } = useEditor();
  const [rel, setRel] = useState<RelatorioDeExportacao>();
  const [erro, setErro] = useState<string>();

  useEffect(() => {
    if (!doc) return;
    api.relatorio(doc.id).then((r) => setRel(r.relatorio)).catch((e: unknown) => setErro(e instanceof Error ? e.message : String(e)));
    const f = (e: KeyboardEvent) => e.key === 'Escape' && aoFechar();
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  }, [doc, aoFechar]);

  if (!doc) return null;
  const nativos = rel?.camadas.filter((c) => c.destino === 'Nativo editável').length ?? 0;
  const pixel = rel?.camadas.filter((c) => c.destino !== 'Nativo editável').length ?? 0;

  return (
    <div className="veu" role="dialog" aria-modal="true" aria-labelledby="exportar-t" onClick={(e) => e.target === e.currentTarget && aoFechar()}>
      <div className="exportar">
        <header>
          <p className="sobretitulo">Exportar para PSD</p>
          <h1 id="exportar-t">{doc.nome}</h1>
          <p className="apoio">Um PSD por prancheta, com texto e forma editáveis. Cada camada leva também o próprio pixel, e o arquivo traz a composta.</p>
        </header>
        <div className="downloads">
          <a className="botao primario" href={`/api/documentos/${doc.id}/exportar`} download>
            Baixar pacote (.zip): PSDs, fontes e relatório
          </a>
          {doc.pranchetas.length > 1 && (
            <a className="botao" href={`/api/documentos/${doc.id}/exportar?formato=artboards`} download>
              PSD único com as {doc.pranchetas.length} pranchetas (artboards)
            </a>
          )}
          {doc.pranchetas.map((p) => (
            <a key={p.id} className="botao" href={`/api/documentos/${doc.id}/exportar?prancheta=${p.id}`} download>
              {p.nome}.psd <small>{p.largura}×{p.altura}</small>
            </a>
          ))}
        </div>
        {erro && <p className="erro">{erro}</p>}
        {!rel && !erro && <p className="nota">Montando o relatório…</p>}
        {rel && (
          <div className="relatorio">
            <h2>Relatório de exportação</h2>
            <p className="placar">
              <b>{nativos}</b> camadas editáveis · <b>{pixel}</b> em pixel
            </p>
            <ul className="avisos">
              {rel.avisos.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
            <table>
              <thead>
                <tr>
                  <th>Prancheta</th>
                  <th>Camada</th>
                  <th>No PSD</th>
                  <th>Observação</th>
                </tr>
              </thead>
              <tbody>
                {rel.camadas.map((c, i) => (
                  <tr key={i}>
                    <td>{c.prancheta}</td>
                    <td>{c.camada}</td>
                    <td className={c.destino === 'Nativo editável' ? 'ok' : 'px'}>{c.destino}</td>
                    <td>{c.observacao}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rel.imagens.length > 0 && (
              <>
                <h3>Imagens e licenças</h3>
                <ul className="creditos">
                  {rel.imagens.map((i, k) => (
                    <li key={k}>
                      {i.camada}: {i.banco}, por {i.autor}.{' '}
                      {i.url && (
                        <a href={i.url} target="_blank" rel="noreferrer">
                          página da imagem
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}
        <footer>
          <button type="button" className="botao" onClick={aoFechar}>
            Fechar
          </button>
        </footer>
      </div>
    </div>
  );
}
