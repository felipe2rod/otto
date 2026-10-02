// A guarda do plano: o lado das regras de caráter que não depende de o modelo obedecer (ADR 029, item 3).
//
// Antes de gravar um lote, o ciclo o simula (aplicarLote é puro) e pergunta à guarda se a diferença entre
// o documento de antes e o de depois cabe no plano aprovado:
// - o que já existia quando a tarefa começou só muda se a prancheta estiver no plano;
// - o que já existia só some se a remoção estiver no plano;
// - prancheta nova, só até o número que o plano autoriza;
// - no ajuste pontual: uma prancheta só, sem criar prancheta, sem remover o que já existia.
// O que a própria tarefa criou, ela pode ajustar e remover à vontade.
// Camada bloqueada já é recusada pelo catálogo (@otto/documento), para designer e agente.
//
// É por isso que um texto malicioso num briefing, num nome de camada ou numa imagem não consegue apagar
// o trabalho do designer: mesmo que o modelo caísse, o lote não entra.
import { coresDoNo, type Documento, type No, type Prancheta, todasAsCamadas } from '@otto/documento';
import type { MOTIVOS_DE_RECUSA, Plano } from './contrato';

export type MotivoDeRecusa = (typeof MOTIVOS_DE_RECUSA)[number];
export type Veredito = { ok: true } | { ok: false; motivo: MotivoDeRecusa; mensagem: string };

export interface Guarda {
  /** O lote que leva `antes` a `depois` cabe no plano? Não muda estado. */
  conferir(antes: Documento, depois: Documento): Veredito;
  /** Chame depois de o lote ser gravado: fixa a prancheta do ajuste pontual. */
  registrar(antes: Documento, depois: Documento): void;
  /** Ids das pranchetas que a tarefa criou e que ainda existem no documento dado. */
  criadas(doc: Documento): Set<string>;
  /** Esta camada ou prancheta já existia quando a tarefa começou? */
  jaExistia(id: string): boolean;
}

const usaToken = (p: Prancheta, referencia: string): boolean => p.fundo === referencia || todasAsCamadas(p.filhos).some((n) => coresDoNo(n).includes(referencia));

