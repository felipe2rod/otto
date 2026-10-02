// Escolhe o adaptador do catálogo de fontes pela configuração, uma vez, na subida (ADR 020).
// O catálogo fica guardado no armazenamento da biblioteca do Otto, para não ir à rede a cada processo.
import type { ArmazenamentoDeArquivo } from '../../../arquivo/application/armazenamento-de-arquivo';
import { CHAVE_DO_CATALOGO_DE_FONTES } from '../../../arquivo/application/chave-de-objeto';
import type { Configuracao } from '../../../plataforma/config/configuracao';
import type { CatalogoDeFontes } from '../../application/catalogo-de-fontes';
import { CatalogoGoogleFonts } from './google/catalogo-google-fonts';

/** undefined: sem catálogo; só as fontes semeadas existem. */
export function criarCatalogoDeFontes(qual: Configuracao['catalogoDeFontes'], armazenamento: ArmazenamentoDeArquivo): CatalogoDeFontes | undefined {
  if (qual !== 'google') return undefined;
  return new CatalogoGoogleFonts({
    guardado: {
      ler: () => armazenamento.lerDaBiblioteca(CHAVE_DO_CATALOGO_DE_FONTES),
      guardar: (conteudo) => armazenamento.guardarNaBiblioteca(CHAVE_DO_CATALOGO_DE_FONTES, conteudo, 'application/json'),
    },
  });
}
