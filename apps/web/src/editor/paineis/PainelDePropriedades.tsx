'use client';

// Painel de propriedades da seleção. Veio de poc/src/web/componentes/Propriedades.tsx.
// Cada confirmação é UM lote do catálogo (`alterar` ou `alterarPrancheta`), pelo `aplicar` do
// ambiente. Assina só o nó selecionado: mexer em outra camada não renderiza este painel.
//
// Nesta fatia: nome, posição, tamanho, rotação, opacidade, mesclagem, texto, cor, forma, imagem e
// prancheta. Ficam para depois: máscara, efeitos, filtros, ajuste de cor da foto, camada de ajuste,
// degradê, cores do vetor, tokens e estilos de texto da identidade.
import { type Documento, MODOS_DE_MESCLAGEM, type No, type Prancheta } from '@otto/documento';
import { pesoMaisProximo } from '@otto/shared';
import { useEffect, useId, useState } from 'react';
import { EscolhaDeFamilia } from '../../fontes/EscolhaDeFamilia';
import { editor as textos } from '../../textos/editor';
import { type FamiliaDeFonte, useAmbiente } from '../ambiente';
import { acharNoPorId, loteDeAlterar } from '../nucleo/acoes';
import { useArmazem } from '../nucleo/armazem';
import { Campo, CampoDeCor, escreverNumero, Grupo, lerNumero, TextoLongo } from './campos';
import estilos from './PainelDePropriedades.module.css';

const p = textos.propriedades;
const PESOS = [300, 400, 500, 600, 700] as const;
const entre = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

export function PainelDePropriedades() {
  const ambiente = useAmbiente();
  const selecao = useArmazem(ambiente.interface.armazem, (e) => e.selecao);
  const travado = useArmazem(ambiente.somenteLeitura, (v) => v);
  const idDoNo = selecao?.tipo === 'camadas' && selecao.ids.length === 1 ? selecao.ids[0] : undefined;
  const idDaPrancheta = selecao?.tipo === 'prancheta' ? selecao.id : undefined;
  // devolvem o MESMO objeto enquanto o nó não muda: lote em outra camada não renderiza o painel
  const no = useArmazem(ambiente.documento, (d) => (d && idDoNo ? acharNoPorId(d, idDoNo)?.no : undefined));
  const prancheta = useArmazem(ambiente.documento, (d) => (d && idDaPrancheta ? d.pranchetas.find((x) => x.id === idDaPrancheta) : undefined));
  // os tokens de cor: o objeto só muda quando um token muda
  const tokens = useArmazem(ambiente.documento, (d) => d?.tokens);
  const idDoTitulo = useId();
  const doc = ambiente.documento.obter();

  return (
    <section className={estilos.painel} aria-labelledby={idDoTitulo}>
      <div className={estilos.cabecalho}>
        <h2 id={idDoTitulo} className={estilos.titulo}>
          {textos.paineis.propriedades.titulo}
        </h2>
      </div>
      <div className={estilos.corpo}>
        {selecao?.tipo === 'camadas' && selecao.ids.length > 1 && <p className={estilos.vazio}>{p.variasCamadas(selecao.ids.length)}</p>}
        {!no && !prancheta && !(selecao?.tipo === 'camadas' && selecao.ids.length > 1) && <p className={estilos.vazio}>{textos.paineis.propriedades.vazio}</p>}
        {prancheta && doc && tokens && <DaPrancheta prancheta={prancheta} doc={doc} travado={travado} />}
        {no && doc && tokens && <DoNo no={no} doc={doc} travado={travado} />}
      </div>
    </section>
  );
}

function DaPrancheta({ prancheta, doc, travado }: { prancheta: Prancheta; doc: Documento; travado: boolean }) {
  const { aplicar } = useAmbiente();
  const alterar = (props: Record<string, unknown>, propriedade: string) =>
    aplicar({ descricao: textos.historico.alterar(propriedade, prancheta.nome), operacoes: [{ op: 'alterarPrancheta', prancheta: prancheta.id, props }] });
  return (
    <Grupo titulo={p.grupos.prancheta}>
      <Campo largo rotulo={p.nome} valor={prancheta.nome} desativado={travado} aoConfirmar={(v) => v.trim() && alterar({ nome: v.trim() }, p.nome)} />
      <CampoDeCor rotulo={p.fundo} valor={prancheta.fundo} doc={doc} desativado={travado} aoConfirmar={(cor) => alterar({ fundo: cor }, p.fundo)} />
    </Grupo>
  );
}

