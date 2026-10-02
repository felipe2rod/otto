'use client';

// Os campos de uma marca (docs/mvp/experiencia.md, 3.3), usados na tela de Marcas e dentro do formulário
// de briefing ("editar" abre os campos ali mesmo). Não há cor nem fonte padrão: campo vazio é "não
// definida", e a direção de arte escolhe. O logo enviado aparece como o Otto o entendeu.
import { type FonteDaLista, ICONES_POR_BRIEFING, TIPOS_DE_IMAGEM } from '@otto/shared';
import { useId, useRef, useState } from 'react';
import type { ApiDeArquivos } from '../api/arquivos';
import type { ApiDeFontes } from '../api/imagens';
import { fraseDoEnvio } from '../editor/envio';
import { EscolhaDeFamilia } from '../fontes/EscolhaDeFamilia';
import formulario from '../produto/Formulario.module.css';
import { marcas as textos } from '../textos/briefing';
import estilos from './CamposDaMarca.module.css';
import { type ArquivoDaMarca, type EstadoDaMarca, PAPEIS_DE_COR, type PapelDeCor } from './dadosDaMarca';
import { MiniaturaDeArquivo } from './MiniaturaDeArquivo';

const COR = /^#[0-9a-fA-F]{6}$/;
const ehSvg = (arquivo: File): boolean => arquivo.type === 'image/svg+xml' || /\.svg$/i.test(arquivo.name);
/** Esvazia o campo de arquivo, para o mesmo arquivo poder ser escolhido de novo. */
const limpar = (entrada: HTMLInputElement | null): void => {
  if (entrada) entrada.value = '';
};
const ehImagem = (arquivo: File): boolean => (TIPOS_DE_IMAGEM as readonly string[]).includes(arquivo.type);

export interface PropriedadesDosCamposDaMarca {
  estado: EstadoDaMarca;
  aoMudar(estado: EstadoDaMarca): void;
  arquivos: ApiDeArquivos;
  /** Nulo: o catálogo ainda não respondeu. */
  catalogo: readonly FonteDaLista[] | null;
  fontes: Pick<ApiDeFontes, 'trazer'>;
  desativado?: boolean;
}

