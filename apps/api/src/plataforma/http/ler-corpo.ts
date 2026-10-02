// Lê o corpo de uma requisição como bytes, com teto, DENTRO da rota: depois da guarda de escopo (ninguém manda
// 100 MB sem ter passado por ela) e só na rota que aceita arquivo grande. Os leitores gerais de corpo
// (aplicacao.ts) têm tetos pequenos e não conhecem o tipo deste envio.
// - com o tamanho declarado, o espaço é reservado uma vez (o arquivo não existe duas vezes na memória);
// - acima do teto, nada mais é guardado. O resto do envio é lido e jogado fora até duas vezes o teto, para quem
//   mandou um arquivo um pouco grande demais receber a resposta 413 (fechar a conexão no meio do envio vira erro
//   de rede no navegador, sem resposta); passou disso, a conexão é derrubada.
import type { IncomingMessage, ServerResponse } from 'node:http';

/** O corpo passou do teto (pelo tamanho declarado ou pelo que chegou). */
export class CorpoGrandeDemais extends Error {
  constructor(readonly limiteEmBytes: number) {
    super('corpo acima do teto');
    this.name = 'CorpoGrandeDemais';
  }
}

/** A conexão caiu, ou o corpo veio com tamanho diferente do declarado. */
export class CorpoInterrompido extends Error {
  constructor() {
    super('o envio foi interrompido');
    this.name = 'CorpoInterrompido';
  }
}

export function lerCorpoComTeto(req: IncomingMessage, res: Pick<ServerResponse, 'setHeader'>, limiteEmBytes: number): Promise<Buffer> {
  return new Promise<Buffer>((resolver, rejeitar) => {
    const declarado = Number(req.headers['content-length'] ?? Number.NaN);
    const descarteNoMaximo = limiteEmBytes * 2;
    /** Recusa já, e segue lendo sem guardar, até o teto do descarte. */
    const recusar = (jaLidos: number) => {
      rejeitar(new CorpoGrandeDemais(limiteEmBytes));
      if (Number.isFinite(declarado) && declarado - jaLidos > descarteNoMaximo) {
        // grande demais até para jogar fora: a conexão fecha com a resposta, e o resto do envio não é lido
        res.setHeader('Connection', 'close');
        return void req.pause();
      }
      let descartados = 0;
      req.on('data', (pedaco: Buffer) => {
        descartados += pedaco.byteLength;
        if (descartados > descarteNoMaximo) req.destroy();
      });
      req.on('error', () => undefined);
      req.resume();
    };
    if (Number.isFinite(declarado) && declarado > limiteEmBytes) return recusar(0);

    const reservado = Number.isInteger(declarado) && declarado >= 0 ? Buffer.allocUnsafe(declarado) : undefined;
    const pedacos: Buffer[] = [];
    let lidos = 0;
    const soltar = () => {
      req.off('data', aoChegar);
      req.off('end', aoTerminar);
      req.off('error', aoCair);
      req.off('aborted', aoCair);
    };
    const aoChegar = (pedaco: Buffer) => {
      if (lidos + pedaco.byteLength > limiteEmBytes || (reservado && lidos + pedaco.byteLength > reservado.byteLength)) {
        soltar();
        return recusar(lidos + pedaco.byteLength);
      }
      if (reservado) pedaco.copy(reservado, lidos);
      else pedacos.push(pedaco);
      lidos += pedaco.byteLength;
    };
    const aoTerminar = () => {
      soltar();
      if (reservado && lidos !== reservado.byteLength) return rejeitar(new CorpoInterrompido());
      resolver(reservado ?? Buffer.concat(pedacos, lidos));
    };
    const aoCair = () => {
      soltar();
      rejeitar(new CorpoInterrompido());
    };
    req.on('data', aoChegar);
    req.on('end', aoTerminar);
    req.on('error', aoCair);
    req.on('aborted', aoCair);
  });
}