function DoNo({ no, doc, travado }: { no: No; doc: Documento; travado: boolean }) {
  const { aplicar, trocarImagem } = useAmbiente();
  const desativado = travado || no.bloqueado;
  const alterar = (props: Record<string, unknown>, propriedade: string) => aplicar(loteDeAlterar(no, props, propriedade));
  /** Campo numérico: lê o texto, transforma e manda. O Campo já recusou o que não é número. */
  const numero =
    (chave: string, propriedade: string, transformar: (n: number) => number = (n) => n) =>
    (texto: string) => {
      const n = lerNumero(texto);
      if (n !== undefined) alterar({ [chave]: transformar(n) }, propriedade);
    };
  const visual = no.tipo !== 'grupo' && no.tipo !== 'ajuste' ? no : undefined;

  return (
    <>
      {no.bloqueado && <p className={estilos.nota}>{p.bloqueada}</p>}
      <Grupo titulo={p.grupos[no.tipo]}>
        <Campo largo rotulo={p.nome} valor={no.nome} desativado={desativado} aoConfirmar={(v) => v.trim() && v.trim() !== no.nome && alterar({ nome: v.trim() }, p.nome)} />
        {visual && (
          <>
            <Campo numerico rotulo={p.x} valor={escreverNumero(visual.x)} desativado={desativado} aoConfirmar={numero('x', p.x)} />
            <Campo numerico rotulo={p.y} valor={escreverNumero(visual.y)} desativado={desativado} aoConfirmar={numero('y', p.y)} />
            <Campo numerico rotulo={p.largura} valor={escreverNumero(visual.largura)} desativado={desativado} aoConfirmar={numero('largura', p.largura, (n) => Math.max(1, n))} />
            <Campo numerico rotulo={p.altura} valor={escreverNumero(visual.altura)} desativado={desativado} aoConfirmar={numero('altura', p.altura, (n) => Math.max(1, n))} />
            <Campo numerico rotulo={p.rotacao} valor={escreverNumero(visual.rotacao)} desativado={desativado} aoConfirmar={numero('rotacao', p.rotacao, (n) => entre(n, -360, 360))} />
          </>
        )}
        <Campo numerico rotulo={p.opacidade} valor={escreverNumero(no.opacidade * 100)} desativado={desativado} aoConfirmar={numero('opacidade', p.opacidade, (n) => entre(n / 100, 0, 1))} />
        {no.tipo !== 'ajuste' && (
          <label className={estilos.campo} data-largo="sim">
            <span>{p.mesclagem}</span>
            <select aria-label={p.mesclagem} value={no.modoDeMesclagem} disabled={desativado} onChange={(e) => alterar({ modoDeMesclagem: e.target.value }, p.mesclagem)}>
              {no.tipo === 'grupo' && <option value="atravessar">{textos.mesclagem.atravessar}</option>}
              {MODOS_DE_MESCLAGEM.map((modo) => (
                <option key={modo} value={modo}>
                  {textos.mesclagem[modo]}
                </option>
              ))}
            </select>
          </label>
        )}
      </Grupo>

      {no.tipo === 'texto' && (
        <Grupo titulo={p.grupos.tipografia}>
          <TextoLongo rotulo={p.conteudo} valor={no.conteudo} desativado={desativado} aoConfirmar={(v) => alterar({ conteudo: v }, p.conteudo)} />
          <EscolhaDeFonte familia={no.fonte} peso={no.peso} desativado={desativado} aoEscolherFamilia={(f) => alterar({ fonte: f }, p.fonte)} aoEscolherPeso={(n) => alterar({ peso: n }, p.peso)} />
          <Campo numerico rotulo={p.tamanho} valor={escreverNumero(no.tamanho)} desativado={desativado} aoConfirmar={numero('tamanho', p.tamanho, (n) => Math.max(1, n))} />
          <Campo numerico rotulo={p.entrelinha} valor={escreverNumero(no.entrelinha)} desativado={desativado} aoConfirmar={numero('entrelinha', p.entrelinha, (n) => Math.max(0.1, n))} />
          <Campo numerico rotulo={p.tracking} valor={escreverNumero(no.espacamento)} desativado={desativado} aoConfirmar={numero('espacamento', p.tracking)} />
          <div className={estilos.campo} data-largo="sim">
            <span>{p.alinhamento}</span>
            {/* biome-ignore lint/a11y/useSemanticElements: são botões de alternar lado a lado, não um conjunto de campos de formulário */}
            <div className={estilos.segmentado} role="group" aria-label={p.alinhamento}>
              {(['esquerda', 'centro', 'direita'] as const).map((a) => (
                <button key={a} type="button" disabled={desativado} aria-pressed={no.alinhamento === a} onClick={() => alterar({ alinhamento: a }, p.alinhamento)}>
                  {p.alinhamentos[a]}
                </button>
              ))}
              <button type="button" disabled={desativado} aria-pressed={no.caixaAlta} aria-label={p.caixaAlta} title={p.caixaAlta} onClick={() => alterar({ caixaAlta: !no.caixaAlta }, p.caixaAlta)}>
                <span aria-hidden="true">{p.siglaDeCaixaAlta}</span>
              </button>
            </div>
          </div>
          <CampoDeCor rotulo={p.cor} valor={no.cor} doc={doc} desativado={desativado} aoConfirmar={(cor) => alterar({ cor }, p.cor)} />
        </Grupo>
      )}

      {no.tipo === 'forma' && (
        <Grupo titulo={p.grupos.forma}>
          {typeof no.preenchimento === 'string' ? (
            <CampoDeCor rotulo={p.preenchimento} valor={no.preenchimento} doc={doc} desativado={desativado} aoConfirmar={(cor) => alterar({ preenchimento: cor }, p.preenchimento)} />
          ) : (
            <p className={estilos.nota}>{p.degrade}</p>
          )}
          {no.forma === 'retangulo' && <Campo numerico rotulo={p.raio} valor={escreverNumero(no.raio)} desativado={desativado} aoConfirmar={numero('raio', p.raio, (n) => Math.max(0, n))} />}
        </Grupo>
      )}

      {no.tipo === 'imagem' && (
        <Grupo titulo={p.grupos.imagem}>
          <div className={estilos.campo} data-largo="sim">
            <span>{p.medidasDaImagem(no.larguraOriginal, no.alturaOriginal)}</span>
            {no.origem && <span data-origem-da-imagem>{p.origemDaImagem(no.origem.banco, no.origem.autor, no.origem.licenca)}</span>}
            {/* o campo de arquivo é o controle: o rótulo dá a ele a cara de botão */}
            <label className={estilos.botaoDeArquivo} data-desligado={desativado ? 'sim' : undefined}>
              {p.trocarImagem}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                disabled={desativado}
                aria-label={p.trocarImagem}
                onChange={(e) => {
                  const arquivo = e.target.files?.[0];
                  e.target.value = '';
                  if (arquivo) void trocarImagem(no, arquivo);
                }}
              />
            </label>
          </div>
          <label className={estilos.campo}>
            <span>{p.ajuste}</span>
            <select aria-label={p.ajuste} value={no.ajuste} disabled={desativado} onChange={(e) => alterar({ ajuste: e.target.value }, p.ajuste)}>
              <option value="cobrir">{p.ajustes.cobrir}</option>
              <option value="conter">{p.ajustes.conter}</option>
            </select>
          </label>
          {no.ajuste === 'cobrir' && (
            <>
              <Campo numerico rotulo={p.zoomDaFoto} valor={escreverNumero(no.zoom * 100)} desativado={desativado} aoConfirmar={numero('zoom', p.zoomDaFoto, (n) => entre(n / 100, 1, 4))} />
              <Campo
                numerico
                rotulo={p.focoX}
                valor={escreverNumero(no.foco.x * 100)}
                desativado={desativado}
                aoConfirmar={(t) => {
                  const n = lerNumero(t);
                  if (n !== undefined) alterar({ foco: { ...no.foco, x: entre(n / 100, 0, 1) } }, p.focoX);
                }}
              />
              <Campo
                numerico
                rotulo={p.focoY}
                valor={escreverNumero(no.foco.y * 100)}
                desativado={desativado}
                aoConfirmar={(t) => {
                  const n = lerNumero(t);
                  if (n !== undefined) alterar({ foco: { ...no.foco, y: entre(n / 100, 0, 1) } }, p.focoY);
                }}
              />
            </>
          )}
        </Grupo>
      )}

      {(no.mascara || ('efeitos' in no && no.efeitos) || ('filtros' in no && no.filtros?.length) || no.tipo === 'ajuste' || no.tipo === 'vetor') && <p className={estilos.nota}>{p.foraDoPainel}</p>}
    </>
  );
}

