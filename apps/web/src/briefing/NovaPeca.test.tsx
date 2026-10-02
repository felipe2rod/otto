// @vitest-environment jsdom
// O formulário de briefing (docs/mvp/experiencia.md, 3.4), com os serviços trocados por mentiras.
import { FormularioDeBriefing, PedidoDeTarefaPorBriefing, type ResultadoDaBuscaDeImagens } from '@otto/shared';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CAFE, ID_DA_MARCA, ID_DA_PECA, ID_DO_BRIEFING, LIMITES, QUANDO, SHA, SHB, servicosDeMentira } from '../marcas/apoioDeTeste';
import { briefing as textos, imagens as textosDeImagens, marcas as textosDeMarcas } from '../textos/briefing';
import { erros } from '../textos/erros';
import { ESTADO_VAZIO, lerRascunhoLocal } from './formulario';
import { NovaPeca, type OrigemDoFormulario } from './NovaPeca';

afterEach(cleanup);

function guardaDeTeste(inicial?: object) {
  const dados = new Map<string, string>();
  if (inicial) dados.set('otto.briefing.rascunho.v1', JSON.stringify(inicial));
  return { getItem: (k: string) => dados.get(k) ?? null, setItem: (k: string, v: string) => void dados.set(k, v), removeItem: (k: string) => void dados.delete(k), dados };
}

async function montar(opcoes: { servicos?: Parameters<typeof servicosDeMentira>; origem?: OrigemDoFormulario; rascunho?: object } = {}) {
  const m = servicosDeMentira(...(opcoes.servicos ?? []));
  const irPara = vi.fn();
  const guarda = guardaDeTeste(opcoes.rascunho);
  render(<NovaPeca servicos={m.servicos} irPara={irPara} guarda={guarda} origem={opcoes.origem ?? {}} />);
  await screen.findByRole('form', { name: textos.titulo });
  await act(async () => undefined);
  return { ...m, irPara, guarda };
}

const campo = (nome: string | RegExp) => screen.getByRole('textbox', { name: nome }) as HTMLInputElement;
const titulo = () => campo(new RegExp(`^${textos.campos.titulo}`));
const criar = () => screen.getByRole('button', { name: new RegExp(`^${textos.rodape.criar}`) }) as HTMLButtonElement;
const formato = (nome: string) => screen.getByRole('button', { name: new RegExp(`^${nome} \\d`) }) as HTMLButtonElement;
const fonteDasImagens = (qual: string) => screen.getByRole('radio', { name: textos.imagens.fontes[qual] as string }) as HTMLInputElement;
const situacao = () => document.querySelector('[data-falta]');
const pedidoFeito = (tarefas: Awaited<ReturnType<typeof montar>>['tarefas']) =>
  (tarefas.pedir.mock.calls[0] as unknown[] | undefined)?.[0] as { briefing: Record<string, unknown>; cuidado: string; briefingId?: string };

/** O mínimo para o botão acender: título, um formato e "sem imagem". */
function preencherOMinimo() {
  fireEvent.change(titulo(), { target: { value: 'Abrimos às 7h' } });
  fireEvent.click(formato('Feed'));
  fireEvent.click(fonteDasImagens('nenhuma'));
}

