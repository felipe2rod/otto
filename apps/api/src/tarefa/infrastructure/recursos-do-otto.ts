// Liga as portas opcionais do ciclo do Otto aos casos de uso dos outros módulos. É o MESMO caminho do editor
// (ADR 032, item 5: o agente e a pessoa usam o mesmo caminho): mesma busca com cache, mesmo `trazer` com a
// origem guardada, mesmos limites por conta. O que muda é a origem registrada no evento de uso ("otto").
import type { CasosDeUsoDeFontes } from '../../biblioteca/application/casos-de-uso-de-fontes';
import type { CasosDeUsoDeImagens } from '../../imagem/application/casos-de-uso-de-imagens';
import type { FontesDoOtto, ImagensDoOtto } from '../application/recursos-do-otto';

export function imagensDoOtto(imagens: CasosDeUsoDeImagens): ImagensDoOtto {
  return {
    async buscar(escopo, consulta, orientacao) {
      const r = await imagens.buscar(escopo, { consulta, orientacao }, 'otto');
      return { banco: r.banco.id, itens: r.itens.map((i) => ({ id: i.id, descricao: i.descricao, largura: i.largura, altura: i.altura, autor: i.autor })) };
    },
    async trazer(escopo, banco, id) {
      const t = await imagens.trazer(escopo, { banco, id }, 'otto');
      return { sha256: t.sha256, largura: t.largura, altura: t.altura, no: t.no };
    },
  };
}

export function fontesDoOtto(fontes: CasosDeUsoDeFontes): FontesDoOtto {
  return { buscar: (consulta, categoria) => fontes.buscarNoCatalogo(consulta, categoria) };
}