/** Família e peso, da biblioteca de fontes. A família que a camada usa aparece mesmo se a biblioteca não a tiver. */
function EscolhaDeFonte({
  familia,
  peso,
  desativado,
  aoEscolherFamilia,
  aoEscolherPeso,
}: {
  familia: string;
  peso: number;
  desativado: boolean;
  aoEscolherFamilia: (f: string) => void;
  aoEscolherPeso: (p: number) => void;
}) {
  const { listarFontes, trazerFonte } = useAmbiente();
  // nulo até a biblioteca responder: sem ela não dá para dizer que a fonte falta
  const [familias, setFamilias] = useState<FamiliaDeFonte[] | null>(null);
  /** O que chegou do catálogo nesta sessão: a lista lida ao abrir ainda diz que não está na biblioteca. */
  const [trazidas, setTrazidas] = useState<ReadonlySet<string>>(new Set());
  useEffect(() => {
    let desmontado = false;
    void listarFontes().then((lista) => !desmontado && setFamilias(lista));
    return () => {
      desmontado = true;
    };
  }, [listarFontes]);
  const naBiblioteca = (f: FamiliaDeFonte) => f.naBiblioteca !== false || trazidas.has(f.familia);
  const daFamilia = familias?.find((f) => f.familia === familia && naBiblioteca(f))?.pesos;
  // os pesos que a família tem; sem saber, os de costume. O peso do documento aparece sempre
  const pesos = [...new Set([...(daFamilia?.length ? daFamilia : PESOS), peso])].sort((a, b) => a - b);
  // A mesma regra do servidor e da exportação (@otto/shared): o texto é desenhado com o peso mais
  // próximo que a biblioteca tem. O campo continua mostrando o pedido, que é o que está no documento.
  const usado = daFamilia && !daFamilia.includes(peso) ? pesoMaisProximo(daFamilia, peso) : undefined;
  const foraDaBiblioteca = familias !== null && familias.length > 0 && (daFamilia === undefined || daFamilia.length === 0);
  const trazer = async (qual: string, comPeso: number) => {
    const chegou = await trazerFonte(qual, comPeso);
    if (chegou) setTrazidas((antes) => new Set(antes).add(qual));
    return chegou;
  };
  return (
    <>
      {/* não é <label>: o campo tem o aviso de "baixando" junto, e o nome dele não pode levar esse texto */}
      <div className={estilos.campo} data-largo="sim">
        <span>{p.fonte}</span>
        <EscolhaDeFamilia rotulo={p.fonte} valor={familia} catalogo={familias} trazer={trazer} peso={peso} desativado={desativado} aoEscolher={aoEscolherFamilia} />
      </div>
      <label className={estilos.campo}>
        <span>{p.peso}</span>
        <select aria-label={p.peso} value={peso} disabled={desativado} onChange={(e) => aoEscolherPeso(Number(e.target.value))}>
          {pesos.map((n) => (
            <option key={n} value={n}>
              {p.pesos[n] ?? n}
            </option>
          ))}
        </select>
      </label>
      {usado !== undefined && (
        <p className={estilos.avisoDoCampo} role="status">
          {p.pesoTrocado(peso, usado)}
        </p>
      )}
      {foraDaBiblioteca && (
        <p className={estilos.avisoDoCampo} role="status">
          {p.fonteForaDaBiblioteca}
        </p>
      )}
    </>
  );
}
