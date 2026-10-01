// Apoio dos testes deste pacote: os recursos de teste do motor (fontes e imagens) na forma que a exportação recebe.
import { canvasKitDeTeste, fontesDeTeste, imagensDeTeste, mascaraDeSujeito, SUJEITO_DA_FOTO } from '@otto/render/apoio-de-teste';
import type { CanvasKit } from 'canvaskit-wasm';
import type { RecursosConhecidos, RecursosDaExportacao } from './exportar';

const ARQUIVO_DA_FONTE: Record<string, string> = {
  'Anton#400': 'Anton-Regular.ttf',
  'IBM Plex Sans#400': 'IBMPlexSans-Regular.ttf',
  'IBM Plex Sans#700': 'IBMPlexSans-Bold.ttf',
  'DM Serif Display#400': 'DMSerifDisplay-Regular.ttf',
};

export async function recursosDeTeste(): Promise<{ ck: CanvasKit; recursos: RecursosDaExportacao; conhecidos: RecursosConhecidos }> {
  const ck = await canvasKitDeTeste();
  const recursos: RecursosDaExportacao = {
    fontes: fontesDeTeste().map((f) => ({ ...f, arquivo: ARQUIVO_DA_FONTE[`${f.familia}#${f.peso}`] as string })),
    imagens: [...imagensDeTeste(), { arquivo: SUJEITO_DA_FOTO, bytes: mascaraDeSujeito(ck) }],
  };
  // o que a API saberia sem abrir arquivo nenhum
  const conhecidos: RecursosConhecidos = {
    fontes: [
      { familia: 'Anton', peso: 400, postScript: 'Anton-Regular', arquivo: 'Anton-Regular.ttf' },
      { familia: 'IBM Plex Sans', peso: 400, postScript: 'IBMPlexSans', arquivo: 'IBMPlexSans-Regular.ttf' },
      { familia: 'IBM Plex Sans', peso: 700, postScript: 'IBMPlexSans-Bold', arquivo: 'IBMPlexSans-Bold.ttf' },
      { familia: 'DM Serif Display', peso: 400, postScript: 'DMSerifDisplay-Regular', arquivo: 'DMSerifDisplay-Regular.ttf' },
    ],
    imagens: [
      { arquivo: imagensDeTeste()[0]?.arquivo as string, tipo: 'image/jpeg' },
      { arquivo: imagensDeTeste()[1]?.arquivo as string, tipo: 'image/png' },
      { arquivo: SUJEITO_DA_FOTO, tipo: 'image/png' },
    ],
  };
  return { ck, recursos, conhecidos };
}
