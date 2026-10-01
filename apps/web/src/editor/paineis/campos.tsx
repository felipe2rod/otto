'use client';

// Campos do painel de propriedades. A regra vem da POC e é a certa: o campo só confirma no Enter
// ou ao sair, e cada confirmação é UM lote. Digitar não manda nada; Esc devolve o valor do documento.
import type { Documento } from '@otto/documento';
import { resolverCor } from '@otto/documento';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { editor as textos } from '../../textos/editor';
import estilos from './PainelDePropriedades.module.css';

const p = textos.propriedades;

/** "12,5" e "12.5" valem 12,5. O que não é número devolve undefined. */
export function lerNumero(texto: string): number | undefined {
  const n = Number(texto.trim().replace(',', '.'));
  return texto.trim() !== '' && Number.isFinite(n) ? n : undefined;
}

/** No máximo duas casas, sem zero à direita. */
export const escreverNumero = (n: number): string => String(Math.round(n * 100) / 100);

export function Campo({
  rotulo,
  valor,
  aoConfirmar,
  desativado,
  largo,
  numerico,
}: {
  rotulo: string;
  valor: string;
  aoConfirmar: (texto: string) => void;
  desativado: boolean;
  largo?: boolean;
  numerico?: boolean;
}) {
  const [rascunho, setRascunho] = useState(valor);
  // o documento mudou por fora (arraste, desfazer, outra confirmação): o campo acompanha
  useEffect(() => setRascunho(valor), [valor]);

  const confirmar = () => {
    if (rascunho === valor) return;
    if (numerico && lerNumero(rascunho) === undefined) return setRascunho(valor);
    aoConfirmar(rascunho);
  };
  return (
    <label className={estilos.campo} data-largo={largo ? 'sim' : undefined}>
      <span>{rotulo}</span>
      <input
        type="text"
        inputMode={numerico ? 'decimal' : 'text'}
        value={rascunho}
        disabled={desativado}
        onChange={(e) => setRascunho(e.target.value)}
        onBlur={confirmar}
        onKeyDown={(e) => {
          if (e.key === 'Enter') confirmar();
          if (e.key === 'Escape') setRascunho(valor);
        }}
      />
    </label>
  );
}

export function TextoLongo({ rotulo, valor, aoConfirmar, desativado }: { rotulo: string; valor: string; aoConfirmar: (texto: string) => void; desativado: boolean }) {
  const [rascunho, setRascunho] = useState(valor);
  useEffect(() => setRascunho(valor), [valor]);
  return (
    <label className={estilos.campo} data-largo="sim">
      <span>{rotulo}</span>
      <textarea
        rows={3}
        value={rascunho}
        disabled={desativado}
        onChange={(e) => setRascunho(e.target.value)}
        onBlur={() => rascunho !== valor && aoConfirmar(rascunho)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) e.currentTarget.blur();
          if (e.key === 'Escape') setRascunho(valor);
        }}
      />
    </label>
  );
}

/**
 * Cor: o seletor do navegador e, ao lado, os tokens da identidade. O seletor confirma quando fecha
 * (evento "change" nativo), não a cada movimento dentro dele: do contrário, arrastar no seletor
 * viraria dezenas de lotes.
 */
export function CampoDeCor({ rotulo, valor, doc, aoConfirmar, desativado }: { rotulo: string; valor: string; doc: Documento; aoConfirmar: (cor: string) => void; desativado: boolean }) {
  const seletor = useRef<HTMLInputElement>(null);
  const confirmar = useRef(aoConfirmar);
  confirmar.current = aoConfirmar;
  const resolvida = resolverCor(doc, valor).toLowerCase();

  useEffect(() => {
    const el = seletor.current;
    if (!el) return;
    const aoFechar = () => confirmar.current(el.value);
    el.addEventListener('change', aoFechar);
    return () => el.removeEventListener('change', aoFechar);
  }, []);
  // o valor é escrito direto no elemento: como campo "não controlado", o React não briga com o seletor aberto
  useEffect(() => {
    if (seletor.current) seletor.current.value = resolvida;
  }, [resolvida]);

  const ehToken = valor.startsWith('token:');
  return (
    <div className={estilos.campo} data-largo="sim">
      <span>{rotulo}</span>
      <div className={estilos.cor}>
        <input ref={seletor} type="color" defaultValue={resolvida} disabled={desativado} aria-label={p.seletorDeCor(rotulo)} />
        <select value={ehToken ? valor : ''} disabled={desativado} aria-label={p.seletorDeToken(rotulo)} onChange={(e) => e.target.value && aoConfirmar(e.target.value)}>
          <option value="">{ehToken ? '' : p.corSolta(valor)}</option>
          {Object.entries(doc.tokens.cores).map(([nome, cor]) => (
            <option key={nome} value={`token:${nome}`}>
              {p.token(nome, cor)}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

export function Grupo({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <fieldset className={estilos.grupo}>
      <legend>{titulo}</legend>
      <div className={estilos.grade}>{children}</div>
    </fieldset>
  );
}
