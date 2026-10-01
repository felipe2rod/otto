// Tudo o que é do produto mora sob /editor, para existir UMA fronteira a vigiar (ADR 019).
// Dinâmico (nada daqui entra no tempo de build) e fora dos buscadores.
// Provedor de cliente, quando houver, mora AQUI, nunca no layout raiz.
//
// Sem login no MVP (ADR 035): a API resolve uma conta fixa. Quando o login entrar, é este layout
// que lê a sessão para o cabeçalho, e o redirecionamento sem cookie fica no proxy do Next.
// A API continua sendo a fronteira: nada aqui é autorização.
import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function LayoutDoEditor({ children }: { children: ReactNode }) {
  return children;
}