describe('nova peça: o que falta e o envio', () => {
  it('vazio: o botão fica desativado e a tela diz o que falta; "minhas imagens" vem marcado e o cuidado é o cuidadoso', async () => {
    await montar();
    expect(criar().disabled).toBe(true);
    expect(situacao()?.textContent).toBe([textos.rodape.faltas.titulo, textos.rodape.faltas.formato, textos.rodape.faltas.imagem].join(' '));
    expect(fonteDasImagens('minhas').checked).toBe(true);
    expect((screen.getByRole('radio', { name: new RegExp(`^${textos.cuidado.opcoes.cuidadoso}`), hidden: true }) as HTMLInputElement).checked).toBe(true);
    expect(screen.getAllByRole('radio', { name: new RegExp(Object.values(textos.cuidado.opcoes).join('|')), hidden: true })).toHaveLength(3);
  });

  it('com título, formato e a imagem resolvida: cria a peça com o nome do título, pede a tarefa com o formulário e abre o editor', async () => {
    const { pecas, tarefas, irPara, servicos, guarda } = await montar();
    preencherOMinimo();
    expect(situacao()).toBeNull();
    expect(criar().disabled).toBe(false);
    await act(async () => fireEvent.click(criar()));

    expect(pecas.criar).toHaveBeenCalledWith('Abrimos às 7h');
    expect(servicos.tarefas).toHaveBeenLastCalledWith(ID_DA_PECA);
    const pedido = pedidoFeito(tarefas);
    expect(pedido).toEqual({
      tipo: 'briefing',
      cuidado: 'cuidadoso',
      briefing: { versao: 1, formatos: [{ nome: 'Feed', largura: 1080, altura: 1350 }], textos: { titulo: 'Abrimos às 7h' }, imagens: { fonte: 'nenhuma' } },
    });
    // é o que o servidor aceita: o formulário é fechado
    expect(PedidoDeTarefaPorBriefing.safeParse(pedido).success).toBe(true);
    expect(irPara).toHaveBeenCalledWith(`/editor/p/${ID_DA_PECA}`);
    expect(guarda.dados.size).toBe(0);
  });

  it('no máximo três formatos: o quarto fica desativado, e o rodapé conta', async () => {
    await montar();
    for (const nome of ['Feed', 'Quadrado', 'Story']) fireEvent.click(formato(nome));
    expect(formato('Banner').disabled).toBe(true);
    expect(formato('Story').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText(textos.rodape.formatos(3))).toBeDefined();
    fireEvent.click(formato('Story'));
    expect(formato('Banner').disabled).toBe(false);
  });

  it('formato próprio entra com nome e medidas, e sai com um clique', async () => {
    const { tarefas } = await montar();
    preencherOMinimo();
    fireEvent.change(campo(textos.formatos.nomeDoOutro), { target: { value: 'Faixa' } });
    fireEvent.change(screen.getByRole('spinbutton', { name: textos.formatos.largura, hidden: true }), { target: { value: '2000' } });
    fireEvent.change(screen.getByRole('spinbutton', { name: textos.formatos.altura, hidden: true }), { target: { value: '500' } });
    fireEvent.click(screen.getByRole('button', { name: textos.formatos.adicionar, hidden: true }));
    await act(async () => fireEvent.click(criar()));
    expect(pedidoFeito(tarefas).briefing.formatos).toEqual([
      { nome: 'Feed', largura: 1080, altura: 1350 },
      { nome: 'Faixa', largura: 2000, altura: 500 },
    ]);
  });

  it('o briefing não chegou: a tela diz que nada se perdeu, e tentar de novo usa a MESMA peça', async () => {
    let vez = 0;
    const { pecas, tarefas, irPara, guarda } = await montar({
      servicos: [{ tarefas: { pedir: vi.fn(async () => (++vez === 1 ? { ok: false as const, codigo: 'erro_interno' } : { ok: true as const, tarefa: {} as never })) } }],
    });
    preencherOMinimo();
    await act(async () => fireEvent.click(criar()));
    expect(screen.getByRole('alert').textContent).toBe(textos.erros.padrao);
    expect(irPara).not.toHaveBeenCalled();
    expect(lerRascunhoLocal(guarda)?.titulo).toBe('Abrimos às 7h');

    await act(async () => fireEvent.click(criar()));
    expect(pecas.criar).toHaveBeenCalledTimes(1);
    expect(tarefas.pedir).toHaveBeenCalledTimes(2);
    expect(irPara).toHaveBeenCalledWith(`/editor/p/${ID_DA_PECA}`);
  });

  it('recusa com código conhecido tem a frase dela (marca apagada, limite do dia); o código nunca aparece', async () => {
    const { tarefas } = await montar({ servicos: [{ tarefas: { pedir: vi.fn(async () => ({ ok: false as const, codigo: 'marca_desconhecida' })) } }] });
    preencherOMinimo();
    await act(async () => fireEvent.click(criar()));
    expect(screen.getByRole('alert').textContent).toBe(textos.erros.marca_desconhecida);
    tarefas.pedir.mockResolvedValueOnce({ ok: false as const, codigo: 'limite_diario' });
    await act(async () => fireEvent.click(criar()));
    expect(screen.getByRole('alert').textContent).toBe(erros.doCodigo('limite_diario'));
  });

  it('limite do dia atingido: diz antes do clique, e o rascunho fica; com tarefa na fila, o botão avisa que entra na fila', async () => {
    await montar({ servicos: [{ tarefas: { limites: vi.fn(async () => ({ ...LIMITES, podeEnviar: false, motivo: 'limite_da_conta' as const })) } }] });
    preencherOMinimo();
    expect(criar().disabled).toBe(true);
    expect(situacao()?.textContent).toBe(textos.rodape.semLimite.limite_da_conta);
    cleanup();
    await montar({ servicos: [{ tarefas: { limites: vi.fn(async () => ({ ...LIMITES, naFila: 1 })) } }] });
    expect(screen.getByRole('button', { name: textos.rodape.criarNaFila })).toBeDefined();
  });

  it('a peça em branco continua existindo, em segundo plano: cria sem tarefa e abre o editor', async () => {
    const { pecas, tarefas, irPara } = await montar();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: textos.rodape.emBranco })));
    expect(pecas.criar).toHaveBeenCalledWith();
    expect(tarefas.pedir).not.toHaveBeenCalled();
    expect(irPara).toHaveBeenCalledWith(`/editor/p/${ID_DA_PECA}`);
  });
});

