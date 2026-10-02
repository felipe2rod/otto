// Barra de ferramentas: três ferramentas e duas ações (inserir arquivo, buscar imagem). É pouco e é honesto: não há ferramenta de texto que não cria
// texto. A barra existe para as próximas entrarem no lugar esperado (experiencia.md, 4.1).
import { imagens as textosDeImagens } from '../../textos/briefing';
import { editor as textos } from '../../textos/editor';
import { useArmazem } from '../nucleo/armazem';
import type { Ferramenta, Interface } from '../nucleo/interface';
import estilos from './BarraDeFerramentas.module.css';

const FERRAMENTAS: readonly Ferramenta[] = ['mover', 'mao', 'zoom'];

/** O que o seletor de arquivo oferece. A API confere o conteúdo: a extensão aqui é só conveniência. */
const ACEITA = 'image/png,image/jpeg,image/webp,image/svg+xml,.svg';

export function BarraDeFerramentas({
  interface: iface,
  podeInserir = false,
  aoInserir,
  aoBuscarImagem,
}: {
  interface: Interface;
  podeInserir?: boolean;
  aoInserir?: (arquivos: File[]) => void;
  /** Abre a busca no banco de imagens. Ausente: o editor não tem banco (a bancada), e o botão não existe. */
  aoBuscarImagem?: (() => void) | undefined;
}) {
  const ativa = useArmazem(iface.armazem, (e) => e.ferramenta);
  return (
    <div className={estilos.barra} role="toolbar" aria-label={textos.ferramentas.rotulo} aria-orientation="vertical">
      {FERRAMENTAS.map((ferramenta) => {
        const { nome, tecla } = textos.ferramentas[ferramenta];
        const rotulo = textos.ferramentas.comTecla(nome, tecla);
        return (
          <button
            key={ferramenta}
            type="button"
            className={estilos.ferramenta}
            aria-label={rotulo}
            title={rotulo}
            aria-pressed={ativa === ferramenta}
            onClick={() => iface.escolherFerramenta(ferramenta)}
          >
            <span aria-hidden="true">{tecla}</span>
          </button>
        );
      })}
      <span className={estilos.divisor} aria-hidden="true" />
      {/* Inserir não é ferramenta (não muda o que o clique no canvas faz): é uma ação, e fica separada */}
      <label className={estilos.inserir} title={textos.ferramentas.inserir} data-desligado={podeInserir ? undefined : 'sim'}>
        <span aria-hidden="true">+</span>
        <input
          type="file"
          multiple
          accept={ACEITA}
          disabled={!podeInserir}
          aria-label={textos.ferramentas.inserir}
          onChange={(e) => {
            const arquivos = [...(e.target.files ?? [])];
            // limpa o campo: escolher o mesmo arquivo de novo precisa disparar outra vez
            e.target.value = '';
            if (arquivos.length > 0) aoInserir?.(arquivos);
          }}
        />
      </label>
      {aoBuscarImagem && (
        <button type="button" className={estilos.ferramenta} aria-label={textosDeImagens.abrir} title={textosDeImagens.abrir} disabled={!podeInserir} data-abre-imagens onClick={aoBuscarImagem}>
          <span aria-hidden="true">⌕</span>
        </button>
      )}
    </div>
  );
}
