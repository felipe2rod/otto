'use client';

// Bancada: o editor aberto com um documento de exemplo fixo, sem API. SÓ DE DESENVOLVIMENTO: a
// rota que a monta (app/editor/bancada/page.dev.tsx) não existe no build de produção.
// Serve para ver o motor desenhando e o gesto virando operação antes de a API ter documentos.
import { useState } from 'react';
import { bancada as textos } from '../../textos/bancada';
import { criarMotor, type FabricaDeMotor, type MotorDeRender } from '../canvas/motor';
import { Editor } from '../Editor';
import type { FonteDaPeca } from '../fonteDaPeca';
import { FONTES_DE_EXEMPLO } from './documentoDeExemplo';
import { criarFonteDeExemplo, type FonteDeExemplo } from './fonteDeExemplo';
import { gerarImagemDeExemplo } from './imagemDeExemplo';

// O empacotador precisa ver cada arquivo escrito por extenso para servi-lo como estático.
const ENDERECO_DAS_FONTES: Readonly<Record<(typeof FONTES_DE_EXEMPLO)[number]['arquivo'], string>> = {
  'Anton-Regular.ttf': new URL('./fontes/Anton-Regular.ttf', import.meta.url).href,
  'IBMPlexSans-Regular.ttf': new URL('./fontes/IBMPlexSans-Regular.ttf', import.meta.url).href,
};

async function buscarFonte(arquivo: string): Promise<ArrayBuffer> {
  const endereco = ENDERECO_DAS_FONTES[arquivo as keyof typeof ENDERECO_DAS_FONTES];
  const resposta = await fetch(endereco);
  if (!resposta.ok) throw new Error(`fonte de exemplo: ${resposta.status} em ${endereco}`);
  return resposta.arrayBuffer();
}

/** O que a bancada deixa à mão no console (window.__ottoBancada), para medir e conferir. */
interface Instrumentos {
  motor?: MotorDeRender;
  lotes: FonteDeExemplo['lotes'];
  /** Ids das pranchetas do documento de exemplo, na ordem (para pedir o render de referência). */
  pranchetas: string[];
}

export function Bancada() {
  const [fonte] = useState(() => criarFonteDeExemplo({ gerarImagem: gerarImagemDeExemplo, buscarFonte, nomeDaPeca: textos.nomeDaPeca }));
  const [criarMotorDaBancada] = useState(() => {
    const fabrica: FabricaDeMotor = async (canvas, recursos) => {
      const motor = await criarMotor(canvas, recursos);
      const aberta = await fonte.abrirPeca('exemplo');
      const pranchetas = aberta.estado === 'aberta' ? aberta.peca.arvore.pranchetas.map((p) => p.id) : [];
      const instrumentos: Instrumentos = { motor, lotes: fonte.lotes, pranchetas };
      (window as unknown as { __ottoBancada?: Instrumentos }).__ottoBancada = instrumentos;
      return motor;
    };
    return fabrica;
  });
  // A bancada não tem servidor: o lote é confirmado aqui mesmo, e desfazer não existe (é da API).
  const [fonteDaPeca] = useState<FonteDaPeca>(() => ({
    abrir: fonte.abrirPeca,
    lotes: {
      enviar: fonte.enviarLote,
      desfazer: async () => ({ ok: false, codigo: 'nada_para_desfazer' }),
      refazer: async () => ({ ok: false, codigo: 'nada_para_refazer' }),
    },
    recursos: fonte.recursos,
    listarFontes: async () => FONTES_DE_EXEMPLO.map((f) => ({ familia: f.familia, pesos: [f.peso] })),
  }));
  return <Editor pecaId="exemplo" fonte={fonteDaPeca} criarMotor={criarMotorDaBancada} />;
}