export function criarGuarda(plano: Plano, docInicial: Documento): Guarda {
  const pranchetasIniciais = new Map(docInicial.pranchetas.map((p) => [p.id, p.nome]));
  const nosIniciais = new Map<string, { nome: string; prancheta: string }>();
  for (const p of docInicial.pranchetas) for (const n of todasAsCamadas(p.filhos)) nosIniciais.set(n.id, { nome: n.nome, prancheta: p.id });

  const remocoes = new Set(plano.remover.map((r) => r.alvo));
  // a prancheta de uma camada a remover também muda: entra na licença
  const licenciadas = new Set([...plano.alterar.map((a) => a.prancheta), ...plano.remover.flatMap((r) => (r.tipo === 'camada' ? [nosIniciais.get(r.alvo)?.prancheta ?? ''] : [])).filter(Boolean)]);
  let pranchetaDoAjuste: string | undefined;

  const nomes = (ids: Iterable<string>) => [...ids].map((id) => `"${pranchetasIniciais.get(id) ?? id}"`).join(', ');
  const oQuePodeAlterar = () => (licenciadas.size ? `O plano deixa alterar: ${nomes(licenciadas)}.` : 'O plano não deixa alterar nada do que já existia.');
  const FIM = 'Nada foi aplicado. Trabalhe dentro do plano e registre em pendencias o que ficou de fora.';
  const FIM_DO_AJUSTE = 'Nada foi aplicado. Se o pedido precisa disso, entregue com uma pendência do tipo "fora_do_ajuste".';

  /** Pranchetas que já existiam e que o lote muda: por objeto trocado, ou por token redefinido que elas usam. */
  function existentesTocadas(antes: Documento, depois: Documento): Set<string> {
    const tocadas = new Set<string>();
    const depoisPorId = new Map(depois.pranchetas.map((p) => [p.id, p]));
    for (const p of antes.pranchetas) {
      if (!pranchetasIniciais.has(p.id)) continue;
      const nova = depoisPorId.get(p.id);
      if (nova && nova !== p) tocadas.add(p.id);
    }
    for (const [nome, valor] of Object.entries(antes.tokens.cores)) {
      if (depois.tokens.cores[nome] === valor) continue;
      for (const p of depois.pranchetas) if (pranchetasIniciais.has(p.id) && usaToken(p, `token:${nome}`)) tocadas.add(p.id);
    }
    return tocadas;
  }

  /** O que já existia e some com o lote: camadas e pranchetas. Grupo desfeito com os filhos no lugar não conta. */
  function removidos(antes: Documento, depois: Documento): { id: string; nome: string; tipo: 'camada' | 'prancheta'; pranchetaRemovida: boolean }[] {
    const pranchetasDepois = new Set(depois.pranchetas.map((p) => p.id));
    const nosDepois = new Set(depois.pranchetas.flatMap((p) => todasAsCamadas(p.filhos).map((n) => n.id)));
    const fora: { id: string; nome: string; tipo: 'camada' | 'prancheta'; pranchetaRemovida: boolean }[] = [];
    for (const p of antes.pranchetas) {
      const pranchetaRemovida = !pranchetasDepois.has(p.id);
      if (pranchetaRemovida && pranchetasIniciais.has(p.id)) fora.push({ id: p.id, nome: p.nome, tipo: 'prancheta', pranchetaRemovida });
      for (const n of todasAsCamadas(p.filhos)) {
        if (!nosIniciais.has(n.id) || nosDepois.has(n.id)) continue;
        const grupoDesfeito = n.tipo === 'grupo' && n.filhos.length > 0 && n.filhos.every((f: No) => nosDepois.has(f.id));
        if (!grupoDesfeito) fora.push({ id: n.id, nome: n.nome, tipo: 'camada', pranchetaRemovida });
      }
    }
    return fora;
  }

  return {
    jaExistia: (id) => pranchetasIniciais.has(id) || nosIniciais.has(id),
    criadas: (doc) => new Set(doc.pranchetas.filter((p) => !pranchetasIniciais.has(p.id)).map((p) => p.id)),

    conferir(antes, depois) {
      const antesIds = new Set(antes.pranchetas.map((p) => p.id));
      const novas = depois.pranchetas.filter((p) => !antesIds.has(p.id));
      const tocadas = existentesTocadas(antes, depois);
      const fora = removidos(antes, depois);

      if (plano.pontual) {
        if (novas.length) return { ok: false, motivo: 'fora_do_ajuste', mensagem: `ajuste pontual não cria prancheta ("${novas[0]?.nome}"). ${FIM_DO_AJUSTE}` };
        if (fora.length) return { ok: false, motivo: 'fora_do_ajuste', mensagem: `ajuste pontual não remove o que já existia ("${fora[0]?.nome}"). ${FIM_DO_AJUSTE}` };
        const alvo = pranchetaDoAjuste ?? (tocadas.size === 1 ? [...tocadas][0] : undefined);
        const outras = [...tocadas].filter((id) => id !== alvo);
        if (outras.length || (tocadas.size > 1 && !pranchetaDoAjuste))
          return {
            ok: false,
            motivo: 'fora_do_ajuste',
            mensagem: `ajuste pontual mexe em uma prancheta só, e este lote muda ${nomes(tocadas)}${pranchetaDoAjuste ? ` (o ajuste já está em ${nomes([pranchetaDoAjuste])})` : ''}. ${FIM_DO_AJUSTE}`,
          };
        return { ok: true };
      }

      const jaCriadas = antes.pranchetas.filter((p) => !pranchetasIniciais.has(p.id)).length;
      if (jaCriadas + novas.length > plano.criar.length)
        return {
          ok: false,
          motivo: 'prancheta_a_mais',
          mensagem: `o plano aprovado autoriza ${plano.criar.length} prancheta(s) nova(s) (${plano.criar.map((f) => f.nome).join(', ') || 'nenhuma'}) e este lote criaria a ${jaCriadas + novas.length}ª ("${novas.at(-1)?.nome}"). ${FIM}`,
        };

      const semLicenca = fora.filter((r) => !remocoes.has(r.id) && !(r.tipo === 'camada' && r.pranchetaRemovida && remocoes.has(nosIniciais.get(r.id)?.prancheta ?? '')));
      if (semLicenca.length)
        return {
          ok: false,
          motivo: 'remocao_sem_plano',
          mensagem: `o lote remove ${semLicenca.map((r) => `${r.tipo === 'prancheta' ? 'a prancheta' : 'a camada'} "${r.nome}"`).join(', ')}, que já existia e não está nas remoções do plano aprovado. ${FIM}`,
        };

      const pranchetasRemovidas = new Set(fora.filter((r) => r.tipo === 'prancheta').map((r) => r.id));
      const foraDoPlano = [...tocadas].filter((id) => !licenciadas.has(id) && !pranchetasRemovidas.has(id));
      if (foraDoPlano.length) return { ok: false, motivo: 'fora_do_plano', mensagem: `o lote altera ${nomes(foraDoPlano)}, que já existia e não está no plano aprovado. ${oQuePodeAlterar()} ${FIM}` };
      return { ok: true };
    },

    registrar(antes, depois) {
      if (!plano.pontual || pranchetaDoAjuste) return;
      const tocadas = existentesTocadas(antes, depois);
      if (tocadas.size === 1) pranchetaDoAjuste = [...tocadas][0];
    },
  };
}