export function CamposDaMarca({ estado, aoMudar, arquivos, catalogo, fontes, desativado = false }: PropriedadesDosCamposDaMarca) {
  const t = textos.campos;
  const [enviando, setEnviando] = useState(0);
  const [recusas, setRecusas] = useState<string[]>([]);
  const logoRef = useRef<HTMLInputElement>(null);
  const iconesRef = useRef<HTMLInputElement>(null);
  const id = useId();
  // o envio é assíncrono: o que chega é somado ao estado mais recente, não ao da hora do clique
  const atual = useRef(estado);
  atual.current = estado;
  const mudar = (parte: Partial<EstadoDaMarca>) => aoMudar({ ...atual.current, ...parte });

  /** Envia um arquivo de logo ou de ícone. SVG vira vetor (com a miniatura do que foi entendido); imagem, só no logo. */
  const enviar = async (arquivo: File, aceitaImagem: boolean): Promise<ArquivoDaMarca | undefined> => {
    if (!(ehSvg(arquivo) || (aceitaImagem && ehImagem(arquivo)))) {
      setRecusas((r) => [...r, fraseDoEnvio(arquivo.name, 'tipo_nao_aceito', undefined)]);
      return undefined;
    }
    setEnviando((n) => n + 1);
    try {
      if (ehSvg(arquivo)) {
        const r = await arquivos.importarSvg(arquivo);
        if (!r.ok) return void setRecusas((lista) => [...lista, fraseDoEnvio(arquivo.name, r.codigo, r.detalhe)]);
        return { sha256: r.no.origem.arquivo, nome: arquivo.name, miniatura: r.miniatura, avisos: r.avisos };
      }
      const r = await arquivos.enviarImagem(arquivo);
      if (!r.ok) return void setRecusas((lista) => [...lista, fraseDoEnvio(arquivo.name, r.codigo, r.detalhe)]);
      return { sha256: r.arquivo.sha256, nome: arquivo.name, imagem: true };
    } finally {
      setEnviando((n) => n - 1);
    }
  };

  const aoEscolherLogo = async (lista: FileList | null) => {
    const arquivo = lista?.[0];
    if (!arquivo) return;
    setRecusas([]);
    const logo = await enviar(arquivo, true);
    if (logo) mudar({ logo });
  };
  const aoEscolherIcones = async (lista: FileList | null) => {
    setRecusas([]);
    for (const arquivo of [...(lista ?? [])]) {
      if (atual.current.icones.length >= ICONES_POR_BRIEFING) break;
      const icone = await enviar(arquivo, false);
      if (icone && !atual.current.icones.some((i) => i.sha256 === icone.sha256)) mudar({ icones: [...atual.current.icones, icone] });
    }
  };

  const cor = (papel: PapelDeCor, valor: string) => mudar({ cores: { ...estado.cores, [papel]: valor } });

  return (
    <div className={estilos.campos}>
      <label className={formulario.campo}>
        <span className={formulario.rotulo}>{t.nome}</span>
        <input type="text" aria-label={t.nome} value={estado.nome} maxLength={120} placeholder={t.nomeExemplo} disabled={desativado} onChange={(e) => mudar({ nome: e.target.value })} />
      </label>
      <label className={formulario.campo}>
        <span className={formulario.rotulo}>{t.site}</span>
        <input
          type="text"
          aria-label={t.site}
          value={estado.site}
          maxLength={300}
          placeholder={t.siteExemplo}
          disabled={desativado}
          aria-describedby={`${id}-site`}
          onChange={(e) => mudar({ site: e.target.value })}
        />
        <span id={`${id}-site`} className={formulario.nota}>
          {t.siteNota}
        </span>
      </label>

      <fieldset className={`${estilos.cores} ${estilos.inteiro}`}>
        <legend className={formulario.rotulo}>{t.cores}</legend>
        {PAPEIS_DE_COR.map((papel) => {
          const valor = estado.cores[papel];
          const definida = COR.test(valor);
          const nome = t.papeis[papel] ?? papel;
          return (
            <div key={papel} className={`${estilos.cor} ${formulario.campo}`}>
              <span>{nome}</span>
              <div className={estilos.amostra}>
                {/* o seletor de cor não tem "vazio": enquanto a cor não é definida ele fica apagado, e o campo ao lado diz */}
                <input
                  type="color"
                  aria-label={t.corDe(nome)}
                  value={definida ? valor.toLowerCase() : '#888888'}
                  data-vazio={definida ? undefined : 'sim'}
                  disabled={desativado}
                  onChange={(e) => cor(papel, e.target.value)}
                />
                <input
                  type="text"
                  aria-label={t.codigoDe(nome)}
                  value={valor}
                  maxLength={7}
                  placeholder={t.naoDefinida}
                  disabled={desativado}
                  spellCheck={false}
                  onChange={(e) => cor(papel, e.target.value.trim())}
                />
                {valor !== '' && (
                  <button type="button" className={estilos.tirar} aria-label={t.tirarCor(nome)} title={t.tirarCor(nome)} disabled={desativado} onClick={() => cor(papel, '')}>
                    <span aria-hidden="true">×</span>
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </fieldset>

      <div className={`${formulario.campo} ${estilos.fonte}`}>
        <label className={formulario.rotulo} htmlFor={`${id}-titulo`}>
          {t.fonteDeTitulo}
        </label>
        <EscolhaDeFamilia
          id={`${id}-titulo`}
          valor={estado.fonteDeTitulo}
          catalogo={catalogo}
          trazer={fontes.trazer}
          peso={700}
          permiteVazio
          desativado={desativado}
          aoEscolher={(f) => mudar({ fonteDeTitulo: f })}
        />
      </div>
      <div className={`${formulario.campo} ${estilos.fonte}`}>
        <label className={formulario.rotulo} htmlFor={`${id}-texto`}>
          {t.fonteDeTexto}
        </label>
        <EscolhaDeFamilia
          id={`${id}-texto`}
          valor={estado.fonteDeTexto}
          catalogo={catalogo}
          trazer={fontes.trazer}
          peso={400}
          permiteVazio
          desativado={desativado}
          aoEscolher={(f) => mudar({ fonteDeTexto: f })}
        />
      </div>

      <div className={formulario.campo}>
        <span className={formulario.rotulo}>{t.logo}</span>
        <div className={estilos.arquivos}>
          {estado.logo && (
            <div className={estilos.arquivo}>
              <MiniaturaDeArquivo arquivo={estado.logo} arquivos={arquivos} alt={t.logoComoEntendi} />
              {estado.logo.nome && <small>{estado.logo.nome}</small>}
              <button type="button" className={estilos.tirar} aria-label={t.tirarLogo} title={t.tirarLogo} disabled={desativado} onClick={() => mudar({ logo: null })}>
                <span aria-hidden="true">×</span>
              </button>
            </div>
          )}
          <input
            ref={logoRef}
            className={estilos.escondido}
            type="file"
            accept=".svg,image/svg+xml,image/png,image/jpeg,image/webp"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(e) => void aoEscolherLogo(e.target.files).then(() => limpar(logoRef.current))}
          />
          <button type="button" className={formulario.botao} disabled={desativado || enviando > 0} onClick={() => logoRef.current?.click()}>
            {enviando > 0 ? t.enviando : estado.logo ? t.trocarLogo : t.enviarLogo}
          </button>
        </div>
        {estado.logo?.avisos && estado.logo.avisos.length > 0 && (
          <p className={formulario.aviso} role="status">
            {t.importadoComAvisos(estado.logo.avisos.join('; '))}
          </p>
        )}
        {estado.logo?.imagem && <p className={formulario.nota}>{t.logoEmImagem}</p>}
      </div>

      <div className={formulario.campo}>
        <span className={formulario.rotulo}>{t.icones}</span>
        <ul className={estilos.arquivos}>
          {estado.icones.map((icone) => (
            <li key={icone.sha256} className={estilos.arquivo}>
              <MiniaturaDeArquivo arquivo={icone} arquivos={arquivos} alt={icone.nome ?? t.iconeSemNome} />
              {icone.nome && <small>{icone.nome}</small>}
              <button
                type="button"
                className={estilos.tirar}
                aria-label={t.tirarIcone(icone.nome ?? t.iconeSemNome)}
                title={t.tirarIcone(icone.nome ?? t.iconeSemNome)}
                disabled={desativado}
                onClick={() => mudar({ icones: estado.icones.filter((i) => i.sha256 !== icone.sha256) })}
              >
                <span aria-hidden="true">×</span>
              </button>
            </li>
          ))}
        </ul>
        <input
          ref={iconesRef}
          className={estilos.escondido}
          type="file"
          accept=".svg,image/svg+xml"
          multiple
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => void aoEscolherIcones(e.target.files).then(() => limpar(iconesRef.current))}
        />
        <div className={formulario.linha}>
          <button type="button" className={formulario.botao} disabled={desativado || enviando > 0 || estado.icones.length >= ICONES_POR_BRIEFING} onClick={() => iconesRef.current?.click()}>
            {t.enviarIcones}
          </button>
          <span className={formulario.nota}>{t.maximoDeIcones(ICONES_POR_BRIEFING)}</span>
        </div>
      </div>

      {recusas.length > 0 && (
        <p className={`${formulario.erro} ${estilos.inteiro}`} role="alert">
          {recusas.join(' ')}
        </p>
      )}

      <label className={`${formulario.campo} ${estilos.inteiro}`}>
        <span className={formulario.rotulo}>{t.rodape}</span>
        <input type="text" aria-label={t.rodape} value={estado.rodape} maxLength={300} placeholder={t.rodapeExemplo} disabled={desativado} onChange={(e) => mudar({ rodape: e.target.value })} />
      </label>
      <label className={`${formulario.campo} ${estilos.inteiro}`}>
        <span className={formulario.rotulo}>{t.restricoes}</span>
        <textarea aria-label={t.restricoes} rows={3} value={estado.restricoes} placeholder={t.restricoesExemplo} disabled={desativado} onChange={(e) => mudar({ restricoes: e.target.value })} />
      </label>
    </div>
  );
}
