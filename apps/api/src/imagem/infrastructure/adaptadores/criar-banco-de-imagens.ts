// Escolhe o adaptador do banco de imagens pela configuração, uma vez, na subida (ADR 020). É o único lugar
// fora da configuração que conhece o nome do banco: quem monta a aplicação recebe só a porta.
import type { Configuracao } from '../../../plataforma/config/configuracao';
import type { BancoDeImagens } from '../../application/banco-de-imagens';
import { BancoPixabay } from './pixabay/banco-pixabay';

/** undefined: este servidor não tem banco de imagens configurado. */
export function criarBancoDeImagens(config: Configuracao['bancoDeImagens']): BancoDeImagens | undefined {
  return config.adaptador === 'pixabay' ? new BancoPixabay({ chave: config.chave }) : undefined;
}
