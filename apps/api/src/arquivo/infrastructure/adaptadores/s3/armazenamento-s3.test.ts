// O mesmo contrato dos outros adaptadores, contra um servidor compatível com S3 de verdade
// (serviço "armazenamento" do compose). Sem rede externa: o servidor é local.
import { randomUUID } from 'node:crypto';
import { contratoDoArmazenamentoDeArquivo } from '../../../application/armazenamento-de-arquivo.contrato';
import { ArmazenamentoS3 } from './armazenamento-s3';

function exigir(nome: string): string {
  const valor = process.env[nome];
  if (!valor) throw new Error(`${nome} ausente: este teste roda por "docker compose run --rm teste"`);
  return valor;
}

contratoDoArmazenamentoDeArquivo('compatível com S3', async () => {
  const armazenamento = new ArmazenamentoS3({
    endereco: exigir('ARMAZENAMENTO_S3_DE_TESTE_ENDERECO'),
    regiao: 'us-east-1',
    bucket: exigir('ARMAZENAMENTO_S3_DE_TESTE_BUCKET'),
    chaveDeAcesso: exigir('ARMAZENAMENTO_S3_DE_TESTE_CHAVE_DE_ACESSO'),
    chaveSecreta: exigir('ARMAZENAMENTO_S3_DE_TESTE_CHAVE_SECRETA'),
    // cada execução num prefixo próprio do bucket de teste: uma não vê o resto da outra
    prefixo: `teste-${randomUUID()}`,
  });
  return {
    armazenamento,
    // o link do S3 é seguido direto no servidor de objetos, sem passar pela API
    baixar: async (link) => {
      const r = await fetch(link);
      return { status: r.status, ...(r.ok ? { bytes: new Uint8Array(await r.arrayBuffer()) } : {}), disposicao: r.headers.get('content-disposition'), tipo: r.headers.get('content-type') };
    },
    limpar: async () => armazenamento.fechar(),
  };
});
