// Configuração da ferramenta de migração (Prisma). A URL é a do papel MIGRADOR, que só existe
// no serviço "migracao" e no serviço "teste" do compose. API e worker nunca recebem essa URL.
// `prisma generate` não precisa de banco: por isso a URL pode faltar aqui.
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env.BANCO_URL_MIGRADOR ?? 'postgresql://sem-banco.invalid:5432/otto',
  },
});