describe('nova peça: a marca', () => {
  it('sem marca, a tela diz que o Otto escolhe; nenhuma identidade vai no pedido', async () => {
    const { tarefas } = await montar({ servicos: [{}, { marcas: [CAFE] }] });
    expect(screen.getByText(textos.marca.semMarcaExplica)).toBeDefined();
    preencherOMinimo();
    await act(async () => fireEvent.click(criar()));
    expect(pedidoFeito(tarefas).briefing).not.toHaveProperty('identidade');
    expect(pedidoFeito(tarefas).briefing).not.toHaveProperty('marcaId');
  });

  it('escolhida a marca: a identidade aparece numa linha, o rodapé e as restrições dela são mostrados, e o pedido leva só o id', async () => {
    const { tarefas } = await montar({ servicos: [{}, { marcas: [CAFE] }] });
    fireEvent.change(screen.getByRole('combobox', { name: textos.marca.rotulo }), { target: { value: ID_DA_MARCA } });
    const resumo = document.querySelector('[data-resumo-da-marca]') as HTMLElement;
    expect(resumo.querySelectorAll('[data-cor]')).toHaveLength(2);
    expect(resumo.textContent).toContain('DM Serif Display');
    expect(campo(textos.campos.rodape).placeholder).toBe(textos.campos.rodapeDaMarca('@cafeaurora'));
    expect(document.querySelector('[data-restricoes-da-marca]')?.textContent).toContain('nunca foto de pessoa');

    preencherOMinimo();
    await act(async () => fireEvent.click(criar()));
    const { briefing } = pedidoFeito(tarefas);
    expect(briefing.marcaId).toBe(ID_DA_MARCA);
    // o servidor completa com o que a marca tem: o formulário não repete
    for (const chave of ['identidade', 'logo', 'icones', 'restricoes']) expect(briefing).not.toHaveProperty(chave);
    expect(briefing.textos).toEqual({ titulo: 'Abrimos às 7h' });
  });

  it('?marca= abre o formulário com a marca escolhida; marca que não existe mais é ignorada', async () => {
    await montar({ servicos: [{}, { marcas: [CAFE] }], origem: { marcaId: ID_DA_MARCA } });
    expect((screen.getByRole('combobox', { name: textos.marca.rotulo }) as HTMLSelectElement).value).toBe(ID_DA_MARCA);
    cleanup();
    await montar({ origem: { marcaId: ID_DA_MARCA } });
    expect((screen.getByRole('combobox', { name: textos.marca.rotulo }) as HTMLSelectElement).value).toBe('');
  });

  it('a marca nasce dentro do primeiro briefing: "nova marca" abre os campos, e ela é salva junto ao criar a peça', async () => {
    const { cadastros, tarefas } = await montar();
    fireEvent.change(screen.getByRole('combobox', { name: textos.marca.rotulo }), { target: { value: 'nova' } });
    fireEvent.change(campo(textosDeMarcas.campos.nome), { target: { value: 'Padaria Sol' } });
    fireEvent.change(campo(textosDeMarcas.campos.rodape), { target: { value: '@padariasol' } });
    preencherOMinimo();
    await act(async () => fireEvent.click(criar()));
    expect(cadastros.salvarMarca).toHaveBeenCalledWith({ nome: 'Padaria Sol', rodape: '@padariasol' });
    const salva = (await cadastros.salvarMarca.mock.results[0]?.value) as { marca: { id: string } };
    expect(pedidoFeito(tarefas).briefing.marcaId).toBe(salva.marca.id);
  });

  it('"editar a marca" abre os campos ali mesmo e salva a marca, sem sair do formulário', async () => {
    const { cadastros } = await montar({ servicos: [{}, { marcas: [CAFE] }], origem: { marcaId: ID_DA_MARCA } });
    fireEvent.change(titulo(), { target: { value: 'Abrimos às 7h' } });
    fireEvent.click(screen.getByRole('button', { name: textos.marca.editar }));
    fireEvent.change(campo(textosDeMarcas.campos.rodape), { target: { value: '@aurora' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: textosDeMarcas.salvar })));
    expect(cadastros.salvarMarca).toHaveBeenCalledWith(expect.objectContaining({ nome: 'Café Aurora', rodape: '@aurora' }), ID_DA_MARCA);
    expect(campo(textos.campos.rodape).placeholder).toBe(textos.campos.rodapeDaMarca('@aurora'));
    expect(titulo().value).toBe('Abrimos às 7h');
  });
});

