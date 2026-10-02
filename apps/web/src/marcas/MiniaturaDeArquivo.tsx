'use client';

// Logo ou ícone já enviado, mostrado pelo hash. O vetor aparece COMO O OTTO O ENTENDEU (a miniatura é
// um SVG que o servidor monta dos caminhos lidos): o designer vê em dois segundos se o logo chegou
// inteiro (experiencia.md, 3.3). Logo em imagem aparece pelos próprios bytes.
import { useEffect, useState } from 'react';
import { type ApiDeArquivos, enderecoDaMiniatura, enderecoDoArquivo } from '../api/arquivos';
import type { ArquivoDaMarca } from './dadosDaMarca';

type Leitor = Pick<ApiDeArquivos, 'dados' | 'vetor'>;

export function MiniaturaDeArquivo({ arquivo, arquivos, alt, className }: { arquivo: ArquivoDaMarca; arquivos: Leitor; alt: string; className?: string }) {
  const conhecido = arquivo.miniatura ? enderecoDaMiniatura(arquivo.miniatura) : arquivo.imagem ? enderecoDoArquivo(arquivo.sha256) : undefined;
  const [lido, setLido] = useState<{ sha256: string; endereco: string } | null>(null);

  useEffect(() => {
    if (conhecido) return;
    let desmontado = false;
    void (async () => {
      // marca vinda do servidor traz só o hash: pergunta o que é antes de escolher como mostrar
      const dados = await arquivos.dados(arquivo.sha256);
      const vetor = dados?.especie === 'vetor' ? await arquivos.vetor(arquivo.sha256) : undefined;
      const endereco = vetor?.miniatura ? enderecoDaMiniatura(vetor.miniatura) : dados?.especie === 'imagem' ? enderecoDoArquivo(arquivo.sha256) : undefined;
      if (!desmontado && endereco) setLido({ sha256: arquivo.sha256, endereco });
    })();
    return () => {
      desmontado = true;
    };
  }, [arquivo.sha256, conhecido, arquivos]);

  const endereco = conhecido ?? (lido?.sha256 === arquivo.sha256 ? lido.endereco : undefined);
  // enquanto não se sabe o que é, o lugar fica guardado (sem imagem quebrada)
  if (!endereco) return <span className={className} role="img" aria-label={alt} data-carregando="sim" />;
  // biome-ignore lint/performance/noImgElement: SVG em data: ou bytes da API; não passa pelo otimizador de imagens
  return <img className={className} src={endereco} alt={alt} />;
}
