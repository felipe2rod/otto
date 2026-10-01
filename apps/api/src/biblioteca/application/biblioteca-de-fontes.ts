// Porta: a biblioteca de fontes do Otto. As fontes são arquivos nossos, nunca do sistema
// operacional (ADR 027, item 7), e iguais para todas as contas: não há escopo de conta aqui.
export interface FonteRegistrada {
  familia: string;
  peso: number;
  nomePostScript: string | null;
  sha256: string;
  bytes: number;
}

export interface NovaFonte {
  familia: string;
  peso: number;
  nomePostScript: string | null;
  licenca: string | null;
  conteudo: Uint8Array;
}

export abstract class BibliotecaDeFontes {
  /** Famílias com os pesos que existem, em ordem alfabética. `busca` filtra por parte do nome, sem diferenciar maiúscula. */
  abstract listar(busca?: string): Promise<{ familia: string; pesos: number[] }[]>;
  /** As fontes de uma família, da mais leve para a mais pesada. Lista vazia se a família não existe. */
  abstract pesosDa(familia: string): Promise<FonteRegistrada[]>;
  abstract bytes(fonte: FonteRegistrada): Promise<Uint8Array | undefined>;
  /** Registra. Se a família e o peso já existem, devolve a que existe, sem trocar o arquivo. */
  abstract registrar(nova: NovaFonte): Promise<FonteRegistrada>;
}
