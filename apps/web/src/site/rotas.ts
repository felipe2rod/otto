// As rotas públicas, escritas à mão. O sitemap sai desta lista, nunca de varredura da pasta app/
// (ADR 019, item 4): rota de /editor não pode entrar por engano.
export const ROTAS_PUBLICAS = ['/'] as const;

/** Endereço público do site. Fixado por variável de ambiente no deploy; o padrão é o domínio do produto. */
export const ENDERECO_PUBLICO = process.env.ENDERECO_PUBLICO ?? 'https://ottobr.ai';
