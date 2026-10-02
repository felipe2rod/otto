'use client';

// A família de fonte, escolhida entre a biblioteca e o catálogo (docs/mvp/backend.md, 17.12). A família do
// catálogo que ainda não foi baixada chega em segundos na primeira vez que é pedida: enquanto isso o campo
// diz "Baixando…" e a escolha só vale quando ela chega. A tela não sabe de que catálogo a fonte vem.
import type { FonteDaLista } from '@otto/shared';
import { useState } from 'react';
import { fontes as textos } from '../textos/briefing';

export interface PropriedadesDaEscolhaDeFamilia {
  valor: string;
  /** Nulo: o catálogo ainda não respondeu. */
  catalogo: readonly FonteDaLista[] | null;
  aoEscolher(familia: string): void;
  /** Traz a família do catálogo para a biblioteca. Verdadeiro se chegou. */
  trazer(familia: string, peso: number): Promise<boolean>;
  /** O peso pedido ao trazer (qualquer um traz a família inteira). */
  peso?: number;
  /** Oferece "não definida" (a marca sem fonte é um estado válido). */
  permiteVazio?: boolean;
  desativado?: boolean;
  /** O nome acessível, quando não há `<label>` em volta. */
  rotulo?: string;
  id?: string;
}

export function EscolhaDeFamilia({ valor, catalogo, aoEscolher, trazer, peso = 400, permiteVazio = false, desativado = false, rotulo, id }: PropriedadesDaEscolhaDeFamilia) {
  const [baixando, setBaixando] = useState<string | null>(null);
  const [falhou, setFalhou] = useState<string | null>(null);
  /** O que chegou nesta sessão: o catálogo lido ao abrir a tela ainda diz que não está na biblioteca. */
  const [trazidas, setTrazidas] = useState<ReadonlySet<string>>(new Set());

  const naBiblioteca = (f: FonteDaLista) => f.naBiblioteca !== false || trazidas.has(f.familia);
  const daBiblioteca = catalogo?.filter(naBiblioteca) ?? [];
  const doCatalogo = catalogo?.filter((f) => !naBiblioteca(f)) ?? [];
  const conhecida = valor === '' || catalogo?.some((f) => f.familia === valor);

  const escolher = async (familia: string) => {
    setFalhou(null);
    const fonte = catalogo?.find((f) => f.familia === familia);
    if (familia === '' || !fonte || naBiblioteca(fonte)) return aoEscolher(familia);
    setBaixando(familia);
    const chegou = await trazer(familia, peso);
    setBaixando(null);
    if (!chegou) return setFalhou(familia);
    setTrazidas((antes) => new Set(antes).add(familia));
    aoEscolher(familia);
  };

  return (
    <>
      <select
        id={id}
        aria-label={rotulo}
        value={baixando ?? valor}
        disabled={desativado || baixando !== null}
        aria-busy={baixando !== null || undefined}
        onChange={(e) => void escolher(e.target.value)}
      >
        {permiteVazio && <option value="">{textos.semFonte}</option>}
        {!conhecida && <option value={valor}>{catalogo === null ? valor : textos.foraDoCatalogo(valor)}</option>}
        {doCatalogo.length === 0 ? (
          daBiblioteca.map((f) => (
            <option key={f.familia} value={f.familia}>
              {f.familia}
            </option>
          ))
        ) : (
          <>
            <optgroup label={textos.naBiblioteca}>
              {daBiblioteca.map((f) => (
                <option key={f.familia} value={f.familia}>
                  {f.familia}
                </option>
              ))}
            </optgroup>
            <optgroup label={textos.doCatalogo}>
              {doCatalogo.map((f) => (
                <option key={f.familia} value={f.familia}>
                  {f.familia}
                </option>
              ))}
            </optgroup>
          </>
        )}
      </select>
      {baixando !== null && (
        <span role="status" data-baixando-fonte>
          {textos.baixando(baixando)}
        </span>
      )}
      {falhou !== null && <span role="alert">{textos.naoBaixou(falhou)}</span>}
    </>
  );
}