describe('nova peça: imagens', () => {
  const foto = (nome = 'foto.jpg', tipo = 'image/jpeg') => new File([new Uint8Array(10)], nome, { type: tipo });
  const enviar = async (...arquivos: File[]) => act(async () => fireEvent.change(document.querySelector('[data-enviar-fotos]') as HTMLInputElement, { target: { files: arquivos } }));
  const fotos = () => within(screen.getByRole('list', { name: textos.imagens.lista })).getAllByRole('listitem');

  it('foto enviada mostra as medidas e vai no pedido pelo hash', async () => {
    const { tarefas, arquivos } = await montar();
    fireEvent.change(titulo(), { target: { value: 'Abrimos às 7h' } });
    fireEvent.click(formato('Banner'));
    expect(situacao()?.textContent).toBe(textos.rodape.faltas.imagem);
    await enviar(foto());
    expect(arquivos.enviarImagem).toHaveBeenCalledTimes(1);
    expect(fotos()[0]?.querySelector('[data-medidas]')?.textContent).toBe(textos.imagens.medidas(800, 600));
    await act(async () => fireEvent.click(criar()));
    expect(pedidoFeito(tarefas).briefing.imagens).toEqual({ fonte: 'minhas', arquivos: [SHB] });
  });

  it('foto pequena para o formato: diz quanto será ampliada em cada formato, com o mesmo número do servidor, e NÃO bloqueia', async () => {
    await montar();
    fireEvent.change(titulo(), { target: { value: 'Abrimos às 7h' } });
    fireEvent.click(formato('Story'));
    await enviar(foto());
    // 800×600 para cobrir 1080×1920: 1920/600 = 3,2
    const aviso = () => fotos()[0]?.querySelector('[data-ampliacao]')?.textContent ?? '';
    expect(aviso()).toContain(textos.imagens.ampliada('Story', 3.2));
    expect(aviso()).toContain('320%');
    expect(criar().disabled).toBe(false);
    // com outro formato, o aviso lista os dois
    fireEvent.click(formato('Feed'));
    expect(aviso()).toContain('Story 320%');
    expect(aviso()).toContain('Feed 225%');
  });

  it('foto grande o bastante não ganha aviso', async () => {
    await montar({ servicos: [{ arquivos: { enviarImagem: vi.fn(async () => ({ ok: true as const, arquivo: { sha256: SHB, largura: 4000, altura: 5000 } })) } }] });
    fireEvent.click(formato('Feed'));
    await enviar(foto());
    expect(fotos()[0]?.querySelector('[data-ampliacao]')).toBeNull();
  });

  it('enquanto a foto envia, o botão de criar espera; se não enviou, a foto diz, oferece tentar de novo, e as outras ficam', async () => {
    let chegar: ((r: { ok: false; codigo: string }) => void) | undefined;
    let vez = 0;
    const enviarImagem = vi.fn(() =>
      ++vez === 1 ? Promise.resolve({ ok: true as const, arquivo: { sha256: SHA, largura: 3000, altura: 4000 } }) : new Promise<{ ok: false; codigo: string }>((seguir) => (chegar = seguir)),
    );
    await montar({ servicos: [{ arquivos: { enviarImagem } }] });
    fireEvent.change(titulo(), { target: { value: 'Abrimos às 7h' } });
    fireEvent.click(formato('Feed'));
    await enviar(foto('a.jpg'), foto('b.jpg'));
    expect(situacao()?.textContent).toBe(textos.rodape.faltas.enviando);
    expect(criar().disabled).toBe(true);

    await act(async () => chegar?.({ ok: false, codigo: 'sem_conexao' }));
    expect(fotos()).toHaveLength(2);
    expect(fotos()[1]?.getAttribute('data-estado')).toBe('falhou');
    expect(criar().disabled).toBe(false);
    enviarImagem.mockResolvedValueOnce({ ok: true, arquivo: { sha256: SHB, largura: 3000, altura: 4000 } });
    await act(async () => fireEvent.click(within(fotos()[1] as HTMLElement).getByRole('button', { name: textos.imagens.tentarDeNovo })));
    expect(fotos().map((f) => f.getAttribute('data-estado'))).toEqual(['enviada', 'enviada']);
  });

  it('arquivo que não é imagem aceita é recusado sem ir ao servidor', async () => {
    const { arquivos } = await montar();
    await enviar(foto('contrato.pdf', 'application/pdf'));
    expect(arquivos.enviarImagem).not.toHaveBeenCalled();
    expect(within(fotos()[0] as HTMLElement).getByRole('alert').textContent).toContain('contrato.pdf');
    expect(within(fotos()[0] as HTMLElement).queryByRole('button', { name: textos.imagens.tentarDeNovo })).toBeNull();
  });

  it('buscar no banco, dentro do formulário: a imagem escolhida entra nas fotos com a origem e o autor, e vai pelo hash', async () => {
    const resultado: ResultadoDaBuscaDeImagens = {
      banco: { id: 'banco-de-teste', nome: 'Banco de Teste', licenca: 'Licença livre', ladoMaximo: 1280 },
      itens: [
        {
          banco: 'banco-de-teste',
          id: '42',
          descricao: 'pão, padaria',
          largura: 853,
          altura: 1280,
          autor: 'Fulana',
          pagina: 'https://exemplo.test/42',
          previa: '/api/imagens/banco-de-teste/42/previa',
        },
      ],
    };
    const origem = { banco: 'Banco de Teste', autor: 'Fulana', licenca: 'Licença livre', pagina: 'https://exemplo.test/42' };
    const trazida = {
      sha256: SHA,
      tipo: 'image/jpeg' as const,
      largura: 853,
      altura: 1280,
      bytes: 10,
      origem,
      no: { tipo: 'imagem' as const, arquivo: SHA, larguraOriginal: 853, alturaOriginal: 1280 },
    };
    const { tarefas, pecas } = await montar({
      servicos: [{ imagens: { buscar: vi.fn(async () => ({ ok: true as const, resultado })), trazer: vi.fn(async () => ({ ok: true as const, imagem: trazida })) } }],
    });
    fireEvent.change(titulo(), { target: { value: 'Pão quente' } });
    fireEvent.click(formato('Story'));
    fireEvent.click(screen.getByRole('button', { name: textos.imagens.buscar }));
    fireEvent.change(screen.getByRole('searchbox', { name: textosDeImagens.campo }), { target: { value: 'padaria' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: textosDeImagens.buscar })));
    // buscar não envia o formulário
    expect(pecas.criar).not.toHaveBeenCalled();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: textosDeImagens.trazerEsta('Fulana') })));

    expect(fotos()[0]?.querySelector('[data-origem]')?.textContent).toBe(textos.imagens.origem('Banco de Teste', 'Fulana'));
    // a foto do banco chega pequena: o aviso de ampliação vale para ela também
    expect(fotos()[0]?.querySelector('[data-ampliacao]')?.textContent).toContain('150%');
    await act(async () => fireEvent.click(criar()));
    expect(pedidoFeito(tarefas).briefing.imagens).toEqual({ fonte: 'minhas', arquivos: [SHA] });
  });

  it('"o Otto busca": os termos vão como sugestão; com objetivo de vender, a tela avisa que banco raramente tem o produto', async () => {
    const { tarefas } = await montar();
    preencherOMinimo();
    fireEvent.click(fonteDasImagens('banco'));
    expect(document.querySelector('[data-aviso-de-produto]')).toBeNull();
    fireEvent.change(screen.getByRole('combobox', { name: textos.campos.objetivo }), { target: { value: 'vender' } });
    expect(document.querySelector('[data-aviso-de-produto]')).not.toBeNull();
    fireEvent.change(campo(textos.imagens.termos), { target: { value: 'xícara' } });
    await act(async () => fireEvent.click(criar()));
    expect(pedidoFeito(tarefas).briefing).toMatchObject({ objetivo: 'vender', imagens: { fonte: 'banco', termos: 'xícara' } });
  });
});

