'use client';

// Criar ou alterar uma marca: os campos e as ações (salvar, cancelar, apagar). Usado na tela de Marcas
// e dentro do formulário de briefing, onde a marca nasce no primeiro briefing (experiencia.md, 3.3).
import type { FonteDaLista, Marca } from '@otto/shared';
import { useState } from 'react';
import formulario from '../produto/Formulario.module.css';
import type { Servicos } from '../produto/servicos';
import { marcas as textos, briefing as textosDoBriefing } from '../textos/briefing';
import { CamposDaMarca } from './CamposDaMarca';
import { daMarca, type EstadoDaMarca, MARCA_VAZIA, paraDados } from './dadosDaMarca';
import estilos from './Marcas.module.css';

export interface PropriedadesDoEditorDeMarca {
  servicos: Pick<Servicos, 'cadastros' | 'arquivos' | 'fontes'>;
  /** Ausente: marca nova. */
  marca?: Marca | undefined;
  catalogo: readonly FonteDaLista[] | null;
  aoSalvar(marca: Marca): void;
  aoCancelar(): void;
  /** Ausente: não oferece apagar (dentro do formulário de briefing). */
  aoApagar?(id: string): void;
  /** O que está sendo digitado, para quem está em volta poder salvar junto (o formulário, ao enviar). */
  aoDigitar?(estado: EstadoDaMarca): void;
}

export function EditorDeMarca({ servicos, marca, catalogo, aoSalvar, aoCancelar, aoApagar, aoDigitar }: PropriedadesDoEditorDeMarca) {
  const [estado, setEstado] = useState<EstadoDaMarca>(() => (marca ? daMarca(marca) : MARCA_VAZIA));
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [apagando, setApagando] = useState(false);

  const mudar = (novo: EstadoDaMarca) => {
    setEstado(novo);
    aoDigitar?.(novo);
  };

  const salvar = async () => {
    if (estado.nome.trim() === '') return setErro(textos.faltaONome);
    setOcupado(true);
    setErro(null);
    const r = await servicos.cadastros.salvarMarca(paraDados(estado), marca?.id);
    setOcupado(false);
    if (!r.ok) return setErro(textosDoBriefing.erros[r.codigo] ?? textos.naoSalvou);
    aoSalvar(r.marca);
  };

  const apagar = async () => {
    if (!marca || !aoApagar) return;
    setOcupado(true);
    const r = await servicos.cadastros.apagarMarca(marca.id);
    setOcupado(false);
    if (!r.ok) return setErro(textos.naoSalvou);
    aoApagar(marca.id);
  };

  return (
    <div className={estilos.edicao}>
      <CamposDaMarca estado={estado} aoMudar={mudar} arquivos={servicos.arquivos} catalogo={catalogo} fontes={servicos.fontes} desativado={ocupado} />
      {erro && (
        <p className={formulario.erro} role="alert">
          {erro}
        </p>
      )}
      {apagando && marca ? (
        <div className={estilos.rodape}>
          <p className={`${formulario.nota} ${estilos.empurra}`}>{textos.confirmarApagar(marca.nome)}</p>
          <button type="button" className={formulario.botao} disabled={ocupado} onClick={() => setApagando(false)}>
            {textos.cancelar}
          </button>
          <button type="button" className={`${formulario.botao} ${estilos.perigo}`} disabled={ocupado} onClick={() => void apagar()}>
            {textos.apagar}
          </button>
        </div>
      ) : (
        <div className={estilos.rodape}>
          {marca && aoApagar ? (
            <button type="button" className={`${formulario.discreto} ${estilos.empurra} ${estilos.perigo}`} disabled={ocupado} onClick={() => setApagando(true)}>
              {textos.apagar}
            </button>
          ) : (
            <span className={estilos.empurra} />
          )}
          <button type="button" className={formulario.botao} disabled={ocupado} onClick={aoCancelar}>
            {textos.cancelar}
          </button>
          <button type="button" className={formulario.principal} disabled={ocupado} onClick={() => void salvar()}>
            {ocupado ? textos.salvando : textos.salvar}
          </button>
        </div>
      )}
    </div>
  );
}
