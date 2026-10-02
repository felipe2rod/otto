'use client';

// A identidade de uma marca numa linha: amostras das cores definidas, as fontes e o logo. Marca sem
// identidade diz isso, em vez de mostrar cor de exemplo (experiencia.md, 3.3).
import type { Marca } from '@otto/shared';
import type { ApiDeArquivos } from '../api/arquivos';
import { marcas as textos, briefing as textosDoBriefing } from '../textos/briefing';
import { PAPEIS_DE_COR } from './dadosDaMarca';
import estilos from './Marcas.module.css';
import { MiniaturaDeArquivo } from './MiniaturaDeArquivo';

export function LogoDaMarca({ marca, arquivos }: { marca: Marca; arquivos: Pick<ApiDeArquivos, 'dados' | 'vetor'> }) {
  return (
    <span className={estilos.logo}>
      {marca.logo ? <MiniaturaDeArquivo arquivo={{ sha256: marca.logo.arquivo }} arquivos={arquivos} alt={textosDoBriefing.marca.logoDa(marca.nome)} /> : <span className={estilos.semLogo} />}
    </span>
  );
}

export function IdentidadeDaMarca({ marca }: { marca: Marca }) {
  const cores = PAPEIS_DE_COR.flatMap((papel) => (marca.cores?.[papel] ? [{ papel, cor: marca.cores[papel] as string }] : []));
  const fontes = textosDoBriefing.marca.resumoDasFontes(marca.fonteDeTitulo ?? '', marca.fonteDeTexto ?? '');
  if (cores.length === 0 && fontes === '') return <span className={estilos.identidade}>{textos.semIdentidade}</span>;
  return (
    <span className={estilos.identidade}>
      {cores.length > 0 && (
        <span className={estilos.cores}>
          {cores.map(({ papel, cor }) => (
            <span
              key={papel}
              data-cor={cor}
              role="img"
              aria-label={`${textos.campos.papeis[papel] ?? papel} ${cor}`}
              title={`${textos.campos.papeis[papel] ?? papel} ${cor}`}
              style={{ background: cor }}
            />
          ))}
        </span>
      )}
      {fontes !== '' && <span>{fontes}</span>}
    </span>
  );
}