describe('nova peça: rascunho, briefing salvo e reuso', () => {
  it('o que é digitado fica guardado neste navegador, e volta ao reabrir, com o aviso e o caminho para começar em branco', async () => {
    const primeiro = await montar();
    fireEvent.change(titulo(), { target: { value: 'Abrimos às 7h' } });
    fireEvent.click(formato('Feed'));
    const guardado = lerRascunhoLocal(primeiro.guarda);
    expect(guardado).toMatchObject({ titulo: 'Abrimos às 7h', formatos: [{ nome: 'Feed' }] });
    cleanup();

    const { guarda } = await montar({ rascunho: guardado as object });
    expect(titulo().value).toBe('Abrimos às 7h');
    expect(formato('Feed').getAttribute('aria-pressed')).toBe('true');
    expect(document.querySelector('[data-rascunho-recuperado]')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: textos.rascunho.limpar }));
    expect(titulo().value).toBe('');
    expect(guarda.dados.size).toBe(0);
  });

  it('abrir sem mexer não grava rascunho (um briefing salvo aberto não vira rascunho por conta própria)', async () => {
    const { guarda } = await montar();
    expect(guarda.dados.size).toBe(0);
  });

  const SALVO = {
    id: ID_DO_BRIEFING,
    nome: 'Avisos do café',
    dados: { versao: 1 as const, marcaId: ID_DA_MARCA, formatos: [{ nome: 'Feed', largura: 1080, altura: 1350 }], imagens: { fonte: 'nenhuma' as const } },
    cuidado: 'autoral' as const,
    usos: 3,
    criadoEm: QUANDO,
    alteradoEm: QUANDO,
  };
  const comSalvo = { cadastros: { briefings: vi.fn(async () => [{ id: ID_DO_BRIEFING, nome: 'Avisos do café', usos: 3, alteradoEm: QUANDO }]), briefing: vi.fn(async () => SALVO) } };

  it('?briefing= abre o formulário com o que o briefing salvo tem; só falta o título, e o pedido conta o uso', async () => {
    const { tarefas } = await montar({ servicos: [comSalvo, { marcas: [CAFE] }], origem: { briefingId: ID_DO_BRIEFING }, rascunho: { ...ESTADO_VAZIO, titulo: 'rascunho antigo' } });
    expect(titulo().value).toBe('');
    expect(formato('Feed').getAttribute('aria-pressed')).toBe('true');
    expect((screen.getByRole('combobox', { name: textos.marca.rotulo }) as HTMLSelectElement).value).toBe(ID_DA_MARCA);
    expect(situacao()?.textContent).toBe(textos.rodape.faltas.titulo);
    fireEvent.change(titulo(), { target: { value: 'Fechado no feriado' } });
    await act(async () => fireEvent.click(criar()));
    expect(pedidoFeito(tarefas)).toMatchObject({ briefingId: ID_DO_BRIEFING, cuidado: 'autoral', briefing: { marcaId: ID_DA_MARCA } });
  });

  it('"começar de" lista os salvos e carrega o escolhido', async () => {
    const { cadastros } = await montar({ servicos: [comSalvo, { marcas: [CAFE] }] });
    const partida = screen.getByRole('combobox', { name: textos.comecarDe.rotulo });
    expect(within(partida).getByRole('option', { name: textos.comecarDe.salvo('Avisos do café', 3) })).toBeDefined();
    await act(async () => fireEvent.change(partida, { target: { value: ID_DO_BRIEFING } }));
    expect(cadastros.briefing).toHaveBeenCalledWith(ID_DO_BRIEFING);
    expect(formato('Feed').getAttribute('aria-pressed')).toBe('true');
    expect(fonteDasImagens('nenhuma').checked).toBe(true);
  });

  it('"salvar como briefing" pede um nome e guarda o formulário pela metade (sem título já vale)', async () => {
    const { cadastros } = await montar({ servicos: [{}, { marcas: [CAFE] }], origem: { marcaId: ID_DA_MARCA } });
    fireEvent.click(formato('Story'));
    fireEvent.click(screen.getByRole('button', { name: textos.rodape.salvar }));
    fireEvent.change(campo(textos.rodape.nomeDoBriefing), { target: { value: 'Stories do café' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: textos.rodape.salvarComEsteNome })));
    expect(cadastros.salvarBriefing).toHaveBeenCalledWith(
      {
        nome: 'Stories do café',
        cuidado: 'cuidadoso',
        dados: { versao: 1, marcaId: ID_DA_MARCA, formatos: [{ nome: 'Story', largura: 1080, altura: 1920 }], imagens: { fonte: 'minhas', arquivos: [] } },
      },
      undefined,
    );
    expect(screen.getByText(textos.rodape.salvo('Stories do café'))).toBeDefined();
    expect(within(screen.getByRole('combobox', { name: textos.comecarDe.rotulo })).getByRole('option', { name: textos.comecarDe.salvo('Stories do café', 0) })).toBeDefined();
  });

  it('apagar um briefing salvo tira ele da lista', async () => {
    const { cadastros } = await montar({ servicos: [comSalvo] });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: textos.comecarDe.apagar('Avisos do café'), hidden: true })));
    expect(cadastros.apagarBriefing).toHaveBeenCalledWith(ID_DO_BRIEFING);
    expect(within(screen.getByRole('combobox', { name: textos.comecarDe.rotulo })).queryByRole('option', { name: /Avisos do café/ })).toBeNull();
  });

  it('?peca= ("nova peça com este briefing") abre o briefing que gerou a peça; o que veio da marca não é repetido', async () => {
    const daTarefa = FormularioDeBriefing.parse({
      versao: 1,
      marcaId: ID_DA_MARCA,
      formatos: [{ nome: 'Feed', largura: 1080, altura: 1350 }],
      textos: { titulo: 'Abrimos às 7h', rodape: '@cafeaurora' },
      imagens: { fonte: 'nenhuma' },
      identidade: { cores: { primaria: '#0f3b2c' } },
      logo: { arquivo: SHA },
      restricoes: ['nunca foto de pessoa'],
    });
    const daPeca = vi.fn(async () => ({ itens: [{ entrada: { tipo: 'ajuste', pedido: 'x' } }, { entrada: { tipo: 'briefing', briefing: daTarefa, cuidado: 'direto' } }] }) as never);
    const { tarefas, servicos } = await montar({ servicos: [{ tarefas: { daPeca } }, { marcas: [CAFE] }], origem: { pecaId: 'peca-antiga' } });
    expect(servicos.tarefas).toHaveBeenCalledWith('peca-antiga');
    expect(titulo().value).toBe('Abrimos às 7h');
    expect(campo(textos.campos.rodape).value).toBe('');
    await act(async () => fireEvent.click(criar()));
    const pedido = pedidoFeito(tarefas);
    expect(pedido.cuidado).toBe('direto');
    expect(pedido.briefing).toEqual({ versao: 1, marcaId: ID_DA_MARCA, formatos: [{ nome: 'Feed', largura: 1080, altura: 1350 }], textos: { titulo: 'Abrimos às 7h' }, imagens: { fonte: 'nenhuma' } });
    // é uma peça NOVA: a tarefa é pedida na peça criada agora, não na antiga
    expect(servicos.tarefas).toHaveBeenLastCalledWith(ID_DA_PECA);
  });

  it('?peca= de uma peça que não nasceu de briefing: diz isso e abre em branco', async () => {
    await montar({ origem: { pecaId: 'peca-antiga' } });
    expect(screen.getByText(textos.comecarDe.daPecaSemBriefing)).toBeDefined();
    expect(titulo().value).toBe('');
  });

  it('as marcas não carregaram: o formulário segue sem marca e diz, em vez de travar', async () => {
    await montar({ servicos: [{ cadastros: { marcas: vi.fn(async () => undefined) } }] });
    expect(screen.getByText(textos.marca.naoCarregou)).toBeDefined();
    preencherOMinimo();
    expect(criar().disabled).toBe(false);
  });
});
